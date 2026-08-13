import { coreQuery, metadataQuery, saveTokens } from './client';

// Twenty's two-step credential login: credentials -> short-lived loginToken,
// then loginToken -> access + refresh tokens.
export const login = async (email: string, password: string) => {
  const origin = window.location.origin;

  const step1 = await metadataQuery<{
    getLoginTokenFromCredentials: { loginToken: { token: string } };
  }>(
    `mutation Login($email: String!, $password: String!, $origin: String!) {
      getLoginTokenFromCredentials(email: $email, password: $password, origin: $origin) {
        loginToken { token }
      }
    }`,
    { email, password, origin },
  );

  const loginToken = step1.getLoginTokenFromCredentials.loginToken.token;

  const step2 = await metadataQuery<{
    getAuthTokensFromLoginToken: {
      tokens: {
        accessOrWorkspaceAgnosticToken: { token: string };
        refreshToken: { token: string };
      };
    };
  }>(
    `mutation GetTokens($loginToken: String!, $origin: String!) {
      getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
        tokens {
          accessOrWorkspaceAgnosticToken { token }
          refreshToken { token }
        }
      }
    }`,
    { loginToken, origin },
  );

  saveTokens({
    email,
    accessToken:
      step2.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken
        .token,
    refreshToken: step2.getAuthTokensFromLoginToken.tokens.refreshToken.token,
  });
};

export const logout = () => {
  saveTokens(null);
};

// 'external' is a marketer or referral partner: someone outside the company who
// only ever sees the leads they brought and the tasks assigned to them. The
// server enforces that through the owner-scope engine; the app hides what they
// would only get empty screens for anyway.
export type SalesRole = 'admin' | 'seller' | 'external';

export type LinkedPartner = {
  id: string;
  name: string;
  partnerType: string | null;
};

export type CurrentUser = {
  workspaceMemberId: string;
  firstName: string;
  lastName: string;
  userEmail: string;
  // True when the account can read the roles list — the same PERMISSIONS gate
  // the admin section uses. Drives admin-only UI (see-all-tasks, reassign).
  isAdmin: boolean;
  role: SalesRole;
  // The partner record this login is attached to, for an external user. Null
  // for employees. Its id is what new leads are credited to.
  partner: LinkedPartner | null;
};

// Best-effort admin probe: success on getRoles means the account holds the
// PERMISSIONS setting, which is how the app defines "admin".
const probeIsAdmin = async (): Promise<boolean> => {
  try {
    await metadataQuery(`query IsAdminProbe { getRoles { id } }`);
    return true;
  } catch {
    return false;
  }
};

// An account is external exactly when a partner record points at it. That link
// is the same one an admin creates when onboarding a marketer, and the same one
// the server's owner-scope rules read, so the UI and the data layer cannot
// disagree about who someone is.
//
// Resolves to null on any failure: on a server that has not been provisioned
// yet the `member` field does not exist and the query is a validation error,
// which must degrade to "employee", not to a broken login.
const fetchLinkedPartner = async (
  workspaceMemberId: string,
): Promise<LinkedPartner | null> => {
  try {
    const data = await coreQuery<{
      partners: { edges: { node: LinkedPartner }[] };
    }>(
      `query MyPartnerProfile($memberId: UUID!) {
        partners(filter: { memberId: { eq: $memberId } }, first: 1) {
          edges { node { id name partnerType } }
        }
      }`,
      { memberId: workspaceMemberId },
    );

    return data.partners.edges[0]?.node ?? null;
  } catch {
    return null;
  }
};

export const fetchCurrentUser = async (): Promise<CurrentUser> => {
  const data = await metadataQuery<{
    currentUser: {
      email: string;
      workspaceMember: {
        id: string;
        name: { firstName: string; lastName: string };
      } | null;
    };
  }>(
    `query CurrentUser {
      currentUser {
        email
        workspaceMember {
          id
          name { firstName lastName }
        }
      }
    }`,
  );

  const member = data.currentUser.workspaceMember;
  if (!member) {
    throw new Error('No workspace member found for this user');
  }

  const isAdmin = await probeIsAdmin();
  // An admin is never external, so skip the lookup rather than pay for it on
  // every load of the busiest account type.
  const partner = isAdmin ? null : await fetchLinkedPartner(member.id);

  return {
    workspaceMemberId: member.id,
    firstName: member.name.firstName,
    lastName: member.name.lastName,
    userEmail: data.currentUser.email,
    isAdmin,
    role: isAdmin ? 'admin' : partner ? 'external' : 'seller',
    partner,
  };
};

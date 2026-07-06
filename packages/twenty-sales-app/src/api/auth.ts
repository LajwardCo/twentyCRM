import { metadataQuery, saveTokens } from './client';

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

export type CurrentUser = {
  workspaceMemberId: string;
  firstName: string;
  lastName: string;
  userEmail: string;
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

  return {
    workspaceMemberId: member.id,
    firstName: member.name.firstName,
    lastName: member.name.lastName,
    userEmail: data.currentUser.email,
  };
};

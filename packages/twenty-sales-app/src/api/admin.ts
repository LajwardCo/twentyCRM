import { coreQuery, metadataQuery } from './client';

// ---------- roles + members (group management) ----------

export type Role = {
  id: string;
  label: string;
  icon: string | null;
  workspaceMembers: { id: string }[];
};

export type Member = {
  id: string;
  name: { firstName: string; lastName: string };
  userEmail: string | null;
};

// Requires the PERMISSIONS settings flag — used as the runtime gate for
// showing the admin section at all.
export const fetchRoles = async (): Promise<Role[]> => {
  const data = await metadataQuery<{ getRoles: Role[] }>(
    `query GetRoles {
      getRoles {
        id
        label
        icon
        workspaceMembers { id }
      }
    }`,
  );
  return data.getRoles.filter((r) => r.label !== 'Admin' || true);
};

export const fetchMembers = async (): Promise<Member[]> => {
  const data = await coreQuery<{
    workspaceMembers: { edges: { node: Member }[] };
  }>(
    `query Members {
      workspaceMembers(first: 100) {
        edges { node { id name { firstName lastName } userEmail } }
      }
    }`,
  );
  return data.workspaceMembers.edges.map((e) => e.node);
};

export const assignRole = async (
  workspaceMemberId: string,
  roleId: string,
): Promise<void> => {
  await metadataQuery(
    `mutation AssignRole($workspaceMemberId: UUID!, $roleId: UUID!) {
      updateWorkspaceMemberRole(workspaceMemberId: $workspaceMemberId, roleId: $roleId) { id }
    }`,
    { workspaceMemberId, roleId },
  );
};

// ---------- member management (invite / edit / delete) ----------

export type Invitation = {
  id: string;
  email: string;
  roleId: string | null;
  expiresAt: string;
  link: string | null;
};

// `link` only exists on WorkspaceInvitation for servers that carry the
// invite-link change. This app is deployed independently of the server, so a
// version-skewed deployment must degrade to a link-less screen instead of
// failing the whole admin view on a GraphQL validation error.
const INVITATION_FIELDS = 'id email roleId expiresAt';
const INVITATION_FIELDS_WITH_LINK = `${INVITATION_FIELDS} link`;

const isMissingLinkFieldError = (error: unknown): boolean =>
  error instanceof Error && /Cannot query field "link"/i.test(error.message);

const withNullLinks = (invitations: Invitation[]): Invitation[] =>
  invitations.map((invitation) => ({
    ...invitation,
    link: invitation.link ?? null,
  }));

export const inviteMember = async (
  email: string,
  roleId?: string,
): Promise<{ result: Invitation[]; errors: string[] }> => {
  const send = async (fields: string) => {
    const data = await metadataQuery<{
      sendInvitations: {
        success: boolean;
        errors: string[];
        result: Invitation[];
      };
    }>(
      `mutation SendInvitations($emails: [String!]!, $roleId: UUID) {
        sendInvitations(emails: $emails, roleId: $roleId) {
          success
          errors
          result { ${fields} }
        }
      }`,
      { emails: [email], roleId: roleId ?? null },
    );
    return {
      result: withNullLinks(data.sendInvitations.result),
      errors: data.sendInvitations.errors,
    };
  };

  try {
    return await send(INVITATION_FIELDS_WITH_LINK);
  } catch (error) {
    if (!isMissingLinkFieldError(error)) throw error;
    return send(INVITATION_FIELDS);
  }
};

export const fetchInvitations = async (): Promise<Invitation[]> => {
  const find = async (fields: string) => {
    const data = await metadataQuery<{ findWorkspaceInvitations: Invitation[] }>(
      `query FindWorkspaceInvitations {
        findWorkspaceInvitations { ${fields} }
      }`,
    );
    return withNullLinks(data.findWorkspaceInvitations);
  };

  try {
    return await find(INVITATION_FIELDS_WITH_LINK);
  } catch (error) {
    if (!isMissingLinkFieldError(error)) throw error;
    return find(INVITATION_FIELDS);
  }
};

export const resendInvitation = async (appTokenId: string): Promise<void> => {
  await metadataQuery(
    `mutation ResendInvite($appTokenId: String!) {
      resendWorkspaceInvitation(appTokenId: $appTokenId) { success }
    }`,
    { appTokenId },
  );
};

export const deleteInvitation = async (appTokenId: string): Promise<void> => {
  await metadataQuery(
    `mutation DeleteInvite($appTokenId: String!) {
      deleteWorkspaceInvitation(appTokenId: $appTokenId)
    }`,
    { appTokenId },
  );
};

export const updateMemberName = async (
  workspaceMemberId: string,
  firstName: string,
  lastName: string,
): Promise<void> => {
  await metadataQuery(
    `mutation UpdateMemberName($input: UpdateWorkspaceMemberSettingsInput!) {
      updateWorkspaceMemberSettings(input: $input)
    }`,
    {
      input: {
        workspaceMemberId,
        update: { name: { firstName, lastName } },
      },
    },
  );
};

export const deleteMember = async (
  workspaceMemberId: string,
): Promise<void> => {
  await metadataQuery(
    `mutation DeleteMember($id: String!) {
      deleteUserFromWorkspace(workspaceMemberIdToDelete: $id) { id }
    }`,
    { id: workspaceMemberId },
  );
};

// ---------- partner <-> login links ----------

// Attaching a partner record to a workspace member is what turns that account
// into an external marketer/partner: the app reads the link to decide what to
// show, and the server's owner-scope rules read it to decide which leads the
// account may see at all. Provisioned by
// tools/sales-crm/provision-external-partners.mjs; absent before that runs, in
// which case the admin screen simply doesn't offer the control.
export type PartnerLink = {
  id: string;
  name: string;
  partnerType: string | null;
  memberId: string | null;
};

export type PartnerLinkSupport =
  | { supported: true; partners: PartnerLink[] }
  | { supported: false };

// Whether this server actually has partner.member.
//
// Deliberately asked of the metadata API rather than inferred from a failed
// record query: the record API answers an unknown field with `null` rather than
// a validation error (verified against production), so selecting `memberId` on
// a server without the field succeeds and returns null for every partner --
// indistinguishable from "nobody is linked yet". Offering the control in that
// state would give an admin a dropdown whose every change silently does
// nothing.
const isPartnerMemberFieldProvisioned = async (): Promise<boolean> => {
  try {
    const data = await metadataQuery<{
      objects: {
        edges: {
          node: {
            nameSingular: string;
            fields: { edges: { node: { name: string } }[] };
          };
        }[];
      };
    }>(
      `query PartnerMemberFieldProbe {
        objects(paging: { first: 500 }) {
          edges {
            node {
              nameSingular
              fields(paging: { first: 500 }) { edges { node { name } } }
            }
          }
        }
      }`,
    );

    const partner = data.objects.edges.find(
      (edge) => edge.node.nameSingular === 'partner',
    );

    return (
      partner?.node.fields.edges.some((f) => f.node.name === 'member') ?? false
    );
  } catch {
    return false;
  }
};

export const fetchPartnerLinks = async (): Promise<PartnerLinkSupport> => {
  if (!(await isPartnerMemberFieldProvisioned())) {
    return { supported: false };
  }

  const data = await coreQuery<{
    partners: { edges: { node: PartnerLink }[] };
  }>(
    `query PartnerLinks {
      partners(first: 200, orderBy: [{ name: AscNullsLast }]) {
        edges { node { id name partnerType memberId } }
      }
    }`,
  );

  return {
    supported: true,
    partners: data.partners.edges.map((e) => e.node),
  };
};

const setPartnerMember = async (
  partnerId: string,
  memberId: string | null,
): Promise<void> => {
  await coreQuery(
    `mutation LinkPartner($id: UUID!, $data: PartnerUpdateInput!) {
      updatePartner(id: $id, data: $data) { id }
    }`,
    { id: partnerId, data: { memberId } },
  );
};

// A member has at most one partner identity, so pointing a new partner record
// at them releases the previous one -- otherwise two partner rows would both
// claim the same login and both would widen what that login can see.
export const linkPartnerToMember = async (
  memberId: string,
  partnerId: string | null,
  currentPartners: PartnerLink[],
): Promise<void> => {
  const previous = currentPartners.find((p) => p.memberId === memberId);

  if (previous && previous.id !== partnerId) {
    await setPartnerMember(previous.id, null);
  }

  if (partnerId !== null) {
    await setPartnerMember(partnerId, memberId);
  }
};

// ---------- competitors ----------

export type Competitor = {
  id: string;
  name: string;
  description: string | null;
  strengths: string | null;
  weaknesses: string | null;
  status: string | null;
  threatLevel: string | null;
  tier: string | null;
  website: { primaryLinkUrl: string | null } | null;
  createdAt: string;
};

const COMPETITOR_FIELDS = `
  id name description strengths weaknesses status threatLevel tier
  website { primaryLinkUrl }
  createdAt
`;

export const fetchCompetitors = async (): Promise<Competitor[]> => {
  const data = await coreQuery<{
    competitors: { edges: { node: Competitor }[] };
  }>(
    `query Competitors {
      competitors(first: 100, orderBy: [{ createdAt: DescNullsLast }]) {
        edges { node { ${COMPETITOR_FIELDS} } }
      }
    }`,
  );
  return data.competitors.edges.map((e) => e.node);
};

export const saveCompetitor = async (
  input: Partial<Competitor> & { name: string },
  id?: string,
): Promise<void> => {
  const payload: Record<string, unknown> = {
    name: input.name,
    description: input.description || null,
    strengths: input.strengths || null,
    weaknesses: input.weaknesses || null,
    status: input.status || null,
    threatLevel: input.threatLevel || null,
    tier: input.tier || null,
    ...(input.website?.primaryLinkUrl
      ? { website: { primaryLinkUrl: input.website.primaryLinkUrl } }
      : {}),
  };
  if (id) {
    await coreQuery(
      `mutation UpdateCompetitor($id: UUID!, $data: CompetitorUpdateInput!) {
        updateCompetitor(id: $id, data: $data) { id }
      }`,
      { id, data: payload },
    );
  } else {
    await coreQuery(
      `mutation CreateCompetitor($data: CompetitorCreateInput!) {
        createCompetitor(data: $data) { id }
      }`,
      { data: payload },
    );
  }
};

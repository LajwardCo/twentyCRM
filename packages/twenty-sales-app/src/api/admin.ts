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

export const inviteMember = async (
  email: string,
  roleId?: string,
): Promise<{ result: Invitation[]; errors: string[] }> => {
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
        result { id email roleId expiresAt link }
      }
    }`,
    { emails: [email], roleId: roleId ?? null },
  );
  return {
    result: data.sendInvitations.result,
    errors: data.sendInvitations.errors,
  };
};

export const fetchInvitations = async (): Promise<Invitation[]> => {
  const data = await metadataQuery<{ findWorkspaceInvitations: Invitation[] }>(
    `query FindWorkspaceInvitations {
      findWorkspaceInvitations { id email roleId expiresAt link }
    }`,
  );
  return data.findWorkspaceInvitations;
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

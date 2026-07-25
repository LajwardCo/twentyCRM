import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { metadataQuery } from './client';
import {
  deleteInvitation,
  deleteMember,
  fetchInvitations,
  inviteMember,
  resendInvitation,
  updateMemberName,
} from './admin';

const mockedMetadataQuery = vi.mocked(metadataQuery);

describe('member management api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inviteMember sends the email + role and returns result with link', async () => {
    mockedMetadataQuery.mockResolvedValue({
      sendInvitations: {
        success: true,
        errors: [],
        result: [
          {
            id: 'i1',
            email: 'a@b.dev',
            roleId: 'r1',
            expiresAt: 'x',
            link: 'https://crm/invite?t=1',
          },
        ],
      },
    });

    const out = await inviteMember('a@b.dev', 'r1');

    expect(mockedMetadataQuery).toHaveBeenCalledWith(
      expect.stringContaining('sendInvitations'),
      { emails: ['a@b.dev'], roleId: 'r1' },
    );
    expect(out.result[0].link).toBe('https://crm/invite?t=1');
    expect(out.errors).toEqual([]);
  });

  it('inviteMember surfaces server errors', async () => {
    mockedMetadataQuery.mockResolvedValue({
      sendInvitations: { success: false, errors: ['already invited'], result: [] },
    });

    const out = await inviteMember('a@b.dev');

    expect(out.errors).toEqual(['already invited']);
  });

  it('fetchInvitations reads pending invitations', async () => {
    mockedMetadataQuery.mockResolvedValue({
      findWorkspaceInvitations: [
        {
          id: 'i1',
          email: 'a@b.dev',
          roleId: null,
          expiresAt: 'x',
          link: 'https://crm/invite?t=1',
        },
      ],
    });

    const out = await fetchInvitations();

    expect(mockedMetadataQuery).toHaveBeenCalledWith(
      expect.stringContaining('findWorkspaceInvitations'),
    );
    expect(out).toHaveLength(1);
  });

  it('deleteMember calls deleteUserFromWorkspace with the member id', async () => {
    mockedMetadataQuery.mockResolvedValue({ deleteUserFromWorkspace: { id: 'm1' } });

    await deleteMember('m1');

    expect(mockedMetadataQuery).toHaveBeenCalledWith(
      expect.stringContaining('deleteUserFromWorkspace'),
      { id: 'm1' },
    );
  });

  it('updateMemberName updates workspace member settings', async () => {
    mockedMetadataQuery.mockResolvedValue({ updateWorkspaceMemberSettings: true });

    await updateMemberName('m1', 'Ada', 'Lovelace');

    expect(mockedMetadataQuery).toHaveBeenCalledWith(
      expect.stringContaining('updateWorkspaceMemberSettings'),
      {
        input: {
          workspaceMemberId: 'm1',
          update: { name: { firstName: 'Ada', lastName: 'Lovelace' } },
        },
      },
    );
  });

  it('resendInvitation and deleteInvitation pass the appTokenId', async () => {
    mockedMetadataQuery.mockResolvedValue({});

    await resendInvitation('t1');
    await deleteInvitation('t1');

    expect(mockedMetadataQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('resendWorkspaceInvitation'),
      { appTokenId: 't1' },
    );
    expect(mockedMetadataQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('deleteWorkspaceInvitation'),
      { appTokenId: 't1' },
    );
  });
});

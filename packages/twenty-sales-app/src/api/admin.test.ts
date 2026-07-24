import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { coreQuery } from './client';
import {
  deleteInvitation,
  deleteMember,
  fetchInvitations,
  inviteMember,
  resendInvitation,
  updateMemberName,
} from './admin';

const mockedCoreQuery = vi.mocked(coreQuery);

describe('member management api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inviteMember sends the email + role and returns result with link', async () => {
    mockedCoreQuery.mockResolvedValue({
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

    expect(mockedCoreQuery).toHaveBeenCalledWith(
      expect.stringContaining('sendInvitations'),
      { emails: ['a@b.dev'], roleId: 'r1' },
    );
    expect(out.result[0].link).toBe('https://crm/invite?t=1');
    expect(out.errors).toEqual([]);
  });

  it('inviteMember surfaces server errors', async () => {
    mockedCoreQuery.mockResolvedValue({
      sendInvitations: { success: false, errors: ['already invited'], result: [] },
    });

    const out = await inviteMember('a@b.dev');

    expect(out.errors).toEqual(['already invited']);
  });

  it('fetchInvitations reads pending invitations', async () => {
    mockedCoreQuery.mockResolvedValue({
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

    expect(mockedCoreQuery).toHaveBeenCalledWith(
      expect.stringContaining('findWorkspaceInvitations'),
    );
    expect(out).toHaveLength(1);
  });

  it('deleteMember calls deleteUserFromWorkspace with the member id', async () => {
    mockedCoreQuery.mockResolvedValue({ deleteUserFromWorkspace: { id: 'm1' } });

    await deleteMember('m1');

    expect(mockedCoreQuery).toHaveBeenCalledWith(
      expect.stringContaining('deleteUserFromWorkspace'),
      { id: 'm1' },
    );
  });

  it('updateMemberName updates workspace member settings', async () => {
    mockedCoreQuery.mockResolvedValue({ updateWorkspaceMemberSettings: true });

    await updateMemberName('m1', 'Ada', 'Lovelace');

    expect(mockedCoreQuery).toHaveBeenCalledWith(
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
    mockedCoreQuery.mockResolvedValue({});

    await resendInvitation('t1');
    await deleteInvitation('t1');

    expect(mockedCoreQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('resendWorkspaceInvitation'),
      { appTokenId: 't1' },
    );
    expect(mockedCoreQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('deleteWorkspaceInvitation'),
      { appTokenId: 't1' },
    );
  });
});

import { AppTokenType } from 'src/engine/core-modules/app-token/app-token.entity';

import { castAppTokenToWorkspaceInvitationUtil } from './cast-app-token-to-workspace-invitation.util';

describe('castAppTokenToWorkspaceInvitationUtil', () => {
  const baseToken = {
    id: 'token-id',
    type: AppTokenType.InvitationToken,
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    context: { email: 'new@member.dev', roleId: 'role-1' },
  } as any;

  it('includes the invite link when one is provided', () => {
    const result = castAppTokenToWorkspaceInvitationUtil(
      baseToken,
      'https://crm.example/invite?inviteToken=abc',
    );

    expect(result).toEqual({
      id: 'token-id',
      email: 'new@member.dev',
      roleId: 'role-1',
      expiresAt: baseToken.expiresAt,
      link: 'https://crm.example/invite?inviteToken=abc',
    });
  });

  it('defaults link to null when none is provided', () => {
    const result = castAppTokenToWorkspaceInvitationUtil(baseToken);

    expect(result.link).toBeNull();
  });
});

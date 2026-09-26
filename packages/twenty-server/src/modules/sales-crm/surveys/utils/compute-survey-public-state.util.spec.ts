import { computeSurveyPublicState } from 'src/modules/sales-crm/surveys/utils/compute-survey-public-state.util';

const NOW = Date.parse('2026-09-26T10:00:00Z');

const openForm = {
  formStatus: 'PUBLISHED' as const,
  publicEnabled: true,
  publishedVersionId: 'v1',
  opensAt: null,
  closesAt: null,
  responseLimit: null,
};

const invitation = (
  overrides: Partial<{
    invitationStatus: 'ACTIVE' | 'USED' | 'REVOKED';
    expiresAt: string | null;
  }> = {},
) => ({
  id: 'i1',
  formId: 'f1',
  campaignId: null,
  companyId: null,
  personId: null,
  opportunityId: null,
  tokenHash: 'h',
  invitationStatus: 'ACTIVE' as const,
  expiresAt: null,
  usedAt: null,
  ...overrides,
});

const state = (
  form: Partial<typeof openForm> = {},
  extra: Partial<Parameters<typeof computeSurveyPublicState>[0]> = {},
) =>
  computeSurveyPublicState({
    form: { ...openForm, ...form },
    now: NOW,
    completedResponses: 0,
    invitation: undefined,
    ...extra,
  });

describe('computeSurveyPublicState', () => {
  it('should be open for a published public form', () => {
    expect(state()).toBe('OPEN');
  });

  it('should be invalid for drafts, archived forms and forms never published', () => {
    expect(state({ formStatus: 'DRAFT' as never })).toBe('INVALID');
    expect(state({ formStatus: 'ARCHIVED' as never })).toBe('INVALID');
    expect(state({ publishedVersionId: null as never })).toBe('INVALID');
  });

  it('should be invalid when the public link is disabled and no invitation is used', () => {
    expect(state({ publicEnabled: false })).toBe('INVALID');
  });

  it('should open an invitation-only form through a valid invitation', () => {
    expect(state({ publicEnabled: false }, { invitation: invitation() })).toBe(
      'OPEN',
    );
  });

  it('should report closed forms as closed', () => {
    expect(state({ formStatus: 'CLOSED' as never })).toBe('CLOSED');
  });

  it('should respect opening and closing dates', () => {
    expect(state({ opensAt: '2026-10-01T00:00:00Z' as never })).toBe(
      'NOT_YET_OPEN',
    );
    expect(state({ closesAt: '2026-09-26T09:59:59Z' as never })).toBe(
      'EXPIRED',
    );
  });

  it('should stop accepting responses at the limit', () => {
    expect(
      state({ responseLimit: 10 as never }, { completedResponses: 10 }),
    ).toBe('LIMIT_REACHED');
    expect(
      state({ responseLimit: 10 as never }, { completedResponses: 9 }),
    ).toBe('OPEN');
  });

  it('should reject unknown, revoked, used and expired invitations', () => {
    expect(state({}, { invitation: null })).toBe('INVALID');
    expect(
      state({}, { invitation: invitation({ invitationStatus: 'REVOKED' }) }),
    ).toBe('INVALID');
    expect(
      state({}, { invitation: invitation({ invitationStatus: 'USED' }) }),
    ).toBe('CLOSED');
    expect(
      state(
        {},
        { invitation: invitation({ expiresAt: '2026-09-25T00:00:00Z' }) },
      ),
    ).toBe('EXPIRED');
  });
});

import { type FormDefinition } from 'twenty-shared/surveys';

import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import { SurveyWriteGuardService } from 'src/modules/sales-crm/surveys/services/survey-write-guard.service';

const question = (
  id: string,
  type: string,
  extra: Record<string, unknown> = {},
) => ({
  kind: 'question',
  id,
  type,
  label: { fa: id },
  required: false,
  audience: 'ALL',
  config: {},
  print: { answerLines: 1 },
  ...extra,
});

const definition = {
  schemaVersion: 1,
  languages: ['fa'],
  presentation: 'ALL_ON_PAGE',
  welcome: { enabled: false, title: {}, body: {} },
  pages: [
    {
      id: 'p1',
      title: {},
      jumps: [],
      items: [
        question('q_name', 'short_text', { required: true }),
        question('q_uses', 'yes_no'),
        question('q_which', 'short_text', {
          visibleWhen: {
            mode: 'ALL',
            conditions: [{ questionId: 'q_uses', op: 'eq', value: true }],
          },
        }),
      ],
    },
  ],
  endings: [{ id: 'e', title: {}, message: {} }],
  appearance: { accent: '#000', showProgress: true, showQuestionNumbers: true },
  print: { instructions: {} },
  crmMapping: [],
  automations: [],
} as unknown as FormDefinition;

const authContext = {
  type: 'user',
  workspace: { id: 'ws' },
  workspaceMemberId: 'member-1',
} as unknown as WorkspaceAuthContext;

const makeService = ({
  existingResponse = null as Record<string, unknown> | null,
  duplicatePaperCount = 0,
  responseCount = 0,
  draftRevision = 3,
  versions = {
    v1: { id: 'v1', formId: 'form-1', versionNumber: 1, definition },
    'v-other': {
      id: 'v-other',
      formId: 'form-2',
      versionNumber: 1,
      definition,
    },
  } as Record<string, unknown>,
} = {}) => {
  const repository = {
    // Conditional draft-revision claim: succeeds only from the stored revision.
    update: jest
      .fn()
      .mockImplementation((criteria: { draftRevision?: number }) =>
        Promise.resolve({
          affected: criteria.draftRevision === draftRevision ? 1 : 0,
        }),
      ),
    findOne: jest.fn().mockResolvedValue(existingResponse),
    count: jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          'paperReference' in where ? duplicatePaperCount : responseCount,
        ),
      ),
  };
  const records = {
    findFormById: jest.fn().mockResolvedValue({ id: 'form-1', draftRevision }),
    findVersion: jest
      .fn()
      .mockImplementation((_workspaceId: string, where: { id: string }) =>
        Promise.resolve(versions[where.id] ?? null),
      ),
    withRepository: jest
      .fn()
      .mockImplementation(
        (
          _workspaceId: string,
          _object: string,
          callback: (repo: typeof repository) => unknown,
        ) => callback(repository),
      ),
  } as unknown as SurveyRecordsService;

  return { service: new SurveyWriteGuardService(records), repository };
};

describe('SurveyWriteGuardService', () => {
  describe('forms', () => {
    it('should force a new form into DRAFT with a server-generated slug', () => {
      const { service } = makeService();
      const data = service.prepareFormCreate(authContext, {
        name: 'x',
        formStatus: 'PUBLISHED',
        publicSlug: 'mine',
        publishedVersionId: 'v9',
      });

      expect(data.formStatus).toBe('DRAFT');
      expect(data.publishedVersionId).toBeNull();
      expect(data.publicSlug).toMatch(/^[A-Za-z0-9]{12}$/);
      expect(data.ownerId).toBe('member-1');
      expect(data.draftRevision).toBe(0);
    });

    it('should reject status and slug changes through the record API', async () => {
      const { service } = makeService();

      await expect(
        service.prepareFormUpdate(authContext, 'form-1', {
          formStatus: 'CLOSED',
        }),
      ).rejects.toThrow('SURVEY_ENDPOINT_ONLY');
    });

    it('should accept only the next draft revision', async () => {
      const { service } = makeService({ draftRevision: 3 });

      await expect(
        service.prepareFormUpdate(authContext, 'form-1', {
          draftDefinition: definition,
          draftRevision: 3,
        }),
      ).rejects.toThrow('SURVEY_DRAFT_CONFLICT');

      const accepted = await service.prepareFormUpdate(authContext, 'form-1', {
        draftDefinition: definition,
        draftRevision: 4,
      });

      expect(accepted.hasUnpublishedChanges).toBe(true);
    });

    it('should refuse nested relation writes that bypass the publish endpoint', async () => {
      const { service } = makeService();

      await expect(
        service.prepareFormUpdate(authContext, 'form-1', {
          publishedVersion: {
            connect: { where: { id: 'other-form-version' } },
          },
        }),
      ).rejects.toThrow('SURVEY_ENDPOINT_ONLY');
    });

    it('should drop unknown fields on create', () => {
      const { service } = makeService();
      const data = service.prepareFormCreate(authContext, {
        name: 'x',
        publishedVersion: { connect: { where: { id: 'v' } } },
      });

      expect(data).not.toHaveProperty('publishedVersion');
    });

    it('should refuse to delete a form that has responses', async () => {
      const { service } = makeService({ responseCount: 2 });

      await expect(
        service.assertFormDeletable(authContext, 'form-1'),
      ).rejects.toThrow('SURVEY_FORM_HAS_RESPONSES');
    });
  });

  describe('responses', () => {
    it('should strip hidden answers and pin the version and form', async () => {
      const { service } = makeService();
      const data = await service.prepareResponseCreate(authContext, {
        formVersionId: 'v1',
        answers: { q_name: 'Noor', q_uses: false, q_which: 'hidden' },
      });

      expect(data.answers).toEqual({ q_name: 'Noor', q_uses: false });
      expect(data.skippedByLogic).toEqual(['q_which']);
      expect(data.formId).toBe('form-1');
      expect(data.versionNumber).toBe(1);
      expect(data.collectorId).toBe('member-1');
      expect(data.submissionKey).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should reject completing a response with missing required answers', async () => {
      const { service } = makeService();

      await expect(
        service.prepareResponseCreate(authContext, {
          formVersionId: 'v1',
          completionStatus: 'COMPLETED',
          answers: {},
        }),
      ).rejects.toThrow('SURVEY_INVALID_ANSWERS');
    });

    it('should refuse public channels from staff writes', async () => {
      const { service } = makeService();

      await expect(
        service.prepareResponseCreate(authContext, {
          formVersionId: 'v1',
          source: 'PUBLIC_LINK',
        }),
      ).rejects.toThrow('SURVEY_ENDPOINT_ONLY');
    });

    it('should reject a duplicate paper sheet reference on the same form', async () => {
      const { service } = makeService({ duplicatePaperCount: 1 });

      await expect(
        service.prepareResponseCreate(authContext, {
          formVersionId: 'v1',
          source: 'PAPER',
          paperReference: 'S-0001',
        }),
      ).rejects.toThrow('SURVEY_DUPLICATE_PAPER_REFERENCE');
    });

    it('should leave updates that do not touch answers alone', async () => {
      const { service } = makeService();

      expect(
        await service.prepareResponseUpdate(authContext, 'r1', {
          reviewStatus: 'REVIEWED',
        }),
      ).toEqual({ reviewStatus: 'REVIEWED' });
    });

    it('should re-validate the stored answers when a response is completed', async () => {
      const { service } = makeService({
        existingResponse: {
          id: 'r1',
          formId: 'form-1',
          formVersionId: 'v1',
          answers: { q_uses: true },
          completionStatus: 'PARTIAL',
          submittedAt: null,
          paperReference: null,
        },
      });

      await expect(
        service.prepareResponseUpdate(authContext, 'r1', {
          completionStatus: 'COMPLETED',
        }),
      ).rejects.toThrow('SURVEY_INVALID_ANSWERS');
    });

    it('should refuse relation writes that would move a response', async () => {
      const { service } = makeService();

      await expect(
        service.prepareResponseUpdate(authContext, 'r1', {
          formVersion: { connect: { where: { id: 'v-other' } } },
        }),
      ).rejects.toThrow('SURVEY_ENDPOINT_ONLY');
    });

    it('should never take the paper transcriber from the payload', async () => {
      const { service } = makeService();
      const data = await service.prepareResponseCreate(authContext, {
        formVersionId: 'v1',
        source: 'PAPER',
        enteredById: 'someone-else',
        invitationId: 'inv',
      });

      expect(data.enteredById).toBe('member-1');
      expect(data).not.toHaveProperty('invitationId');
    });

    it('should not let a response move to another form', async () => {
      const { service } = makeService({
        existingResponse: {
          id: 'r1',
          formId: 'form-1',
          formVersionId: 'v1',
          answers: {},
          completionStatus: 'PARTIAL',
          submittedAt: null,
          paperReference: null,
        },
      });

      await expect(
        service.prepareResponseUpdate(authContext, 'r1', {
          formVersionId: 'v-other',
        }),
      ).rejects.toThrow('another form');
    });

    it('should refuse bulk edits of answers', () => {
      const { service } = makeService();

      expect(() => service.assertResponseUpdateMany({ answers: {} })).toThrow(
        'SURVEY_ENDPOINT_ONLY',
      );
      expect(() =>
        service.assertResponseUpdateMany({ reviewStatus: 'REVIEWED' }),
      ).not.toThrow();
    });
  });

  describe('invitations', () => {
    it('should only allow revoking or renaming', () => {
      const { service } = makeService();

      expect(() =>
        service.assertInvitationUpdate({ invitationStatus: 'REVOKED' }),
      ).not.toThrow();
      expect(() =>
        service.assertInvitationUpdate({ invitationStatus: 'ACTIVE' }),
      ).toThrow();
      expect(() =>
        service.assertInvitationUpdate({ tokenHash: 'x' }),
      ).toThrow();
    });
  });
});

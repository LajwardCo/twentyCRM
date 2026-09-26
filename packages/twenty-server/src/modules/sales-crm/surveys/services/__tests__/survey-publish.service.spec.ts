import { type FormDefinition } from 'twenty-shared/surveys';

import { type SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import { SurveyPublishService } from 'src/modules/sales-crm/surveys/services/survey-publish.service';
import { SurveyExceptionCode } from 'src/modules/sales-crm/surveys/survey.exception';

const validDefinition = {
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
        {
          kind: 'question',
          id: 'q1',
          type: 'short_text',
          label: { fa: 'نام' },
          required: true,
          audience: 'ALL',
          config: {},
          print: { answerLines: 1 },
        },
      ],
    },
  ],
  endings: [{ id: 'e', title: {}, message: {} }],
  appearance: { accent: '#000', showProgress: true, showQuestionNumbers: true },
  print: { instructions: {} },
  crmMapping: [],
  automations: [],
} as unknown as FormDefinition;

const makeService = (
  form: Record<string, unknown>,
  existingVersion: unknown = null,
  claimSucceeds = true,
) => {
  const saved: unknown[] = [];
  const updates: unknown[] = [];
  const repository = {
    findOne: jest.fn().mockResolvedValue(existingVersion),
    save: jest.fn().mockImplementation((values: Record<string, unknown>) => {
      saved.push(values);

      return Promise.resolve({ id: 'version-new', ...values });
    }),
    update: jest
      .fn()
      .mockImplementation((criteria: unknown, values: unknown) => {
        updates.push(values);

        // Object criteria = the conditional version-number claim.
        return Promise.resolve({
          affected: typeof criteria === 'object' && !claimSucceeds ? 0 : 1,
        });
      }),
  };
  const records = {
    findFormById: jest.fn().mockResolvedValue({
      id: 'form-1',
      name: 'فرم',
      formStatus: 'DRAFT',
      draftRevision: 5,
      draftDefinition: validDefinition,
      currentVersionNumber: 0,
      publicSlug: 'AbCdEfGhIjKl',
      publicEnabled: true,
      publishedVersionId: null,
      ...form,
    }),
    withRepository: jest
      .fn()
      .mockImplementation(
        (
          _ws: string,
          _object: string,
          callback: (repo: typeof repository) => unknown,
        ) => callback(repository),
      ),
  } as unknown as SurveyRecordsService;

  return { service: new SurveyPublishService(records), saved, updates };
};

const publish = (service: SurveyPublishService, expectedDraftRevision = 5) =>
  service.publish({
    workspaceId: 'ws',
    workspaceMemberId: 'member-1',
    actorName: 'Tim',
    formId: 'form-1',
    expectedDraftRevision,
    changeNote: 'first',
  });

describe('SurveyPublishService', () => {
  it('should snapshot the draft as the next version and point the form at it', async () => {
    const { service, saved, updates } = makeService({
      currentVersionNumber: 2,
    });

    const result = await publish(service);

    expect(result).toEqual({
      versionId: 'version-new',
      versionNumber: 3,
      printCode: 'FABCD-v3',
      publicSlug: 'AbCdEfGhIjKl',
    });
    expect(saved[0]).toMatchObject({
      versionNumber: 3,
      definition: validDefinition,
      publishedById: 'member-1',
    });
    expect(updates[0]).toEqual({ currentVersionNumber: 3 });
    expect(updates[1]).toMatchObject({
      formStatus: 'PUBLISHED',
      publishedVersionId: 'version-new',
      hasUnpublishedChanges: false,
    });
  });

  it('should fail cleanly when another publisher claimed the version first', async () => {
    const { service, saved } = makeService(
      { currentVersionNumber: 2 },
      null,
      false,
    );

    await expect(publish(service)).rejects.toMatchObject({
      code: SurveyExceptionCode.DRAFT_CONFLICT,
    });
    expect(saved).toEqual([]);
  });

  it('should refuse to publish a draft the publisher did not review', async () => {
    const { service } = makeService({});

    await expect(publish(service, 4)).rejects.toMatchObject({
      code: SurveyExceptionCode.DRAFT_CONFLICT,
    });
  });

  it('should refuse to publish an invalid definition and return the issues', async () => {
    const { service } = makeService({
      draftDefinition: {
        ...validDefinition,
        pages: [{ id: 'p1', title: {}, jumps: [], items: [] }],
      },
    });

    await expect(publish(service)).rejects.toMatchObject({
      code: SurveyExceptionCode.PUBLISH_INVALID,
      details: { errors: [expect.objectContaining({ code: 'EMPTY_FORM' })] },
    });
  });

  it('should keep a closed form closed when a new version is published', async () => {
    const { service, updates } = makeService({
      formStatus: 'CLOSED',
      publishedVersionId: 'v1',
      currentVersionNumber: 1,
    });

    await publish(service);

    expect(updates[0]).toEqual({ currentVersionNumber: 2 });
    expect(updates[1]).toMatchObject({ formStatus: 'CLOSED' });
  });

  it('should not publish archived forms', async () => {
    const { service } = makeService({ formStatus: 'ARCHIVED' });

    await expect(publish(service)).rejects.toMatchObject({
      code: SurveyExceptionCode.INVALID_STATUS_CHANGE,
    });
  });

  it('should allow only the documented status transitions', async () => {
    const draft = makeService({ formStatus: 'DRAFT' }).service;
    const published = makeService({
      formStatus: 'PUBLISHED',
      publishedVersionId: 'v1',
    }).service;

    await expect(
      draft.changeStatus({
        workspaceId: 'ws',
        formId: 'form-1',
        status: 'PUBLISHED',
      }),
    ).rejects.toMatchObject({
      code: SurveyExceptionCode.INVALID_STATUS_CHANGE,
    });
    await expect(
      published.changeStatus({
        workspaceId: 'ws',
        formId: 'form-1',
        status: 'CLOSED',
      }),
    ).resolves.toEqual({ formStatus: 'CLOSED' });
    await expect(
      published.changeStatus({
        workspaceId: 'ws',
        formId: 'form-1',
        status: 'DRAFT',
      }),
    ).rejects.toMatchObject({
      code: SurveyExceptionCode.INVALID_STATUS_CHANGE,
    });
  });
});

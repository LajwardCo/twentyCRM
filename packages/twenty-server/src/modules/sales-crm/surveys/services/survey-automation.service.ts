import { Injectable, Logger } from '@nestjs/common';

import {
  type AnswerValue,
  type AutomationRule,
  type FormDefinition,
  buildQuestionIndex,
  evaluateConditionGroup,
  proposeCrmChanges,
} from 'twenty-shared/surveys';

import { SurveyRecordsService } from 'src/modules/sales-crm/surveys/services/survey-records.service';
import {
  type SurveyCrmAction,
  type SurveyResponseRecord,
} from 'src/modules/sales-crm/surveys/types/survey-records.type';
import {
  buildSurveyRecordValues,
  type SurveyActor,
} from 'src/modules/sales-crm/surveys/utils/build-survey-record-values.util';

type IdShape = { id: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export const automationActionKey = (rule: Pick<AutomationRule, 'id'>) =>
  `auto:${rule.id}`;

// Opt-in automations configured on a form version. Each rule runs at most
// once per response — its key is recorded in crmActions — so retries (a
// re-submitted public form, a "retry" click) never create a second lead or
// task. A failure is recorded and never fails the submission itself.
@Injectable()
export class SurveyAutomationService {
  private readonly logger = new Logger(SurveyAutomationService.name);
  // Responses whose automations are running in this process; a concurrent
  // second run (double-clicked retry) returns without acting.
  private readonly running = new Set<string>();

  constructor(private readonly surveyRecordsService: SurveyRecordsService) {}

  async run({
    workspaceId,
    response,
    definition,
    formName,
    actor,
  }: {
    workspaceId: string;
    response: SurveyResponseRecord;
    definition: FormDefinition;
    formName: string;
    actor: SurveyActor;
  }): Promise<SurveyCrmAction[]> {
    if (this.running.has(response.id)) {
      return response.crmActions ?? [];
    }

    this.running.add(response.id);

    try {
      return await this.runUnlocked({
        workspaceId,
        response,
        definition,
        formName,
        actor,
      });
    } finally {
      this.running.delete(response.id);
    }
  }

  private async runUnlocked({
    workspaceId,
    response,
    definition,
    formName,
    actor,
  }: {
    workspaceId: string;
    response: SurveyResponseRecord;
    definition: FormDefinition;
    formName: string;
    actor: SurveyActor;
  }): Promise<SurveyCrmAction[]> {
    const cleanAnswers = (response.answers ?? {}) as Record<
      string,
      AnswerValue
    >;
    const actions = [...(response.crmActions ?? [])];
    let opportunityId = response.opportunityId;
    const context = {
      questionsById: buildQuestionIndex(definition),
      answers: cleanAnswers,
      // Stored answers are already stripped of hidden questions.
      visibleIds: new Set(Object.keys(cleanAnswers)),
    };

    for (const rule of definition.automations) {
      const key = automationActionKey(rule);

      if (
        !rule.enabled ||
        actions.some((action) => action.key === key && action.status === 'DONE')
      ) {
        continue;
      }

      if (
        rule.when !== undefined &&
        !evaluateConditionGroup(rule.when, context)
      ) {
        continue;
      }

      const previousFailure = actions.findIndex((action) => action.key === key);

      if (previousFailure >= 0) {
        actions.splice(previousFailure, 1);
      }

      try {
        const recordId = await this.execute({
          workspaceId,
          rule,
          response: { ...response, opportunityId },
          definition,
          cleanAnswers,
          formName,
          actor,
        });

        if (rule.action === 'CREATE_LEAD') {
          opportunityId = recordId;
        }

        actions.push({
          key,
          type: rule.action,
          status: 'DONE',
          at: new Date().toISOString(),
          by: actor.workspaceMemberId,
          recordId,
        });
      } catch (error) {
        this.logger.warn(
          `Survey automation ${rule.id} failed for response ${response.id}: ${error}`,
        );
        actions.push({
          key,
          type: rule.action,
          status: 'FAILED',
          at: new Date().toISOString(),
          by: actor.workspaceMemberId,
          error:
            error instanceof Error ? error.message.slice(0, 300) : 'failed',
        });
      }
    }

    await this.surveyRecordsService.withRepository<
      SurveyResponseRecord,
      unknown
    >(workspaceId, 'surveyResponse', (repository) =>
      repository.update(response.id, {
        crmActions: actions,
        ...(opportunityId !== response.opportunityId ? { opportunityId } : {}),
      }),
    );

    return actions;
  }

  private async execute({
    workspaceId,
    rule,
    response,
    definition,
    cleanAnswers,
    formName,
    actor,
  }: {
    workspaceId: string;
    rule: AutomationRule;
    response: SurveyResponseRecord;
    definition: FormDefinition;
    cleanAnswers: Record<string, AnswerValue>;
    formName: string;
    actor: SurveyActor;
  }): Promise<string> {
    if (rule.action === 'CREATE_LEAD') {
      // Already linked (by staff or an earlier rule): link, never duplicate.
      if (response.opportunityId !== null) {
        return response.opportunityId;
      }

      const proposals = proposeCrmChanges(definition, cleanAnswers, {});
      const proposedName =
        proposals.find((proposal) => proposal.field === 'opportunity.name')
          ?.proposed ??
        proposals.find((proposal) => proposal.field === 'company.name')
          ?.proposed ??
        response.name ??
        formName;

      return this.surveyRecordsService.withRepository<IdShape, string>(
        workspaceId,
        'opportunity',
        async (repository) => {
          const saved = (await repository.save(
            buildSurveyRecordValues(
              {
                name: String(proposedName).slice(0, 200),
                companyId: response.companyId,
                pointOfContactId: response.personId,
                ownerId: rule.assigneeMemberId ?? null,
              },
              actor,
            ) as Partial<IdShape>,
          )) as IdShape;

          return saved.id;
        },
      );
    }

    const title =
      rule.action === 'NOTIFY'
        ? `پاسخ جدید در «${formName}»: ${response.name ?? ''}`.trim()
        : rule.taskTitle?.trim() || `پیگیری پاسخ: ${response.name ?? formName}`;
    const dueAt = new Date(
      Date.now() + Math.max(0, rule.dueInDays ?? 0) * DAY_MS,
    ).toISOString();

    const taskId = await this.surveyRecordsService.withRepository<
      IdShape,
      string
    >(workspaceId, 'task', async (repository) => {
      const saved = (await repository.save(
        buildSurveyRecordValues(
          {
            title: title.slice(0, 250),
            status: 'TODO',
            dueAt,
            assigneeId: rule.assigneeMemberId ?? null,
          },
          actor,
        ) as Partial<IdShape>,
      )) as IdShape;

      return saved.id;
    });

    await this.surveyRecordsService.withRepository<IdShape, unknown>(
      workspaceId,
      'taskTarget',
      (repository) =>
        repository.save(
          buildSurveyRecordValues(
            {
              taskId,
              targetSurveyResponseId: response.id,
            },
            actor,
          ) as Partial<IdShape>,
        ),
    );

    if (response.opportunityId !== null) {
      await this.surveyRecordsService.withRepository<IdShape, unknown>(
        workspaceId,
        'taskTarget',
        (repository) =>
          repository.save(
            buildSurveyRecordValues(
              { taskId, targetOpportunityId: response.opportunityId },
              actor,
            ) as Partial<IdShape>,
          ),
      );
    }

    return taskId;
  }
}

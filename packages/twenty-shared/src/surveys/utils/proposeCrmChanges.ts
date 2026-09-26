import { type AnswerValue } from '../types/FormAnswers';
import { type CrmExistingValues, type CrmProposal } from '../types/CrmProposal';
import { type CrmTarget, type FormDefinition } from '../types/FormDefinition';
import { answerToText } from './answerToText';
import { buildQuestionIndex } from './buildQuestionIndex';
import { isMappingCompatible } from './isMappingCompatible';
import { toLatinDigits } from './toLatinDigits';

const comparable = (value: string | number | null | undefined): string =>
  toLatinDigits(String(value ?? ''))
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const isBlank = (value: string | number | null | undefined): boolean =>
  value === null || value === undefined || String(value).trim() === '';

const phoneDigits = (value: string | number | null | undefined): string =>
  toLatinDigits(String(value ?? ''))
    .replace(/\D/g, '')
    .slice(-9);

// Review-first mapping: proposes, never applies. Blank answers never clear a
// CRM value, and a differing non-empty CRM value is a CONFLICT for staff to
// decide — trusted CRM data is never overwritten silently.
export const proposeCrmChanges = (
  definition: FormDefinition,
  cleanAnswers: Record<string, AnswerValue>,
  existing: CrmExistingValues,
): CrmProposal[] => {
  const questionsById = buildQuestionIndex(definition);
  const proposals: CrmProposal[] = [];

  for (const rule of definition.crmMapping) {
    const question = questionsById.get(rule.questionId);

    if (
      question === undefined ||
      !isMappingCompatible(question.type, rule.field)
    ) {
      continue;
    }

    const answer = cleanAnswers[rule.questionId];
    const proposed: string | number | null =
      answer === undefined
        ? null
        : rule.field === 'company.employees' && typeof answer === 'number'
          ? answer
          : answerToText(question, answer, definition) || null;
    const current = existing[rule.field] ?? null;
    const target = rule.field.split('.')[0] as CrmTarget;

    let action: CrmProposal['action'];

    if (isBlank(proposed)) {
      action = 'SKIP_BLANK';
    } else if (isBlank(current)) {
      action = 'FILL';
    } else if (
      rule.field === 'person.phone'
        ? phoneDigits(current) === phoneDigits(proposed)
        : comparable(current) === comparable(proposed)
    ) {
      action = 'SAME';
    } else if (
      rule.field === 'opportunity.interest' ||
      rule.field === 'opportunity.followUp'
    ) {
      // Appended to notes/tasks, so they never conflict with existing text.
      action = 'FILL';
    } else {
      action = 'CONFLICT';
    }

    proposals.push({
      ruleId: rule.id,
      questionId: rule.questionId,
      target,
      field: rule.field,
      proposed,
      current,
      action,
    });
  }

  return proposals;
};

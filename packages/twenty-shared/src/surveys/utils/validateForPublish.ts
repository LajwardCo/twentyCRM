import { CHOICE_QUESTION_TYPES } from '../constants/CHOICE_QUESTION_TYPES';
import { SURVEY_LIMITS } from '../constants/SURVEY_LIMITS';
import {
  type ConditionGroup,
  type FormDefinition,
  type Question,
} from '../types/FormDefinition';
import {
  type PublishIssue,
  type PublishValidation,
} from '../types/PublishIssue';
import { isAlwaysTrueGroup } from './isAlwaysTrueGroup';
import { isItemAvailableTo } from './isItemAvailableTo';
import { isMappingCompatible } from './isMappingCompatible';
import { isOperatorCompatible } from './isOperatorCompatible';
import { pickLocalizedText } from './pickLocalizedText';

type Position = { pageIndex: number; itemIndex: number };

const isBefore = (a: Position, b: Position): boolean =>
  a.pageIndex < b.pageIndex ||
  (a.pageIndex === b.pageIndex && a.itemIndex < b.itemIndex);

const canonical = (group: ConditionGroup): string =>
  JSON.stringify({
    mode: group.mode,
    conditions: [...group.conditions]
      .map((condition) => [
        condition.questionId,
        condition.op,
        condition.value ?? null,
      ])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });

// A group is statically impossible when, under ALL, the same question is
// required to have two different single values, both X and not-X, or to be
// both answered and unanswered.
const isUnsatisfiable = (
  group: ConditionGroup,
  questionsById: Map<string, Question>,
): boolean => {
  if (group.mode !== 'ALL') {
    return false;
  }

  const byQuestion = new Map<string, ConditionGroup['conditions']>();

  for (const condition of group.conditions) {
    byQuestion.set(condition.questionId, [
      ...(byQuestion.get(condition.questionId) ?? []),
      condition,
    ]);
  }

  for (const [questionId, conditions] of byQuestion) {
    const question = questionsById.get(questionId);
    const ops = new Set(conditions.map((condition) => condition.op));
    const requiresAnswer = conditions.some((condition) =>
      ['answered', 'eq', 'includes', 'gt', 'gte', 'lt', 'lte'].includes(
        condition.op,
      ),
    );

    if (ops.has('not_answered') && requiresAnswer) {
      return true;
    }

    const equalities = conditions
      .filter((condition) => condition.op === 'eq')
      .map((condition) => String(condition.value));

    if (
      question !== undefined &&
      question.type !== 'multi_choice' &&
      new Set(equalities).size > 1
    ) {
      return true;
    }

    for (const condition of conditions) {
      if (
        condition.op === 'eq' &&
        conditions.some(
          (other) =>
            other.op === 'neq' &&
            String(other.value) === String(condition.value),
        )
      ) {
        return true;
      }

      if (
        condition.op === 'includes' &&
        conditions.some(
          (other) =>
            other.op === 'excludes' &&
            String(other.value) === String(condition.value),
        )
      ) {
        return true;
      }
    }
  }

  return false;
};

// Everything that must hold before a draft becomes a live version. Runs in the
// builder (live issue list) and again on the server when publishing.
export const validateForPublish = (
  definition: FormDefinition,
  { publicEnabled = true }: { publicEnabled?: boolean } = {},
): PublishValidation => {
  const errors: PublishIssue[] = [];
  const warnings: PublishIssue[] = [];
  const language = definition.languages[0] ?? 'fa';
  const questionsById = new Map<string, Question>();
  const positions = new Map<string, Position>();
  const pageIndexById = new Map<string, number>();
  const seenIds = new Set<string>();

  const claimId = (
    id: string,
    context: Omit<PublishIssue, 'code' | 'message'>,
  ) => {
    if (seenIds.has(id)) {
      errors.push({
        code: 'DUPLICATE_ID',
        message: `شناسه «${id}» تکراری است.`,
        ...context,
      });
    }

    seenIds.add(id);
  };

  const labelOf = (question: Question): string =>
    pickLocalizedText(question.label, language, definition.languages) ||
    question.id;

  definition.pages.forEach((page, pageIndex) => {
    claimId(page.id, { pageId: page.id });
    pageIndexById.set(page.id, pageIndex);

    page.items.forEach((item, itemIndex) => {
      claimId(item.id, { itemId: item.id, pageId: page.id });
      positions.set(item.id, { pageIndex, itemIndex });

      if (item.kind === 'question') {
        questionsById.set(item.id, item);
      }
    });
  });

  for (const ending of definition.endings) {
    claimId(ending.id, {});
  }

  if (questionsById.size === 0) {
    errors.push({ code: 'EMPTY_FORM', message: 'فرم هیچ سؤالی ندارد.' });
  }

  if (
    questionsById.size > SURVEY_LIMITS.maxQuestions ||
    definition.pages.length > SURVEY_LIMITS.maxPages
  ) {
    errors.push({
      code: 'TOO_LARGE',
      message: `حداکثر ${SURVEY_LIMITS.maxQuestions} سؤال و ${SURVEY_LIMITS.maxPages} صفحه مجاز است.`,
    });
  }

  if (definition.endings.length === 0) {
    errors.push({ code: 'NO_ENDING', message: 'فرم پیام پایانی ندارد.' });
  }

  // Checks a condition group attached to something at `owner` position.
  // `ownerLimit` = the last position whose answers may be referenced.
  const checkGroup = (
    group: ConditionGroup | undefined,
    context: {
      itemId?: string;
      pageId?: string;
      ruleId?: string;
      what: string;
      isReferenceAllowed: (position: Position) => boolean;
      isPublic: boolean;
      severityIfUnsatisfiable: 'error' | 'warning';
    },
  ) => {
    if (group === undefined) {
      return;
    }

    const location = {
      itemId: context.itemId,
      pageId: context.pageId,
      ruleId: context.ruleId,
    };

    for (const condition of group.conditions) {
      const referenced = questionsById.get(condition.questionId);
      const position = positions.get(condition.questionId);

      if (referenced === undefined || position === undefined) {
        errors.push({
          code: 'BROKEN_REFERENCE',
          message: `${context.what} به سؤالی اشاره می‌کند که وجود ندارد.`,
          ...location,
        });

        continue;
      }

      if (!context.isReferenceAllowed(position)) {
        errors.push({
          code: 'FORWARD_REFERENCE',
          message: `${context.what} به سؤال «${labelOf(referenced)}» اشاره می‌کند که بعد از آن آمده است. شرط‌ها فقط می‌توانند به سؤال‌های قبلی اشاره کنند.`,
          ...location,
        });
      }

      if (!isOperatorCompatible(condition.op, referenced.type)) {
        errors.push({
          code: 'INVALID_OPERATOR',
          message: `نوع مقایسه در ${context.what} برای سؤال «${labelOf(referenced)}» مناسب نیست.`,
          ...location,
        });
      }

      if (
        CHOICE_QUESTION_TYPES.has(referenced.type) &&
        ['eq', 'neq', 'includes', 'excludes'].includes(condition.op) &&
        !(referenced.config.choices ?? []).some(
          (choice) => choice.id === condition.value,
        ) &&
        !(
          referenced.config.allowOther === true && condition.value === '__other'
        )
      ) {
        errors.push({
          code: 'BROKEN_REFERENCE',
          message: `${context.what} به گزینه‌ای از سؤال «${labelOf(referenced)}» اشاره می‌کند که حذف شده است.`,
          ...location,
        });
      }

      if (
        publicEnabled &&
        context.isPublic &&
        !isItemAvailableTo(referenced, 'PUBLIC')
      ) {
        errors.push({
          code: 'PUBLIC_DEPENDS_ON_STAFF',
          message: `${context.what} به سؤال مخصوص کارمندان «${labelOf(referenced)}» وابسته است، اما پاسخ‌دهندهٔ آنلاین آن را نمی‌بیند.`,
          ...location,
        });
      }
    }

    if (isUnsatisfiable(group, questionsById)) {
      (context.severityIfUnsatisfiable === 'error' ? errors : warnings).push({
        code: 'UNSATISFIABLE_CONDITION',
        message: `شرط ${context.what} هیچ‌وقت برقرار نمی‌شود.`,
        ...location,
      });
    }
  };

  definition.pages.forEach((page, pageIndex) => {
    page.items.forEach((item, itemIndex) => {
      const own: Position = { pageIndex, itemIndex };
      const earlier = (position: Position) => isBefore(position, own);

      if (item.kind === 'section') {
        checkGroup(item.visibleWhen, {
          itemId: item.id,
          pageId: page.id,
          what: 'شرط نمایش بخش',
          isReferenceAllowed: earlier,
          isPublic: true,
          severityIfUnsatisfiable: 'warning',
        });

        return;
      }

      if (item.kind !== 'question') {
        return;
      }

      const label = labelOf(item);
      const isPublic = isItemAvailableTo(item, 'PUBLIC');

      if (pickLocalizedText(item.label, language).trim() === '') {
        errors.push({
          code: 'MISSING_LABEL',
          message: 'سؤالی بدون عنوان وجود دارد.',
          itemId: item.id,
          pageId: page.id,
        });
      }

      if (CHOICE_QUESTION_TYPES.has(item.type)) {
        const choices = item.config.choices ?? [];

        if (choices.length === 0 && item.config.allowOther !== true) {
          errors.push({
            code: 'NO_CHOICES',
            message: `سؤال «${label}» گزینه ندارد.`,
            itemId: item.id,
            pageId: page.id,
          });
        }

        if (choices.length > SURVEY_LIMITS.maxChoices) {
          errors.push({
            code: 'TOO_LARGE',
            message: `سؤال «${label}» بیش از ${SURVEY_LIMITS.maxChoices} گزینه دارد.`,
            itemId: item.id,
            pageId: page.id,
          });
        }

        const choiceIds = new Set<string>();

        for (const choice of choices) {
          if (choiceIds.has(choice.id)) {
            errors.push({
              code: 'DUPLICATE_ID',
              message: `گزینه‌های سؤال «${label}» شناسهٔ تکراری دارند.`,
              itemId: item.id,
              pageId: page.id,
            });
          }

          choiceIds.add(choice.id);

          if (pickLocalizedText(choice.label, language).trim() === '') {
            errors.push({
              code: 'MISSING_LABEL',
              message: `سؤال «${label}» گزینهٔ بدون متن دارد.`,
              itemId: item.id,
              pageId: page.id,
            });
          }
        }
      }

      const config = item.config;
      const invertedBounds =
        (config.min !== undefined &&
          config.max !== undefined &&
          config.min > config.max) ||
        (config.minLength !== undefined &&
          config.maxLength !== undefined &&
          config.minLength > config.maxLength) ||
        (config.minSelected !== undefined &&
          config.maxSelected !== undefined &&
          config.minSelected > config.maxSelected) ||
        (config.scaleMin !== undefined &&
          config.scaleMax !== undefined &&
          config.scaleMin >= config.scaleMax);

      if (invertedBounds) {
        errors.push({
          code: 'INVALID_BOUNDS',
          message: `حداقل و حداکثر سؤال «${label}» با هم نمی‌خوانند.`,
          itemId: item.id,
          pageId: page.id,
        });
      }

      checkGroup(item.visibleWhen, {
        itemId: item.id,
        pageId: page.id,
        what: `شرط نمایش «${label}»`,
        isReferenceAllowed: earlier,
        isPublic,
        severityIfUnsatisfiable: item.required ? 'error' : 'warning',
      });
      checkGroup(item.requiredWhen, {
        itemId: item.id,
        pageId: page.id,
        what: `شرط الزامی بودن «${label}»`,
        isReferenceAllowed: earlier,
        isPublic,
        severityIfUnsatisfiable: 'warning',
      });
    });

    const seenConditions = new Map<string, string>();
    let unconditionalSeen = false;

    for (const jump of page.jumps) {
      claimId(jump.id, { pageId: page.id, ruleId: jump.id });

      if (unconditionalSeen) {
        warnings.push({
          code: 'UNREACHABLE_JUMP',
          message: `در صفحهٔ ${pageIndex + 1} یک قاعدهٔ پرش بعد از پرش بدون شرط آمده و هرگز اجرا نمی‌شود.`,
          pageId: page.id,
          ruleId: jump.id,
        });
      }

      checkGroup(jump.when, {
        pageId: page.id,
        ruleId: jump.id,
        what: `قاعدهٔ پرش صفحهٔ ${pageIndex + 1}`,
        isReferenceAllowed: (position) => position.pageIndex <= pageIndex,
        isPublic: true,
        severityIfUnsatisfiable: 'warning',
      });

      const target =
        'pageId' in jump.to
          ? `page:${jump.to.pageId}`
          : `end:${jump.to.endingId}`;

      if ('pageId' in jump.to) {
        const targetIndex = pageIndexById.get(jump.to.pageId);

        if (targetIndex === undefined) {
          errors.push({
            code: 'BROKEN_REFERENCE',
            message: `قاعدهٔ پرش صفحهٔ ${pageIndex + 1} به صفحه‌ای اشاره می‌کند که وجود ندارد.`,
            pageId: page.id,
            ruleId: jump.id,
          });
        } else if (targetIndex <= pageIndex) {
          errors.push({
            code: 'BACKWARD_JUMP',
            message: `قاعدهٔ پرش صفحهٔ ${pageIndex + 1} به همان صفحه یا صفحهٔ قبلی برمی‌گردد و حلقه می‌سازد. پرش فقط به صفحه‌های بعدی مجاز است.`,
            pageId: page.id,
            ruleId: jump.id,
          });
        }
      } else if (
        !definition.endings.some(
          (ending) => 'endingId' in jump.to && ending.id === jump.to.endingId,
        )
      ) {
        errors.push({
          code: 'BROKEN_REFERENCE',
          message: `قاعدهٔ پرش صفحهٔ ${pageIndex + 1} به پیام پایانی‌ای اشاره می‌کند که وجود ندارد.`,
          pageId: page.id,
          ruleId: jump.id,
        });
      }

      const key = canonical(jump.when);
      const previousTarget = seenConditions.get(key);

      if (previousTarget !== undefined && previousTarget !== target) {
        errors.push({
          code: 'CONTRADICTORY_JUMPS',
          message: `در صفحهٔ ${pageIndex + 1} دو قاعدهٔ پرش با شرط یکسان به مقصدهای متفاوت می‌روند.`,
          pageId: page.id,
          ruleId: jump.id,
        });
      }

      seenConditions.set(key, target);

      if (isAlwaysTrueGroup(jump.when)) {
        unconditionalSeen = true;
      }
    }
  });

  for (const ending of definition.endings) {
    checkGroup(ending.when, {
      ruleId: ending.id,
      what: 'شرط پیام پایانی',
      isReferenceAllowed: () => true,
      isPublic: true,
      severityIfUnsatisfiable: 'warning',
    });
  }

  // Static reachability: a page is reachable if some reachable earlier page
  // falls through to it or jumps to it. Conditions are assumed satisfiable.
  const reachable = new Set<number>();

  if (definition.pages.length > 0) {
    reachable.add(0);
  }

  definition.pages.forEach((page, pageIndex) => {
    if (!reachable.has(pageIndex)) {
      return;
    }

    let fallsThrough = true;

    for (const jump of page.jumps) {
      if ('pageId' in jump.to) {
        const targetIndex = pageIndexById.get(jump.to.pageId);

        if (targetIndex !== undefined && targetIndex > pageIndex) {
          reachable.add(targetIndex);
        }
      }

      if (isAlwaysTrueGroup(jump.when)) {
        fallsThrough = false;

        break;
      }
    }

    if (fallsThrough && pageIndex + 1 < definition.pages.length) {
      reachable.add(pageIndex + 1);
    }
  });

  definition.pages.forEach((page, pageIndex) => {
    if (reachable.has(pageIndex)) {
      return;
    }

    const hasRequired = page.items.some(
      (item) => item.kind === 'question' && item.required,
    );

    (hasRequired ? errors : warnings).push({
      code: 'UNREACHABLE_PAGE',
      message: hasRequired
        ? `صفحهٔ ${pageIndex + 1} هرگز نمایش داده نمی‌شود اما سؤال الزامی دارد.`
        : `صفحهٔ ${pageIndex + 1} هرگز نمایش داده نمی‌شود.`,
      pageId: page.id,
    });
  });

  for (const rule of definition.crmMapping) {
    const question = questionsById.get(rule.questionId);

    if (question === undefined) {
      errors.push({
        code: 'BROKEN_REFERENCE',
        message: 'یکی از نگاشت‌های CRM به سؤالی اشاره می‌کند که حذف شده است.',
        ruleId: rule.id,
      });

      continue;
    }

    if (!isMappingCompatible(question.type, rule.field)) {
      errors.push({
        code: 'INCOMPATIBLE_MAPPING',
        message: `نوع سؤال «${labelOf(question)}» با فیلد ${rule.field} سازگار نیست.`,
        ruleId: rule.id,
        itemId: question.id,
      });
    }
  }

  for (const automation of definition.automations) {
    checkGroup(automation.when, {
      ruleId: automation.id,
      what: 'شرط خودکارسازی',
      isReferenceAllowed: () => true,
      isPublic: false,
      severityIfUnsatisfiable: 'warning',
    });
  }

  return { errors, warnings };
};

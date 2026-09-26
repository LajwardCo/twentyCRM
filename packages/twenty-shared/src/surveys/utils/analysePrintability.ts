import { SURVEY_PRINT_PHRASES } from '../constants/SURVEY_PRINT_PHRASES';
import {
  type ConditionGroup,
  type FormAudience,
  type FormDefinition,
  type FormLanguage,
} from '../types/FormDefinition';
import { type PrintAnalysis, type PrintIssue } from '../types/PrintAnalysis';
import { describeConditionGroup } from './describeConditionGroup';
import { formatSurveyNumber } from './formatSurveyNumber';
import { isAlwaysTrueGroup } from './isAlwaysTrueGroup';
import { isItemAvailableTo } from './isItemAvailableTo';

// Turns digital logic into instructions a person can follow on paper, and
// refuses (via blockers) when that cannot be done unambiguously.
export const analysePrintability = (
  definition: FormDefinition,
  { audience, language }: { audience: FormAudience; language?: FormLanguage },
): PrintAnalysis => {
  const lang = language ?? definition.languages[0] ?? 'fa';
  const phrases = SURVEY_PRINT_PHRASES[lang];
  const numbering: Record<string, number> = {};
  const instructions: Record<string, string> = {};
  const pageInstructions: Record<string, string[]> = {};
  const paperAlternatives: Record<string, string> = {};
  const blockers: PrintIssue[] = [];
  const notes: string[] = [];
  let next = 1;
  let omittedStaff = 0;

  for (const page of definition.pages) {
    for (const item of page.items) {
      if (item.kind !== 'question') {
        continue;
      }

      if (!isItemAvailableTo(item, audience)) {
        omittedStaff += 1;

        continue;
      }

      numbering[item.id] = next;
      next += 1;
    }
  }

  const firstNumberFrom = (pageIndex: number): number | null => {
    for (const page of definition.pages.slice(pageIndex)) {
      for (const item of page.items) {
        if (item.kind === 'question' && numbering[item.id] !== undefined) {
          return numbering[item.id];
        }
      }
    }

    return null;
  };

  const describe = (
    group: ConditionGroup,
    what: string,
    location: Omit<PrintIssue, 'message'>,
  ): string | null => {
    const unprintable = group.conditions.some(
      (condition) => numbering[condition.questionId] === undefined,
    );

    if (unprintable) {
      blockers.push({
        ...location,
        message: phrases.unprintableReference(what),
      });

      return null;
    }

    return describeConditionGroup(group, definition, lang, numbering);
  };

  definition.pages.forEach((page, pageIndex) => {
    let sectionCondition: string | null = null;

    for (const item of page.items) {
      if (item.kind === 'section') {
        sectionCondition = null;

        if (
          item.visibleWhen !== undefined &&
          item.visibleWhen.conditions.length > 0
        ) {
          const text = describe(item.visibleWhen, `«${item.id}»`, {
            itemId: item.id,
            pageId: page.id,
          });

          if (text !== null) {
            sectionCondition = text;
            instructions[item.id] = phrases.answerOnlyIf(text);
          }
        }

        continue;
      }

      if (item.kind !== 'question') {
        if (item.kind === 'image' && isItemAvailableTo(item, audience)) {
          paperAlternatives[item.id] = phrases.alternativeImage;
        }

        continue;
      }

      if (numbering[item.id] === undefined) {
        continue;
      }

      const questionName = phrases.question(
        formatSurveyNumber(numbering[item.id], lang),
      );
      const lines: string[] = [];

      if (
        item.visibleWhen !== undefined &&
        item.visibleWhen.conditions.length > 0
      ) {
        const text = describe(item.visibleWhen, questionName, {
          itemId: item.id,
          pageId: page.id,
        });

        if (text !== null) {
          lines.push(phrases.answerOnlyIf(text));
        }
      } else if (sectionCondition !== null) {
        lines.push(phrases.answerOnlyIf(sectionCondition));
      }

      if (
        item.requiredWhen !== undefined &&
        item.requiredWhen.conditions.length > 0
      ) {
        const text = describe(item.requiredWhen, questionName, {
          itemId: item.id,
          pageId: page.id,
        });

        if (text !== null) {
          lines.push(phrases.requiredIf(text));
        }
      }

      if (lines.length > 0) {
        instructions[item.id] = lines.join(' ');
      }

      switch (item.type) {
        case 'file':
          paperAlternatives[item.id] = phrases.alternativeFile;
          break;
        case 'location':
          paperAlternatives[item.id] = phrases.alternativeLocation;
          break;
        case 'crm_company':
          paperAlternatives[item.id] = phrases.alternativeCompany;
          break;
        case 'crm_contact':
          paperAlternatives[item.id] = phrases.alternativeContact;
          break;
        case 'crm_lead':
          paperAlternatives[item.id] = phrases.alternativeLead;
          break;
        default:
          break;
      }
    }

    const jumpLines: string[] = [];

    for (const jump of page.jumps) {
      const always = isAlwaysTrueGroup(jump.when);
      const condition = always
        ? null
        : describe(jump.when, phrases.jumpRule, { pageId: page.id });

      if (!always && condition === null) {
        continue;
      }

      let targetNumber: number | null = null;

      if ('pageId' in jump.to) {
        const targetPageId = jump.to.pageId;
        const targetIndex = definition.pages.findIndex(
          (candidate) => candidate.id === targetPageId,
        );

        targetNumber =
          targetIndex > pageIndex ? firstNumberFrom(targetIndex) : null;
      }

      if (targetNumber === null) {
        jumpLines.push(
          condition === null ? phrases.finishAlways : phrases.finish(condition),
        );
      } else {
        const target = phrases.question(formatSurveyNumber(targetNumber, lang));

        jumpLines.push(
          condition === null
            ? phrases.goToAlways(target)
            : phrases.goTo(condition, target),
        );
      }

      // Later rules never apply after an unconditional jump.
      if (always) {
        break;
      }
    }

    if (jumpLines.length > 0) {
      pageInstructions[page.id] = jumpLines;
    }
  });

  if (
    definition.endings.some(
      (ending) =>
        ending.when !== undefined && ending.when.conditions.length > 0,
    )
  ) {
    notes.push(phrases.conditionalEndingNote);
  }

  if (omittedStaff > 0) {
    notes.push(
      phrases.staffOnlyOmittedNote(formatSurveyNumber(omittedStaff, lang)),
    );
  }

  return {
    numbering,
    instructions,
    pageInstructions,
    paperAlternatives,
    blockers,
    notes,
  };
};

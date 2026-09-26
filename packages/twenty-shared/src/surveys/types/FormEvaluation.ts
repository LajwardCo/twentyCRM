export type FormEvaluation = {
  // Pages in the order the respondent visits them.
  pagePath: string[];
  // Items (questions, sections, display blocks) visible on visited pages.
  visibleItemIds: Set<string>;
  requiredQuestionIds: Set<string>;
  // Questions available to this audience that are not visible — either on a
  // page that navigation skipped or hidden by a visibility rule.
  skippedByLogic: string[];
  endingId: string | null;
};

export type PrintIssue = {
  itemId?: string;
  pageId?: string;
  message: string;
};

export type PrintAnalysis = {
  // Printed number per question id (1-based, in reading order).
  numbering: Record<string, number>;
  // "Answer only if…" text per item with a visibility rule.
  instructions: Record<string, string>;
  // Skip instructions printed at the end of a page, one per jump.
  pageInstructions: Record<string, string[]>;
  // What to print instead of a control that does not exist on paper.
  paperAlternatives: Record<string, string>;
  blockers: PrintIssue[];
  notes: string[];
};

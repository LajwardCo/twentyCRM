export type PublishIssueCode =
  | 'EMPTY_FORM'
  | 'TOO_LARGE'
  | 'DUPLICATE_ID'
  | 'MISSING_LABEL'
  | 'NO_CHOICES'
  | 'BROKEN_REFERENCE'
  | 'FORWARD_REFERENCE'
  | 'BACKWARD_JUMP'
  | 'CONTRADICTORY_JUMPS'
  | 'UNREACHABLE_JUMP'
  | 'UNSATISFIABLE_CONDITION'
  | 'UNREACHABLE_PAGE'
  | 'PUBLIC_DEPENDS_ON_STAFF'
  | 'INCOMPATIBLE_MAPPING'
  | 'INVALID_BOUNDS'
  | 'INVALID_OPERATOR'
  | 'NO_ENDING';

export type PublishIssue = {
  code: PublishIssueCode;
  // Dari message, produced by the engine so client and server show the same
  // text for the same problem.
  message: string;
  itemId?: string;
  pageId?: string;
  ruleId?: string;
};

export type PublishValidation = {
  errors: PublishIssue[];
  warnings: PublishIssue[];
};

import { type CrmTarget, type CrmTargetField } from './FormDefinition';

// FILL: the CRM value is empty, the answer can fill it.
// SAME: nothing to change.
// CONFLICT: both have different values — shown to staff, never auto-applied.
// SKIP_BLANK: the answer is empty; existing CRM values are never cleared.
export type CrmProposalAction = 'FILL' | 'SAME' | 'CONFLICT' | 'SKIP_BLANK';

export type CrmProposal = {
  ruleId: string;
  questionId: string;
  target: CrmTarget;
  field: CrmTargetField;
  proposed: string | number | null;
  current: string | number | null;
  action: CrmProposalAction;
};

export type CrmExistingValues = Partial<
  Record<CrmTargetField, string | number | null | undefined>
>;

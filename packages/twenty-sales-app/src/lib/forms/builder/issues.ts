import { type FormDefinition, type PublishIssue } from '@shared/surveys';

// Where clicking a publish issue should take the builder: the tab that can
// fix it and the page/item/rule to select there.

export type WorkspaceTab =
  | 'builder'
  | 'logic'
  | 'appearance'
  | 'crm'
  | 'settings'
  | 'share'
  | 'responses'
  | 'insights';

export type IssueTarget = {
  tab: WorkspaceTab;
  itemId?: string;
  pageId?: string;
  ruleId?: string;
};

const LOGIC_CODES = new Set<PublishIssue['code']>([
  'BROKEN_REFERENCE',
  'FORWARD_REFERENCE',
  'BACKWARD_JUMP',
  'CONTRADICTORY_JUMPS',
  'UNREACHABLE_JUMP',
  'UNSATISFIABLE_CONDITION',
  'PUBLIC_DEPENDS_ON_STAFF',
  'INVALID_OPERATOR',
  'NO_ENDING',
]);

export const issueTarget = (
  issue: PublishIssue,
  definition: FormDefinition,
): IssueTarget => {
  const location = { itemId: issue.itemId, pageId: issue.pageId, ruleId: issue.ruleId };

  if (issue.ruleId !== undefined) {
    const isCrmRule =
      definition.crmMapping.some((rule) => rule.id === issue.ruleId) ||
      definition.automations.some((rule) => rule.id === issue.ruleId);

    if (isCrmRule) return { tab: 'crm', ...location };
  }

  if (issue.code === 'INCOMPATIBLE_MAPPING') return { tab: 'crm', ...location };
  if (LOGIC_CODES.has(issue.code)) return { tab: 'logic', ...location };

  return { tab: 'builder', ...location };
};

export const WORKSPACE_TABS: WorkspaceTab[] = [
  'builder',
  'logic',
  'appearance',
  'crm',
  'settings',
  'share',
  'responses',
  'insights',
];

export const toWorkspaceTab = (value: string): WorkspaceTab =>
  (WORKSPACE_TABS as string[]).includes(value) ? (value as WorkspaceTab) : 'builder';

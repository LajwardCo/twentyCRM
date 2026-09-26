import { type SurveyCrmAction } from '../../../api/surveys';

// The response's crmActions list is an append-only log whose `key` makes
// every staff action idempotent: a second "create lead" with the key already
// DONE is a no-op, whichever tab or device clicked it.

export type CrmLinkKind = 'company' | 'person' | 'opportunity';

export const CRM_LINK_FIELD: Record<CrmLinkKind, 'companyId' | 'personId' | 'opportunityId'> = {
  company: 'companyId',
  person: 'personId',
  opportunity: 'opportunityId',
};

// Short keys mirror the brief's examples ('create:lead', 'link:company').
const KIND_KEY: Record<CrmLinkKind, string> = {
  company: 'company',
  person: 'contact',
  opportunity: 'lead',
};

export const crmActionKey = (verb: 'create' | 'link' | 'apply', kind: CrmLinkKind): string =>
  `${verb}:${KIND_KEY[kind]}`;

export const hasDoneAction = (actions: SurveyCrmAction[], key: string): boolean =>
  actions.some((action) => action.key === key && action.status === 'DONE');

// A record an earlier "create" made but could not link to the response
// (logged PENDING). Linking that one is the retry; creating another would
// leave a duplicate company/contact/lead behind.
export const pendingRecordId = (actions: SurveyCrmAction[], key: string): string | null => {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index];

    if (action.key === key && action.status === 'PENDING' && typeof action.recordId === 'string') {
      return action.recordId;
    }
  }

  return null;
};

// One log entry per applied mapping rule. For interest/follow-up rules it is
// what stops a second apply from adding the same note or task again.
export const applyRuleKey = (ruleId: string): string => `apply:${ruleId}`;

export const hasAppliedRule = (actions: SurveyCrmAction[], ruleId: string): boolean =>
  hasDoneAction(actions, applyRuleKey(ruleId));

export const appendCrmAction = (
  actions: SurveyCrmAction[],
  entry: Omit<SurveyCrmAction, 'at'> & { at?: string },
): SurveyCrmAction[] => {
  // A kind is created at most once per response. Linking may later point at
  // a different record (a corrected link), so only an identical link is a
  // repeat. "apply" can legitimately repeat (a later review fills more).
  const repeat = entry.key.startsWith('create:')
    ? hasDoneAction(actions, entry.key)
    : entry.key.startsWith('link:') &&
      actions.some(
        (action) => action.key === entry.key && action.status === 'DONE' && action.recordId === entry.recordId,
      );

  if (repeat) return actions;

  return [...actions, { ...entry, at: entry.at ?? new Date().toISOString() }];
};

export type LinkState = {
  companyId: string | null;
  personId: string | null;
  opportunityId: string | null;
};

// Invitation suggestions that still need a decision: the target is not
// linked yet (or is linked to a different record).
export const pendingSuggestions = (
  actions: SurveyCrmAction[],
  links: LinkState,
): (SurveyCrmAction & { target: CrmLinkKind; recordId: string })[] =>
  actions.filter(
    (action): action is SurveyCrmAction & { target: CrmLinkKind; recordId: string } =>
      action.status === 'SUGGESTED' &&
      (action.target === 'company' || action.target === 'person' || action.target === 'opportunity') &&
      typeof action.recordId === 'string' &&
      links[CRM_LINK_FIELD[action.target]] !== action.recordId,
  );

export const automationActions = (actions: SurveyCrmAction[]): SurveyCrmAction[] =>
  actions.filter((action) => action.status !== 'SUGGESTED');

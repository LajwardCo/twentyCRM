import { type CrmProposal, type FormDefinition, proposeCrmChanges } from '@shared/surveys';
import { useState } from 'react';

import { type CurrentUser } from '../../../../api/auth';
import { normalizePhone } from '../../../../api/records';
import { fetchExistingCrmValues } from '../../../../api/surveyCrm';
import {
  createResponseNote,
  createResponseTask,
  updateCompanyFields,
  updateOpportunityFields,
  updatePersonFields,
} from '../../../../api/surveyResponseExtras';
import { type SurveyCrmAction, type SurveyResponse, fetchResponse, updateResponse } from '../../../../api/surveys';
import { toPersianDigits } from '../../../../lib/jalali';
import { CRM_FIELD_LABELS, TSR } from '../../../../lib/forms/responseStrings';
import { appendCrmAction, applyRuleKey, hasAppliedRule } from '../../../../lib/forms/responses/crmActionLog';
import {
  type DiffSelection,
  buildCrmPatches,
  initialDiffSelection,
  isAppendOnly,
  isEmptyPatch,
  revalidateChanges,
  selectedChanges,
  visibleDiffRows,
} from '../../../../lib/forms/responses/crmDiff';

type CrmApplyChangesProps = {
  response: SurveyResponse;
  definition: FormDefinition;
  user: CurrentUser;
  onApplied: () => Promise<void> | void;
};

type Links = { companyId: string | null; personId: string | null; opportunityId: string | null };

// One comparison: the proposals, the links they were computed for and the
// append-only rules that already ran.
type Comparison = { proposals: CrmProposal[]; links: Links; applied: Set<string> };

const linksOf = (response: SurveyResponse): Links => ({
  companyId: response.company?.id ?? null,
  personId: response.person?.id ?? null,
  opportunityId: response.opportunity?.id ?? null,
});

const sameLinks = (left: Links, right: Links): boolean =>
  left.companyId === right.companyId && left.personId === right.personId && left.opportunityId === right.opportunityId;

const isLinked = (links: Links, proposal: CrmProposal): boolean =>
  (proposal.target === 'company'
    ? links.companyId
    : proposal.target === 'person'
      ? links.personId
      : links.opportunityId) !== null;

const appliedRules = (actions: SurveyCrmAction[], proposals: CrmProposal[]): Set<string> =>
  new Set(proposals.filter((proposal) => hasAppliedRule(actions, proposal.ruleId)).map((proposal) => proposal.ruleId));

const compareWithCrm = async (response: SurveyResponse, definition: FormDefinition): Promise<Comparison> => {
  const links = linksOf(response);
  const proposals = proposeCrmChanges(definition, response.answers, await fetchExistingCrmValues(links));

  return { proposals, links, applied: appliedRules(response.crmActions, proposals) };
};

// An interest note or follow-up task that was already added is never added again.
const isDone = (comparison: Comparison, proposal: CrmProposal): boolean =>
  isAppendOnly(proposal) && comparison.applied.has(proposal.ruleId);

const applicable = (comparison: Comparison, selection: DiffSelection): CrmProposal[] =>
  selectedChanges(comparison.proposals, selection).filter(
    (proposal) => isLinked(comparison.links, proposal) && !isDone(comparison, proposal),
  );

const show = (value: string | number | null) => (value === null || value === '' ? '—' : String(value));

// Review-first update of already-linked records: FILL rows start checked,
// CONFLICT rows need an explicit "use the answer", blank answers can never
// clear a CRM value, identical values are not shown at all. Applying re-reads
// the response and the CRM first and writes only rows nothing has moved under;
// every rule applied is logged (apply:<ruleId>) as soon as it takes effect, so
// a retry after a partial failure repeats nothing.
export const CrmApplyChanges = ({ response, definition, user, onApplied }: CrmApplyChangesProps) => {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [selection, setSelection] = useState<DiffSelection>({});
  const [state, setState] = useState<'idle' | 'loading' | 'applying'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const showComparison = (next: Comparison) => {
    const initial = initialDiffSelection(next.proposals);

    setComparison(next);
    // A FILL for a record that is not linked yet has nowhere to go.
    setSelection(
      Object.fromEntries(
        next.proposals.map((proposal) => [
          proposal.ruleId,
          initial[proposal.ruleId] && isLinked(next.links, proposal) && !isDone(next, proposal),
        ]),
      ),
    );
  };

  const reload = async (): Promise<boolean> => {
    const fresh = await fetchResponse(response.id);

    if (fresh === null) return false;

    showComparison(await compareWithCrm(fresh, definition));

    return true;
  };

  const compare = async () => {
    setState('loading');
    setMessage(null);

    try {
      showComparison(await compareWithCrm(response, definition));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setState('idle');
    }
  };

  const apply = async () => {
    if (comparison === null || state !== 'idle') return;

    const reviewed = applicable(comparison, selection);

    if (reviewed.length === 0) return;

    setState('applying');
    setMessage(null);

    let appliedCount = 0;

    try {
      const fresh = await fetchResponse(response.id);

      if (fresh === null) throw new Error(TSR.notFound);

      const now = await compareWithCrm(fresh, definition);

      if (!sameLinks(now.links, comparison.links)) {
        showComparison(now);
        setMessage(TSR.linksChanged);

        return;
      }

      const { valid, stale } = revalidateChanges(reviewed, now.proposals);
      const changes = valid.filter((proposal) => isLinked(now.links, proposal) && !isDone(now, proposal));
      const fieldChanges = changes.filter((proposal) => !isAppendOnly(proposal));
      const leadId = now.links.opportunityId;
      let actions = fresh.crmActions;

      const log = async (applied: CrmProposal[], recordId?: string) => {
        for (const proposal of applied) {
          actions = appendCrmAction(actions, {
            key: applyRuleKey(proposal.ruleId),
            type: 'APPLY',
            status: 'DONE',
            by: user.workspaceMemberId,
            recordId:
              recordId ??
              (proposal.target === 'company'
                ? now.links.companyId
                : proposal.target === 'person'
                  ? now.links.personId
                  : leadId),
            target: proposal.target,
          });
        }

        await updateResponse(fresh.id, { crmActions: actions });
      };

      if (fieldChanges.length > 0) {
        const patches = buildCrmPatches(fieldChanges, normalizePhone);

        if (now.links.companyId !== null && !isEmptyPatch(patches.company)) await updateCompanyFields(now.links.companyId, patches.company);
        if (now.links.personId !== null && !isEmptyPatch(patches.person)) await updatePersonFields(now.links.personId, patches.person);
        if (leadId !== null && !isEmptyPatch(patches.opportunity)) await updateOpportunityFields(leadId, patches.opportunity);

        await log(fieldChanges);
        appliedCount += fieldChanges.length;
      }

      for (const change of changes.filter(isAppendOnly)) {
        const text = String(change.proposed ?? '').trim();
        const record = (recordId: string) => log([change], recordId);

        if (change.field === 'opportunity.interest') {
          await createResponseNote({ responseId: fresh.id, opportunityId: leadId, title: TSR.interestNoteTitle, body: text }, record);
        } else {
          await createResponseTask(
            { responseId: fresh.id, opportunityId: leadId, title: text, dueAt: null, assigneeId: user.workspaceMemberId },
            record,
          );
        }

        appliedCount += 1;
      }

      await onApplied();

      const done = TSR.applied(toPersianDigits(appliedCount));

      if (stale.length > 0 && (await reload())) {
        setMessage(`${done} — ${TSR.staleRows(toPersianDigits(stale.length))}`);
      } else {
        setComparison(null);
        setMessage(done);
      }
    } catch (error) {
      setMessage(`${TSR.applyFailed}: ${error instanceof Error ? error.message : String(error)}`);
      // Rows that did take effect are logged; show them as such.
      if (appliedCount > 0) await reload().catch(() => false);
    } finally {
      setState('idle');
    }
  };

  if (definition.crmMapping.length === 0) return <p className="svr-muted">{TSR.noMapping}</p>;

  const rows = comparison === null ? [] : visibleDiffRows(comparison.proposals);
  const chosenCount = comparison === null ? 0 : applicable(comparison, selection).length;
  const toggle = (ruleId: string, checked: boolean) => setSelection((previous) => ({ ...previous, [ruleId]: checked }));

  return (
    <div className="svr-apply">
      <p className="svr-muted">{TSR.applyHint}</p>
      <button type="button" className="btn line sm" disabled={state !== 'idle'} onClick={() => void compare()}>
        {state === 'loading' ? TSR.loading : TSR.loadDiff}
      </button>

      {comparison !== null && rows.length === 0 && <p className="svr-muted">{TSR.noChanges}</p>}

      {rows.length > 0 && (
        <div className="svr-diff" role="table" aria-label={TSR.applyChanges}>
          {rows.map((proposal) => {
            const linked = comparison !== null && isLinked(comparison.links, proposal);
            const done = comparison !== null && isDone(comparison, proposal);
            const checked = selection[proposal.ruleId] === true;

            return (
              <div key={proposal.ruleId} className={`svr-diff-row svr-diff-${proposal.action.toLowerCase()}`} role="row">
                <div className="svr-diff-field" role="cell">{CRM_FIELD_LABELS[proposal.field] ?? proposal.field}</div>
                <div className="svr-diff-values" role="cell">
                  <span className="svr-diff-current" dir="auto">{show(proposal.current)}</span>
                  <span aria-hidden="true">←</span>
                  <span className="svr-diff-proposed" dir="auto">{proposal.action === 'SKIP_BLANK' ? TSR.blankKept : show(proposal.proposed)}</span>
                </div>
                <div className="svr-diff-choice" role="cell">
                  {!linked && proposal.action !== 'SKIP_BLANK' && <span className="svr-muted">{TSR.needLinkFor}</span>}
                  {linked && done && <span className="svr-muted">{TSR.alreadyApplied}</span>}
                  {linked && !done && proposal.action === 'FILL' && (
                    <label>
                      <input type="checkbox" checked={checked} onChange={(event) => toggle(proposal.ruleId, event.target.checked)} />
                      {TSR.useAnswer}
                    </label>
                  )}
                  {linked && proposal.action === 'CONFLICT' && (
                    <span className="svr-conflict-choice" role="radiogroup">
                      <label>
                        <input type="radio" name={`c-${proposal.ruleId}`} checked={!checked} onChange={() => toggle(proposal.ruleId, false)} />
                        {TSR.keepCurrent}
                      </label>
                      <label>
                        <input type="radio" name={`c-${proposal.ruleId}`} checked={checked} onChange={() => toggle(proposal.ruleId, true)} />
                        {TSR.useAnswer}
                      </label>
                    </span>
                  )}
                  {proposal.action === 'SKIP_BLANK' && <input type="checkbox" disabled checked={false} aria-label={TSR.blankKept} />}
                </div>
              </div>
            );
          })}
          <button type="button" className="btn gold sm" disabled={chosenCount === 0 || state !== 'idle'} onClick={() => void apply()}>
            {state === 'applying' ? TSR.applying : `${TSR.applyChanges} (${toPersianDigits(chosenCount)})`}
          </button>
        </div>
      )}

      {message !== null && <p className="svr-action-message" role="status">{message}</p>}
    </div>
  );
};

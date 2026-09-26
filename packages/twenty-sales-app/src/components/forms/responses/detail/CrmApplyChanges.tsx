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
import { type SurveyResponse, fetchResponse, updateResponse } from '../../../../api/surveys';
import { toPersianDigits } from '../../../../lib/jalali';
import { CRM_FIELD_LABELS, TSR } from '../../../../lib/forms/responseStrings';
import { appendCrmAction } from '../../../../lib/forms/responses/crmActionLog';
import {
  type DiffSelection,
  buildCrmPatches,
  initialDiffSelection,
  isEmptyPatch,
  selectedChanges,
  visibleDiffRows,
} from '../../../../lib/forms/responses/crmDiff';

type CrmApplyChangesProps = {
  response: SurveyResponse;
  definition: FormDefinition;
  user: CurrentUser;
  onApplied: () => Promise<void> | void;
};

const isLinked = (response: SurveyResponse, proposal: CrmProposal): boolean =>
  proposal.target === 'company'
    ? response.company !== null
    : proposal.target === 'person'
      ? response.person !== null
      : response.opportunity !== null;

const show = (value: string | number | null) => (value === null || value === '' ? '—' : String(value));

// Review-first update of already-linked records: FILL rows start checked,
// CONFLICT rows need an explicit "use the answer", blank answers can never
// clear a CRM value, identical values are not shown at all.
export const CrmApplyChanges = ({ response, definition, user, onApplied }: CrmApplyChangesProps) => {
  const [proposals, setProposals] = useState<CrmProposal[] | null>(null);
  const [selection, setSelection] = useState<DiffSelection>({});
  const [state, setState] = useState<'idle' | 'loading' | 'applying'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const compare = async () => {
    setState('loading');
    setMessage(null);

    try {
      const existing = await fetchExistingCrmValues({
        companyId: response.company?.id ?? null,
        personId: response.person?.id ?? null,
        opportunityId: response.opportunity?.id ?? null,
      });
      const next = proposeCrmChanges(definition, response.answers, existing);
      const initial = initialDiffSelection(next);

      setProposals(next);
      // A FILL for a record that is not linked yet has nowhere to go.
      setSelection(
        Object.fromEntries(next.map((proposal) => [proposal.ruleId, initial[proposal.ruleId] && isLinked(response, proposal)])),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setState('idle');
    }
  };

  const apply = async () => {
    if (proposals === null || state !== 'idle') return;

    const changes = selectedChanges(proposals, selection).filter((proposal) => isLinked(response, proposal));

    if (changes.length === 0) return;

    setState('applying');
    setMessage(null);

    try {
      const patches = buildCrmPatches(changes, normalizePhone);
      const leadId = response.opportunity?.id ?? null;

      if (response.company !== null && !isEmptyPatch(patches.company)) await updateCompanyFields(response.company.id, patches.company);
      if (response.person !== null && !isEmptyPatch(patches.person)) await updatePersonFields(response.person.id, patches.person);
      if (leadId !== null && !isEmptyPatch(patches.opportunity)) await updateOpportunityFields(leadId, patches.opportunity);

      for (const interest of patches.interestNotes) {
        await createResponseNote({ responseId: response.id, opportunityId: leadId, title: TSR.interestNoteTitle, body: interest });
      }

      for (const followUp of patches.followUps) {
        await createResponseTask({
          responseId: response.id,
          opportunityId: leadId,
          title: followUp,
          dueAt: null,
          assigneeId: user.workspaceMemberId,
        });
      }

      const fresh = await fetchResponse(response.id);
      let actions = fresh?.crmActions ?? response.crmActions;

      for (const target of new Set(changes.map((change) => change.target))) {
        actions = appendCrmAction(actions, {
          key: `apply:${target}`,
          type: 'APPLY',
          status: 'DONE',
          by: user.workspaceMemberId,
          recordId: target === 'company' ? response.company?.id : target === 'person' ? response.person?.id : leadId,
          target,
        });
      }

      await updateResponse(response.id, { crmActions: actions });
      setProposals(null);
      setMessage(TSR.applied(toPersianDigits(changes.length)));
      await onApplied();
    } catch (error) {
      setMessage(`${TSR.applyFailed}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setState('idle');
    }
  };

  if (definition.crmMapping.length === 0) return <p className="svr-muted">{TSR.noMapping}</p>;

  const rows = proposals === null ? [] : visibleDiffRows(proposals);
  const chosenCount = proposals === null ? 0 : selectedChanges(proposals, selection).filter((proposal) => isLinked(response, proposal)).length;
  const toggle = (ruleId: string, checked: boolean) => setSelection((previous) => ({ ...previous, [ruleId]: checked }));

  return (
    <div className="svr-apply">
      <p className="svr-muted">{TSR.applyHint}</p>
      <button type="button" className="btn line sm" disabled={state !== 'idle'} onClick={() => void compare()}>
        {state === 'loading' ? TSR.loading : TSR.loadDiff}
      </button>

      {proposals !== null && rows.length === 0 && <p className="svr-muted">{TSR.noChanges}</p>}

      {rows.length > 0 && (
        <div className="svr-diff" role="table" aria-label={TSR.applyChanges}>
          {rows.map((proposal) => {
            const linked = isLinked(response, proposal);
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
                  {linked && proposal.action === 'FILL' && (
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

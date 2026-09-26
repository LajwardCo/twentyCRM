import { useCallback, useEffect, useRef, useState } from 'react';

import { type CurrentUser } from '../../api/auth';
import { toPersianDigits } from '../../lib/jalali';
import { fetchLinkLabels } from '../../api/surveyCollect';
import {
  type SurveyCampaign,
  type SurveyFormSummary,
  type SurveyFormVersion,
  createVisitTask,
  fetchForm,
  fetchVersion,
  linkVisitTaskTargets,
  listCampaigns,
  listForms,
} from '../../api/surveys';
import { ErrorCard, LoadingCard, SavedPanel } from '../../components/forms/collect/CollectChrome';
import { StaffCollectForm } from '../../components/forms/collect/StaffCollectForm';
import { VisitBusinessStep } from '../../components/forms/collect/VisitBusinessStep';
import { VisitOutcomeStep, VisitSurveyStep } from '../../components/forms/collect/VisitChoiceSteps';
import { NO_LINKS, parseCollectLinks } from '../../lib/forms/collect/prefill';
import { safeLocalStorage } from '../../lib/forms/collect/staffDraft';
import { outcomeCollectsSurvey, reconcileOutcome, visitTaskTitle } from '../../lib/forms/collect/visitOutcome';
import { EMPTY_VISIT, type VisitState, type VisitStep, parseVisitState, visitStepIndex } from '../../lib/forms/collect/visitState';
import { TC } from '../../lib/forms/collectStrings';

const STEP_LABELS: { step: VisitStep; label: string }[] = [
  { step: 'business', label: TC.stepBusiness },
  { step: 'survey', label: TC.stepSurvey },
  { step: 'outcome', label: TC.stepOutcome },
  { step: 'collect', label: TC.stepCollect },
];

// The field employee's visit on a phone: find or add the business, pick a
// survey (or none), record what happened, collect answers if the visit
// allowed it, then save — a visit task always, a response only when a survey
// was actually collected.
export const VisitFlowView = ({ query, user }: { query: string; user: CurrentUser }) => {
  const storageKey = `svc-visit:${user.workspaceMemberId}`;
  const [visit, setVisit] = useState<VisitState>(() => {
    try {
      return parseVisitState(safeLocalStorage()?.getItem(storageKey) ?? null) ?? EMPTY_VISIT;
    } catch {
      return EMPTY_VISIT;
    }
  });
  const visitRef = useRef(visit);
  const [choices, setChoices] = useState<{ forms: SurveyFormSummary[]; campaigns: SurveyCampaign[] } | null>(null);
  const [choicesFailed, setChoicesFailed] = useState(false);
  const [version, setVersion] = useState<{ formId: string; formName: string; version: SurveyFormVersion } | 'error' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  visitRef.current = visit;

  const patch = useCallback((next: Partial<VisitState>) => {
    const merged = { ...visitRef.current, ...next };

    visitRef.current = merged;
    setVisit(merged);

    try {
      if (merged.step === 'done') safeLocalStorage()?.removeItem(storageKey);
      else safeLocalStorage()?.setItem(storageKey, JSON.stringify(merged));
    } catch {
      // device storage unavailable: the visit still works in memory
    }
  }, [storageKey]);

  const loadChoices = useCallback(async () => {
    setChoicesFailed(false);

    try {
      const [forms, campaigns] = await Promise.all([listForms(), listCampaigns().catch(() => [])]);

      setChoices({
        forms: forms.supported ? forms.forms.filter((form) => form.formStatus === 'PUBLISHED' && form.publishedVersion !== null) : [],
        campaigns: campaigns.filter((campaign) => campaign.campaignStatus === 'ACTIVE'),
      });
    } catch {
      setChoicesFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadChoices();
  }, [loadChoices]);

  // Opened from a company page (?companyId=…): start a visit for it.
  useEffect(() => {
    const links = parseCollectLinks(query);

    if (links.companyId === null || links.companyId === visitRef.current.company?.id) return;

    void fetchLinkLabels({ ...NO_LINKS, companyId: links.companyId }).then((labels) => {
      if (labels.company !== undefined) {
        patch({ ...EMPTY_VISIT, step: 'survey', company: { id: labels.company.recordId, label: labels.company.label } });
      }
    });
  }, [query, patch]);

  const formId = visit.formId !== null && visit.formId !== 'none' ? visit.formId : null;

  useEffect(() => {
    if (visit.step !== 'collect' || formId === null || version === 'error') return;
    if (version !== null && version.formId === formId) return;

    setVersion(null);
    void (async () => {
      try {
        const form = await fetchForm(formId);
        const loaded = form.publishedVersion === null ? null : await fetchVersion(form.publishedVersion.id);

        setVersion(loaded === null ? 'error' : { formId, formName: form.name, version: loaded });
      } catch {
        setVersion('error');
      }
    })();
  }, [visit.step, formId, version]);

  // Task ids whose targets are known to be complete in this session.
  const linkedVisitIds = useRef(new Set<string>());

  // Creates the visit task once. The id is stored the moment the task exists
  // (before its targets are linked), so a retry after any later failure
  // finishes that task rather than creating a second one; linking is
  // idempotent and re-checked once per session.
  const ensureVisitTask = async (): Promise<string> => {
    const current = visitRef.current;
    const targets = { companyId: current.company?.id ?? null, opportunityId: null };

    if (current.visitId !== null) {
      if (!linkedVisitIds.current.has(current.visitId)) {
        await linkVisitTaskTargets(current.visitId, targets);
        linkedVisitIds.current.add(current.visitId);
      }

      return current.visitId;
    }

    const task = await createVisitTask(
      {
        ...targets,
        title: visitTaskTitle(current.company?.label ?? ''),
        visitOutcome: current.outcome ?? 'REVISIT_NEEDED',
        assigneeId: user.workspaceMemberId,
        surveyCampaignId: current.campaignId,
        notes: current.notes.trim(),
      },
      (taskId) => patch({ visitId: taskId }),
    );

    linkedVisitIds.current.add(task.id);

    return task.id;
  };

  const saveVisitOnly = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      await ensureVisitTask();
      patch({ step: 'done', responseId: null });
    } catch {
      setSaveError(TC.visitFailed);
    } finally {
      setSaving(false);
    }
  };

  const surveyChosen = formId !== null;
  const collects = outcomeCollectsSurvey(visit.outcome, surveyChosen);
  const stepIndex = visitStepIndex(visit.step);

  const body = (() => {
    switch (visit.step) {
      case 'business':
        return (
          <VisitBusinessStep
            onPick={(company, person) => patch({ company, person, step: 'survey', visitId: null })}
          />
        );
      case 'survey':
        if (choicesFailed) return <ErrorCard message={TC.loadFailed} onRetry={() => void loadChoices()} />;
        if (choices === null) return <LoadingCard />;

        return (
          <VisitSurveyStep
            forms={choices.forms}
            campaigns={choices.campaigns}
            formId={visit.formId}
            campaignId={visit.campaignId}
            onChange={(next) => {
              const nextFormId = next.formId ?? visit.formId;

              patch({
                ...next,
                outcome: reconcileOutcome(visit.outcome, nextFormId !== null && nextFormId !== 'none'),
              });
            }}
          />
        );
      case 'outcome':
        return (
          <VisitOutcomeStep
            surveyChosen={surveyChosen}
            outcome={visit.outcome}
            notes={visit.notes}
            onChange={(next) => patch(next)}
          />
        );
      case 'collect':
        if (version === 'error') return <ErrorCard message={TC.loadFailed} onRetry={() => setVersion(null)} />;
        if (version === null || formId === null) return <LoadingCard />;

        return (
          <StaffCollectForm
            version={version.version}
            formName={version.formName}
            memberId={user.workspaceMemberId}
            draftScope={`visit:${visit.company?.id ?? '-'}`}
            links={{
              ...NO_LINKS,
              companyId: visit.company?.id ?? null,
              personId: visit.person?.id ?? null,
              campaignId: visit.campaignId,
            }}
            linkLabels={{
              ...(visit.company !== null ? { company: { recordId: visit.company.id, label: visit.company.label } } : {}),
              ...(visit.person !== null ? { person: { recordId: visit.person.id, label: visit.person.label } } : {}),
            }}
            prepareSave={async () => ({ visitId: await ensureVisitTask() })}
            onSaved={({ responseId }) => patch({ step: 'done', responseId })}
            header={
              // Once the visit task exists its outcome is final.
              visit.visitId === null ? (
                <button type="button" className="btn line sm svc-back-link" onClick={() => patch({ step: 'outcome' })}>
                  {TC.back}: {TC.stepOutcome}
                </button>
              ) : undefined
            }
          />
        );
      default:
        return null;
    }
  })();

  if (visit.step === 'done') {
    return (
      <main className="page svc-page">
        <SavedPanel
          title={visit.responseId === null ? TC.visitSaved : TC.visitSavedWithResponse}
          detail={<span dir="auto">{visit.company?.label}</span>}
          responseId={visit.responseId}
          anotherLabel={TC.newVisit}
          onAnother={() => patch({ ...EMPTY_VISIT })}
        />
      </main>
    );
  }

  const canContinue =
    (visit.step === 'survey' && visit.formId !== null) || (visit.step === 'outcome' && visit.outcome !== null);

  return (
    <main className="page svc-page">
      <div className="page-head">
        <div>
          <h1>{TC.visitTitle}</h1>
          <div className="sub">{TC.visitSub}</div>
        </div>
      </div>

      <ol className="svc-stepper" aria-label={TC.visitTitle}>
        {STEP_LABELS.filter((entry) => entry.step !== 'collect' || collects).map((entry, index) => (
          <li
            key={entry.step}
            className={visitStepIndex(entry.step) < stepIndex ? 'done' : entry.step === visit.step ? 'on' : ''}
            aria-current={entry.step === visit.step ? 'step' : undefined}
          >
            <span className="svc-stepper-dot">{toPersianDigits(index + 1)}</span>
            {entry.label}
          </li>
        ))}
      </ol>

      {visit.company !== null && visit.step !== 'business' && (
        <div className="svc-chip-row">
          <span className="svc-chip">
            {TC.linkedTo}: <b dir="auto">{visit.company.label}</b>
          </span>
          {visit.visitId === null && (
            <button type="button" className="btn line sm" onClick={() => patch({ ...EMPTY_VISIT })}>
              {TC.changeBusiness}
            </button>
          )}
        </div>
      )}

      <section className={visit.step === 'collect' ? undefined : 'card svc-step'}>{body}</section>

      {saveError !== null && <div className="error-banner" role="alert">{saveError}</div>}

      {(visit.step === 'survey' || visit.step === 'outcome') && (
        <div className="svc-actions svc-sticky-actions">
          <button
            type="button"
            className="btn line"
            onClick={() => patch({ step: visit.step === 'survey' ? 'business' : 'survey' })}
            disabled={visit.visitId !== null}
          >
            {TC.back}
          </button>
          {visit.step === 'survey' ? (
            <button type="button" className="btn gold svc-big" disabled={!canContinue} onClick={() => patch({ step: 'outcome' })}>
              {TC.next}
            </button>
          ) : collects ? (
            <button type="button" className="btn gold svc-big" disabled={!canContinue} onClick={() => patch({ step: 'collect' })}>
              {TC.continueToSurvey}
            </button>
          ) : (
            <button
              type="button"
              className="btn gold svc-big"
              disabled={!canContinue || saving}
              onClick={() => void saveVisitOnly()}
            >
              {saving ? TC.savingVisit : TC.saveVisit}
            </button>
          )}
        </div>
      )}
    </main>
  );
};

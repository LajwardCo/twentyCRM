import { useId, useMemo, useState } from 'react';

import {
  type SurveyFormStatus,
  type SurveyFormSummary,
  type SurveyPurpose,
  duplicateForm,
  fetchForm,
  listCampaigns,
  listForms,
} from '../../api/surveys';
import { FormsListItems, type FormRowActions } from '../../components/forms/builder/FormsListItems';
import { StatusChangeDialog } from '../../components/forms/builder/StatusChangeDialog';
import { IconPlus, IconSearch, IconTable } from '../../components/icons';
import { invalidateCache, useCached } from '../../lib/cache';
import { TB } from '../../lib/forms/builderStrings';
import {
  DEFAULT_FORMS_FILTERS,
  type FormsListFilters,
  type FormsSort,
  type StatusAction,
  type StatusFilter,
  copyName,
  filterForms,
  statusActionsFor,
} from '../../lib/forms/builder/formsList';
import { FORM_STATUS_LABELS, PURPOSE_LABELS, TSV } from '../../lib/forms/surveyStrings';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';
import { navigate } from '../../lib/router';

const VIEW_KEY = 'svb-forms-view';

const readView = (): 'cards' | 'table' => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
};

const openPrint = (formId: string) =>
  window.open(`${window.location.pathname}#/form/${formId}/print`, '_blank', 'noopener');

export const FormsListView = () => {
  const id = useId();
  const { capabilities } = useSurveyCapabilities();
  const { data, error, refresh } = useCached('survey-forms', listForms);
  const { data: campaigns } = useCached('survey-campaigns', () => listCampaigns().catch(() => []));
  const [filters, setFilters] = useState<FormsListFilters>(DEFAULT_FORMS_FILTERS);
  const [view, setView] = useState<'cards' | 'table'>(readView);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; formId?: string; error?: boolean } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<{ form: SurveyFormSummary; action: StatusAction } | null>(null);
  const set = (patch: Partial<FormsListFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const forms = data?.supported === true ? data.forms : [];
  const counts = data?.supported === true ? data.responseCounts : {};
  const shown = useMemo(() => filterForms(forms, counts, filters), [forms, counts, filters]);
  const archivedCount = forms.filter((form) => form.formStatus === 'ARCHIVED').length;
  const owners = useMemo(() => {
    const byId = new Map<string, string>();

    for (const form of forms) {
      if (form.owner !== null) byId.set(form.owner.id, `${form.owner.name.firstName} ${form.owner.name.lastName}`.trim());
    }

    return [...byId.entries()];
  }, [forms]);

  const changeView = (next: 'cards' | 'table') => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  };

  const duplicate = async (form: SurveyFormSummary) => {
    setBusyId(form.id);
    setNotice({ text: TB.duplicating });
    try {
      const full = await fetchForm(form.id);
      const created = await duplicateForm(full, copyName(form.name));

      invalidateCache('survey-forms');
      await refresh();
      setNotice({ text: TB.duplicated, formId: created.id });
    } catch (failure) {
      setNotice({ text: `${TB.actionFailed}: ${failure instanceof Error ? failure.message : ''}`, error: true });
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor: FormRowActions = (form) => {
    const primary = [
      {
        key: 'edit',
        label: capabilities.canBuild && form.formStatus !== 'ARCHIVED' ? TSV.edit : TB.tabs.builder,
        onSelect: () => navigate(`/form/${form.id}/builder`),
      },
      { key: 'preview', label: TSV.preview, onSelect: () => navigate(`/form/${form.id}/preview`) },
    ];
    const more = [
      { key: 'responses', label: TSV.responses, onSelect: () => navigate(`/form/${form.id}/responses`) },
      { key: 'share', label: TSV.share, onSelect: () => navigate(`/form/${form.id}/share`) },
      { key: 'print', label: TSV.print, onSelect: () => openPrint(form.id) },
      ...(capabilities.canBuild ? [{ key: 'duplicate', label: TSV.duplicate, onSelect: () => void duplicate(form) }] : []),
      ...(capabilities.canPublish
        ? statusActionsFor(form).map((action) => ({
            key: action.kind,
            label: TB.statusAction[action.kind],
            danger: action.kind === 'archive' || action.kind === 'close',
            onSelect: () => setPendingStatus({ form, action }),
          }))
        : []),
    ];

    return { primary, more };
  };

  const filtersActive =
    filters.search !== '' || filters.status !== 'ACTIVE' || filters.ownerId !== '' || filters.purpose !== '' || filters.campaignId !== '';

  return (
    <main className="page svb-list">
      <div className="page-head">
        <div>
          <h1>{TSV.pageTitle}</h1>
          <div className="sub">{TSV.pageSub}</div>
        </div>
        <div className="svb-inline">
          {capabilities.canBuild && (
            <button type="button" className="btn gold" onClick={() => navigate('/forms/new')}>
              <IconPlus size={16} />
              {TSV.newForm}
            </button>
          )}
          {capabilities.canCollect && (
            <>
              <button type="button" className="btn line" onClick={() => navigate('/visit')}>
                {TSV.startVisit}
              </button>
              <button type="button" className="btn line" onClick={() => navigate('/paper')}>
                {TSV.enterPaper}
              </button>
            </>
          )}
          <button type="button" className="btn line" onClick={() => navigate('/responses')}>
            {TSV.navResponses}
          </button>
        </div>
      </div>

      {data?.supported === false && <div className="error-banner">{TSV.notProvisioned}</div>}
      {error !== null && data === null && (
        <div className="error-banner" role="alert">
          {TSV.loadError}{' '}
          <button type="button" className="btn line sm" onClick={() => void refresh()}>
            {TSV.retry}
          </button>
        </div>
      )}
      {notice !== null && (
        <p className={notice.error ? 'error-banner' : 'svb-note ok'} role="status">
          {notice.text}
          {notice.formId !== undefined && (
            <>
              {' '}
              <a href={`#/form/${notice.formId}/builder`}>{TSV.edit}</a>
            </>
          )}
        </p>
      )}

      {data?.supported !== false && (
        <div className="svb-toolbar" role="search">
          <label className="svb-search">
            <IconSearch size={15} />
            <span className="svb-sr">{TSV.search}</span>
            <input type="search" value={filters.search} placeholder={TSV.search} onChange={(event) => set({ search: event.target.value })} />
          </label>
          <label className="svb-filter">
            <span className="svb-sr">{TB.filterStatus}</span>
            <select aria-label={TB.filterStatus} value={filters.status} onChange={(event) => set({ status: event.target.value as StatusFilter })}>
              <option value="ACTIVE">{TB.statusActive}</option>
              <option value="ALL">{TB.statusAll}</option>
              {(Object.keys(FORM_STATUS_LABELS) as SurveyFormStatus[]).map((status) => (
                <option key={status} value={status}>
                  {FORM_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <select aria-label={TB.filterOwner} value={filters.ownerId} onChange={(event) => set({ ownerId: event.target.value })}>
            <option value="">{TB.anyOwner}</option>
            {owners.map(([ownerId, name]) => (
              <option key={ownerId} value={ownerId}>
                {name}
              </option>
            ))}
          </select>
          <select aria-label={TB.filterPurpose} value={filters.purpose} onChange={(event) => set({ purpose: event.target.value as SurveyPurpose | '' })}>
            <option value="">{TB.anyPurpose}</option>
            {(Object.keys(PURPOSE_LABELS) as SurveyPurpose[]).map((purpose) => (
              <option key={purpose} value={purpose}>
                {PURPOSE_LABELS[purpose]}
              </option>
            ))}
          </select>
          {(campaigns ?? []).length > 0 && (
            <select aria-label={TB.filterCampaign} value={filters.campaignId} onChange={(event) => set({ campaignId: event.target.value })}>
              <option value="">{TB.anyCampaign}</option>
              {(campaigns ?? []).map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          )}
          <label className="svb-filter">
            <span className="svb-muted">{TB.sort}</span>
            <select id={`${id}-sort`} value={filters.sort} onChange={(event) => set({ sort: event.target.value as FormsSort })}>
              <option value="updated">{TSV.sortUpdated}</option>
              <option value="name">{TSV.sortName}</option>
              <option value="responses">{TSV.sortResponses}</option>
            </select>
          </label>
          <div className="seg" role="group" aria-label={TB.view}>
            <button type="button" className={view === 'cards' ? 'on' : ''} aria-pressed={view === 'cards'} onClick={() => changeView('cards')}>
              {TSV.cards}
            </button>
            <button type="button" className={view === 'table' ? 'on' : ''} aria-pressed={view === 'table'} onClick={() => changeView('table')}>
              <IconTable size={14} />
              {TSV.table}
            </button>
          </div>
        </div>
      )}

      {data === null && error === null && (
        <div className="svb-form-grid" aria-busy="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="skeleton svb-skeleton-card" />
          ))}
        </div>
      )}

      {data?.supported === true && forms.length === 0 && (
        <div className="card empty-state">
          <p>{TSV.empty}</p>
          <p>{TSV.emptyHint}</p>
          {capabilities.canBuild && (
            <button type="button" className="btn gold" onClick={() => navigate('/forms/new')}>
              {TSV.newForm}
            </button>
          )}
        </div>
      )}

      {data?.supported === true && forms.length > 0 && shown.length === 0 && (
        <div className="card empty-state">
          <p>{TB.noMatch}</p>
          <button type="button" className="btn line sm" onClick={() => setFilters(DEFAULT_FORMS_FILTERS)}>
            {TB.clearFilters}
          </button>
        </div>
      )}

      {shown.length > 0 && <FormsListItems forms={shown} responseCounts={counts} view={view} busyId={busyId} actionsFor={actionsFor} />}

      {filters.status === 'ACTIVE' && archivedCount > 0 && (
        <p className="svb-hint svb-archived-hint">
          {TB.archivedHidden(archivedCount)}{' '}
          <button type="button" className="btn line sm" onClick={() => set({ status: 'ARCHIVED' })}>
            {TB.showArchived}
          </button>
        </p>
      )}
      {filtersActive && shown.length > 0 && (
        <button type="button" className="btn line sm svb-clear" onClick={() => setFilters(DEFAULT_FORMS_FILTERS)}>
          {TB.clearFilters}
        </button>
      )}

      {pendingStatus !== null && (
        <StatusChangeDialog
          formId={pendingStatus.form.id}
          formName={pendingStatus.form.name}
          action={pendingStatus.action}
          onCancel={() => setPendingStatus(null)}
          onDone={() => {
            setPendingStatus(null);
            setNotice({ text: TB.statusChanged });
            invalidateCache('survey-forms');
            void refresh();
          }}
        />
      )}
    </main>
  );
};

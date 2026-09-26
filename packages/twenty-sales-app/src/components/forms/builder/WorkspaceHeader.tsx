import { type SurveyForm } from '../../../api/surveys';
import { type AutosaveState } from '../../../lib/forms/builder/autosave';
import { WORKSPACE_TABS, type WorkspaceTab } from '../../../lib/forms/builder/issues';
import { TB, formatCount } from '../../../lib/forms/builderStrings';
import { FORM_STATUS_LABELS, TSV } from '../../../lib/forms/surveyStrings';
import { IconRefresh } from '../../icons';

type WorkspaceHeaderProps = {
  form: SurveyForm;
  saveState: AutosaveState;
  showSaveState: boolean;
  canPublish: boolean;
  onRetrySave: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onTab: (tab: WorkspaceTab) => void;
};

export const FormStatusPill = ({ status }: { status: SurveyForm['formStatus'] }) => (
  <span className={`pill svb-status ${status.toLowerCase()}`}>{FORM_STATUS_LABELS[status]}</span>
);

export const VersionLabel = ({ form }: { form: Pick<SurveyForm, 'currentVersionNumber' | 'hasUnpublishedChanges'> }) => (
  <>
    <span className="svb-version-label">
      {form.currentVersionNumber > 0 ? TB.versionN(form.currentVersionNumber) : TSV.noVersion}
    </span>
    {form.currentVersionNumber > 0 && form.hasUnpublishedChanges && (
      <span className="pill warm">{TSV.unpublishedChanges}</span>
    )}
  </>
);

// Left to right, the header's actions follow the path a form takes:
// build → preview → publish → share → responses.
export const WorkspaceHeader = ({
  form,
  saveState,
  showSaveState,
  canPublish,
  onRetrySave,
  onPreview,
  onPublish,
  onTab,
}: WorkspaceHeaderProps) => {
  const publishBlockedBySave = saveState.dirty || saveState.status === 'saving' || saveState.status === 'conflict';

  return (
    <div className="svb-head">
      <div className="svb-head-main">
        <h1 dir="auto">{form.name || TB.untitled}</h1>
        <div className="svb-head-meta">
          <FormStatusPill status={form.formStatus} />
          <VersionLabel form={form} />
          {showSaveState && (
            <span className={`svb-save ${saveState.status}`} role="status" aria-live="polite">
              <span className="svb-save-dot" aria-hidden="true" />
              {TB.autosave[saveState.status]}
              {saveState.status === 'error' && (
                <button type="button" className="btn line sm" onClick={onRetrySave}>
                  <IconRefresh size={13} />
                  {TB.retrySave}
                </button>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="svb-head-actions" aria-label={TB.pathHint}>
        <button type="button" className="btn line sm" onClick={onPreview}>
          {TSV.preview}
        </button>
        {canPublish && (
          <button
            type="button"
            className="btn gold sm"
            onClick={onPublish}
            disabled={publishBlockedBySave || form.formStatus === 'ARCHIVED'}
            title={publishBlockedBySave ? TB.publishNeedsSave : undefined}
          >
            {TSV.publish}
          </button>
        )}
        <button type="button" className="btn line sm" onClick={() => onTab('share')}>
          {TSV.share}
        </button>
        <button type="button" className="btn line sm" onClick={() => onTab('responses')}>
          {TSV.responses}
        </button>
      </div>
    </div>
  );
};

type WorkspaceTabsProps = {
  current: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  issueCount: number;
};

export const WorkspaceTabs = ({ current, onTab, issueCount }: WorkspaceTabsProps) => (
  <nav className="svb-tabs" aria-label={TB.tabsLabel}>
    {WORKSPACE_TABS.map((tab) => (
      <button
        key={tab}
        type="button"
        className={`svb-tab${tab === current ? ' on' : ''}`}
        aria-current={tab === current ? 'page' : undefined}
        onClick={() => onTab(tab)}
      >
        {TB.tabs[tab]}
        {tab === 'logic' && issueCount > 0 && (
          <span className="svb-tab-count" aria-label={TB.errorsN(issueCount)}>
            {formatCount(issueCount)}
          </span>
        )}
      </button>
    ))}
  </nav>
);

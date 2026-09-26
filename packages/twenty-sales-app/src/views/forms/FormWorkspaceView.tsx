import { type FormLanguage, type PublishIssue, validateForPublish } from '@shared/surveys';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { type CurrentUser } from '../../api/auth';
import { ApiError } from '../../api/client';
import { type SurveyForm, fetchForm } from '../../api/surveys';
import { AppearanceTab } from '../../components/forms/builder/AppearanceTab';
import { BuilderTab } from '../../components/forms/builder/BuilderTab';
import { type BuilderSelection, type DefinitionUpdater } from '../../components/forms/builder/builderTypes';
import { CrmTab } from '../../components/forms/builder/CrmTab';
import { LogicTab } from '../../components/forms/builder/LogicTab';
import { PublishDialog } from '../../components/forms/builder/PublishDialog';
import { SettingsTab } from '../../components/forms/builder/SettingsTab';
import { useFormEditor } from '../../components/forms/builder/useFormEditor';
import { WorkspaceHeader, WorkspaceTabs } from '../../components/forms/builder/WorkspaceHeader';
import { FormInsightsPanel } from '../../components/forms/panels/FormInsightsPanel';
import { FormResponsesPanel } from '../../components/forms/panels/FormResponsesPanel';
import { FormSharePanel } from '../../components/forms/panels/FormSharePanel';
import { invalidateCache } from '../../lib/cache';
import { questionNumbering } from '../../lib/forms/builder/conditionOptions';
import { completeDefinition } from '../../lib/forms/builder/definitionOps';
import { type IssueTarget, type WorkspaceTab, issueTarget, toWorkspaceTab } from '../../lib/forms/builder/issues';
import { TB } from '../../lib/forms/builderStrings';
import { TSV } from '../../lib/forms/surveyStrings';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';
import { navigate } from '../../lib/router';

type ConflictBannerProps = { onCopy: () => Promise<boolean>; onReload: () => void };

const ConflictBanner = ({ onCopy, onReload }: ConflictBannerProps) => {
  const [copied, setCopied] = useState<boolean | null>(null);

  return (
    <div className="svb-conflict" role="alert">
      <h2>{TB.conflictTitle}</h2>
      <p>{TB.conflictBody}</p>
      <div className="svb-inline">
        <button type="button" className="btn line sm" onClick={() => void onCopy().then(setCopied)}>
          {copied === null ? TB.copyMyChanges : copied ? TB.copied : TB.copyFailed}
        </button>
        <button type="button" className="btn sm" onClick={onReload}>
          {TB.reloadDraft}
        </button>
      </div>
    </div>
  );
};

export const FormWorkspaceView = ({ formId, tab, user }: { formId: string; tab: string; user: CurrentUser }) => {
  const currentTab = toWorkspaceTab(tab);
  const { capabilities, loading: capabilitiesLoading } = useSurveyCapabilities();
  const [form, setForm] = useState<SurveyForm | null>(null);
  const [loadError, setLoadError] = useState<{ notFound: boolean; message: string } | null>(null);
  const [localChanges, setLocalChanges] = useState(false);
  const [selection, setSelection] = useState<BuilderSelection>(null);
  const [focus, setFocus] = useState<IssueTarget | null>(null);
  const [editLanguage, setEditLanguage] = useState<FormLanguage>('fa');
  const [publishOpen, setPublishOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  // After a conflict nothing more can be saved, so the editor stops accepting
  // edits until the server copy is reloaded.
  const readOnly = !capabilities.canBuild || form?.formStatus === 'ARCHIVED' || conflict;
  const editor = useFormEditor(formId, !readOnly);
  const { load: loadDraft } = editor;

  const loadForm = useCallback(
    async (resetDraft: boolean) => {
      try {
        const fresh = await fetchForm(formId);

        setForm(fresh);
        setLoadError(null);
        setLocalChanges(false);

        if (resetDraft) {
          setConflict(false);
          const definition = completeDefinition(fresh.draftDefinition);

          loadDraft(definition, fresh.draftRevision);
          setEditLanguage(definition.languages[0] ?? 'fa');
        }
      } catch (failure) {
        setLoadError({
          notFound: failure instanceof ApiError && failure.code === 'NOT_FOUND',
          message: failure instanceof Error ? failure.message : TSV.loadError,
        });
      }
    },
    [formId, loadDraft],
  );

  useEffect(() => {
    void loadForm(true);
  }, [loadForm]);

  const reload = useCallback(() => {
    invalidateCache('survey-forms');
    void loadForm(false);
  }, [loadForm]);

  if (editor.saveState.status === 'conflict' && !conflict) setConflict(true);

  const definition = editor.definition;
  const validation = useMemo(
    () =>
      definition === null
        ? { errors: [], warnings: [] }
        : validateForPublish(definition, { publicEnabled: form?.publicEnabled ?? true }),
    [definition, form?.publicEnabled],
  );
  const numbering = useMemo(() => (definition === null ? {} : questionNumbering(definition)), [definition]);

  const goTab = (next: WorkspaceTab) => navigate(`/form/${formId}/${next}`);

  const onEdit = (updater: DefinitionUpdater) => {
    editor.edit(updater);
    setLocalChanges(true);
  };

  const onIssue = (issue: PublishIssue) => {
    if (definition === null) return;

    const target = issueTarget(issue, definition);

    setFocus(target);
    if (target.tab === 'builder') {
      setSelection(
        target.itemId !== undefined
          ? { kind: 'item', id: target.itemId }
          : target.pageId !== undefined
            ? { kind: 'page', id: target.pageId }
            : null,
      );
    }
    goTab(target.tab);
  };

  const openPreview = async () => {
    setNotice(null);
    if (!readOnly && !(await editor.flush())) {
      setNotice(TB.publishNeedsSave);

      return;
    }
    navigate(`/form/${formId}/preview`);
  };

  if (loadError !== null && form === null) {
    return (
      <main className="page">
        <div className="error-banner" role="alert">
          {loadError.notFound ? TB.notFound : `${TB.loadFailed} ${loadError.message}`}
        </div>
        {!loadError.notFound && (
          <button type="button" className="btn line" onClick={() => void loadForm(true)}>
            {TSV.retry}
          </button>
        )}
      </main>
    );
  }

  if (form === null || definition === null) {
    return (
      <main className="page svb-workspace" aria-busy="true">
        <div className="skeleton svb-skeleton-head" />
        <div className="skeleton svb-skeleton-body" />
      </main>
    );
  }

  const shownForm = { ...form, hasUnpublishedChanges: form.hasUnpublishedChanges || localChanges || editor.saveState.dirty };
  const editorProps = {
    definition,
    onEdit,
    readOnly,
    editLanguage,
    onEditLanguageChange: setEditLanguage,
  };

  return (
    <main className="page svb-workspace">
      <WorkspaceHeader
        form={shownForm}
        saveState={editor.saveState}
        showSaveState={capabilities.canBuild && form.formStatus !== 'ARCHIVED'}
        canPublish={capabilities.canPublish}
        onRetrySave={editor.retry}
        onPreview={() => void openPreview()}
        onPublish={() => setPublishOpen(true)}
        onTab={goTab}
      />
      {conflict && (
        <ConflictBanner
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(definition, null, 2));

              return true;
            } catch {
              return false;
            }
          }}
          onReload={() => void loadForm(true)}
        />
      )}
      {editor.saveState.status === 'error' && editor.saveState.error !== null && (
        <p className="error-banner" role="alert">
          {TSV.saveFailed}: {editor.saveState.error}
        </p>
      )}
      {notice !== null && (
        <p className="error-banner" role="alert">
          {notice}
        </p>
      )}
      {!capabilitiesLoading && readOnly && !conflict && (
        <p className="svb-note" role="note">
          {form.formStatus === 'ARCHIVED' && capabilities.canBuild ? TB.archivedReadOnly : TB.readOnly}
        </p>
      )}
      <WorkspaceTabs current={currentTab} onTab={goTab} issueCount={validation.errors.length} />
      <div className="svb-tab-panel">
        {currentTab === 'builder' && (
          <BuilderTab
            {...editorProps}
            selection={selection}
            onSelect={setSelection}
            numbering={numbering}
            onOpenLogic={() => {
              setFocus(
                selection === null
                  ? null
                  : selection.kind === 'item'
                    ? { tab: 'logic', itemId: selection.id }
                    : { tab: 'logic', pageId: selection.id },
              );
              goTab('logic');
            }}
          />
        )}
        {currentTab === 'logic' && (
          <LogicTab {...editorProps} numbering={numbering} validation={validation} focus={focus} onIssue={onIssue} />
        )}
        {currentTab === 'appearance' && <AppearanceTab {...editorProps} numbering={numbering} />}
        {currentTab === 'crm' && <CrmTab {...editorProps} numbering={numbering} focus={focus} />}
        {currentTab === 'settings' && (
          <SettingsTab
            key={form.id}
            form={form}
            readOnly={!capabilities.canBuild}
            canChangeStatus={capabilities.canPublish}
            onChanged={reload}
          />
        )}
        {currentTab === 'share' && <FormSharePanel form={form} onChanged={reload} />}
        {currentTab === 'responses' && <FormResponsesPanel formId={formId} user={user} />}
        {currentTab === 'insights' && <FormInsightsPanel formId={formId} />}
      </div>
      {publishOpen && (
        <PublishDialog
          form={form}
          definition={definition}
          flush={editor.flush}
          getRevision={editor.getRevision}
          onClose={() => setPublishOpen(false)}
          onPublished={reload}
          onConflict={() => setConflict(true)}
          onIssue={onIssue}
          onGoShare={() => {
            setPublishOpen(false);
            goTab('share');
          }}
        />
      )}
    </main>
  );
};

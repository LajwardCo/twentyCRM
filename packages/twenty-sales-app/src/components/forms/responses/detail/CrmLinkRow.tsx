import { type CrmTargetField } from '@shared/surveys';
import { useState } from 'react';

import { type CurrentUser } from '../../../../api/auth';
import { type SurveyResponse } from '../../../../api/surveys';
import { TSR } from '../../../../lib/forms/responseStrings';
import { type CrmLinkKind } from '../../../../lib/forms/responses/crmActionLog';
import { CrmRecordPicker } from '../../CrmRecordPicker';
import { CrmCreateForm } from './CrmCreateForm';
import { type CrmLinking } from './useCrmLinking';

const KIND_LABELS: Record<CrmLinkKind, string> = {
  company: TSR.company,
  person: TSR.contact,
  opportunity: TSR.lead,
};

const ROUTES: Record<CrmLinkKind, string> = {
  company: 'company',
  person: 'person',
  opportunity: 'lead',
};

const CREATE_LABELS: Record<CrmLinkKind, string> = {
  company: TSR.createCompany,
  person: TSR.createContact,
  opportunity: TSR.createLead,
};

export const linkedRecord = (
  response: SurveyResponse,
  kind: CrmLinkKind,
): { id: string; label: string } | null => {
  if (kind === 'company') return response.company === null ? null : { id: response.company.id, label: response.company.name };
  if (kind === 'opportunity') {
    return response.opportunity === null ? null : { id: response.opportunity.id, label: response.opportunity.name };
  }
  if (response.person === null) return null;

  return {
    id: response.person.id,
    label: `${response.person.name.firstName} ${response.person.name.lastName}`.trim(),
  };
};

type CrmLinkRowProps = {
  kind: CrmLinkKind;
  response: SurveyResponse;
  proposals: Partial<Record<CrmTargetField, string>>;
  user: CurrentUser;
  linking: CrmLinking;
  canEdit: boolean;
};

// One CRM kind: what is linked, and the two ways to fill the gap — pick an
// existing record (narrowed to the linked company for contacts and leads) or
// create one from the answers.
export const CrmLinkRow = ({ kind, response, proposals, user, linking, canEdit }: CrmLinkRowProps) => {
  const [mode, setMode] = useState<'view' | 'pick' | 'create'>('view');
  const record = linkedRecord(response, kind);

  return (
    <div className="svr-link-row">
      <div className="svr-link-head">
        <span className="svr-link-kind">{KIND_LABELS[kind]}</span>
        {record === null ? (
          <span className="svr-muted">{TSR.notLinked}</span>
        ) : (
          <a href={`#/${ROUTES[kind]}/${record.id}`} dir="auto" className="svr-link-value">
            {record.label || record.id}
          </a>
        )}
        {canEdit && mode === 'view' && (
          <span className="svr-link-buttons">
            <button type="button" className="btn line sm" disabled={linking.busy} onClick={() => setMode('pick')}>
              {record === null ? TSR.linkExisting : TSR.changeStatus}
            </button>
            {record === null && (
              <button type="button" className="btn line sm" disabled={linking.busy} onClick={() => setMode('create')}>
                {CREATE_LABELS[kind]}
              </button>
            )}
          </span>
        )}
      </div>

      {mode === 'pick' && (
        <div className="svr-link-pick">
          <CrmRecordPicker
            kind={kind}
            value={null}
            companyId={kind === 'company' ? null : (response.company?.id ?? null)}
            disabled={linking.busy}
            onChange={(value) => {
              if (value === null) return;

              void linking.link(kind, value.recordId).then(() => setMode('view'));
            }}
          />
          <button type="button" className="btn line sm" onClick={() => setMode('view')}>
            {TSR.cancel}
          </button>
        </div>
      )}

      {/* Closes by itself when someone else linked this kind meanwhile. */}
      {mode === 'create' && record === null && (
        <CrmCreateForm
          kind={kind}
          response={response}
          proposals={proposals}
          user={user}
          linking={linking}
          onDone={() => setMode('view')}
        />
      )}
    </div>
  );
};

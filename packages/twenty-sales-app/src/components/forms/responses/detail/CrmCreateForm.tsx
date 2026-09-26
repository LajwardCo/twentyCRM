import { type CrmTargetField } from '@shared/surveys';
import { useState } from 'react';

import { type CurrentUser } from '../../../../api/auth';
import { type SurveyResponse } from '../../../../api/surveys';
import { createCompany, createPerson } from '../../../../api/surveyCrm';
import { createLeadForResponse } from '../../../../api/surveyResponseExtras';
import { TSR } from '../../../../lib/forms/responseStrings';
import { type CrmLinkKind } from '../../../../lib/forms/responses/crmActionLog';
import { splitPersonName } from '../../../../lib/forms/responses/crmDiff';
import { type CrmLinking } from './useCrmLinking';

type CrmCreateFormProps = {
  kind: CrmLinkKind;
  response: SurveyResponse;
  proposals: Partial<Record<CrmTargetField, string>>;
  user: CurrentUser;
  linking: CrmLinking;
  onDone: () => void;
};

type Draft = Record<string, string>;

// Prefilled from the form's CRM mapping; staff can edit every value before
// anything is created.
const initialDraft = (
  kind: CrmLinkKind,
  response: SurveyResponse,
  proposals: Partial<Record<CrmTargetField, string>>,
): Draft => {
  if (kind === 'company') {
    return {
      name: proposals['company.name'] ?? response.name,
      city: response.city,
      street: proposals['company.address'] ?? '',
      businessType: proposals['company.businessType'] ?? '',
      employees: proposals['company.employees'] ?? '',
    };
  }

  if (kind === 'person') {
    const name = splitPersonName(proposals['person.name'] ?? '');

    return {
      firstName: name.firstName,
      lastName: name.lastName,
      phone: proposals['person.phone'] ?? '',
      email: proposals['person.email'] ?? '',
      jobTitle: proposals['person.jobTitle'] ?? '',
    };
  }

  return {
    name: proposals['opportunity.name'] ?? response.company?.name ?? proposals['company.name'] ?? response.name,
  };
};

const FIELDS: Record<CrmLinkKind, { key: string; label: string; dir?: 'ltr'; required?: boolean }[]> = {
  company: [
    { key: 'name', label: TSR.companyName, required: true },
    { key: 'city', label: TSR.city },
    { key: 'street', label: TSR.street },
    { key: 'businessType', label: TSR.businessType },
    { key: 'employees', label: TSR.employees, dir: 'ltr' },
  ],
  person: [
    { key: 'firstName', label: TSR.firstName, required: true },
    { key: 'lastName', label: TSR.lastName },
    { key: 'phone', label: TSR.phone, dir: 'ltr' },
    { key: 'email', label: TSR.email, dir: 'ltr' },
    { key: 'jobTitle', label: TSR.jobTitle },
  ],
  opportunity: [{ key: 'name', label: TSR.leadName, required: true }],
};

const SUBMIT_LABELS: Record<CrmLinkKind, string> = {
  company: TSR.createCompany,
  person: TSR.createContact,
  opportunity: TSR.createLead,
};

export const CrmCreateForm = ({ kind, response, proposals, user, linking, onDone }: CrmCreateFormProps) => {
  const [draft, setDraft] = useState<Draft>(() => initialDraft(kind, response, proposals));
  const fields = FIELDS[kind];
  const missing = fields.some((field) => field.required && (draft[field.key] ?? '').trim() === '');

  const createRecord = async (): Promise<string> => {
    if (kind === 'company') {
      const employees = Number((draft.employees ?? '').replace(/[^\d]/g, ''));

      return (
        await createCompany({
          name: draft.name,
          city: draft.city,
          street: draft.street,
          businessType: draft.businessType,
          employees: draft.employees?.trim() && Number.isFinite(employees) ? employees : null,
        })
      ).id;
    }

    if (kind === 'person') {
      return (
        await createPerson({
          firstName: draft.firstName,
          lastName: draft.lastName,
          phone: draft.phone,
          email: draft.email,
          jobTitle: draft.jobTitle,
          companyId: response.company?.id ?? null,
        })
      ).id;
    }

    return (
      await createLeadForResponse({
        name: draft.name,
        companyId: response.company?.id ?? null,
        personId: response.person?.id ?? null,
        ownerId: user.workspaceMemberId,
      })
    ).id;
  };

  const submit = async () => {
    if (missing) return;
    if (await linking.create(kind, createRecord)) onDone();
  };

  return (
    <form
      className="svr-create"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="svr-create-grid">
        {fields.map((field) => (
          <label key={field.key} className="fld">
            <span className="svr-fld-label">
              {field.label}
              {field.required && ' *'}
            </span>
            <input
              dir={field.dir ?? 'auto'}
              value={draft[field.key] ?? ''}
              onChange={(event) => setDraft((previous) => ({ ...previous, [field.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="svr-row-actions">
        <button type="submit" className="btn gold sm" disabled={missing || linking.busy}>
          {linking.busy ? TSR.creating : SUBMIT_LABELS[kind]}
        </button>
        <button type="button" className="btn line sm" onClick={onDone}>
          {TSR.cancel}
        </button>
      </div>
    </form>
  );
};

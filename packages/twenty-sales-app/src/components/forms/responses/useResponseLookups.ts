import { type Member, fetchMembers } from '../../../api/admin';
import {
  type SurveyCampaign,
  type SurveyFormSummary,
  type SurveyFormVersion,
  fetchVersions,
  listCampaigns,
  listForms,
} from '../../../api/surveys';
import { useCached } from '../../../lib/cache';

// Reference lists the responses screens filter and label by. Each one is
// optional: a failed lookup only empties its dropdown, never the table.
export const useResponseLookups = (): {
  forms: SurveyFormSummary[];
  campaigns: SurveyCampaign[];
  members: Member[];
} => {
  const { data: forms } = useCached('svr:forms', () =>
    listForms()
      .then((result) => (result.supported ? result.forms : []))
      .catch(() => []),
  );
  const { data: campaigns } = useCached('svr:campaigns', () => listCampaigns().catch(() => []));
  const { data: members } = useCached('svr:members', () => fetchMembers().catch(() => []));

  return { forms: forms ?? [], campaigns: campaigns ?? [], members: members ?? [] };
};

export const useFormVersions = (formId: string): SurveyFormVersion[] | null => {
  const { data } = useCached(`svr:versions:${formId}`, () =>
    formId === '' ? Promise.resolve([]) : fetchVersions(formId).catch(() => []),
  );

  return formId === '' ? [] : data;
};

export const memberLabel = (member: { name: { firstName: string; lastName: string } } | null): string =>
  member === null ? '' : `${member.name.firstName} ${member.name.lastName}`.trim();

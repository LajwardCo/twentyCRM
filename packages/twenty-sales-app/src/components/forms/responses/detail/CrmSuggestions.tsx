import { type CrmTargetField } from '@shared/surveys';

import { findLeadDuplicates } from '../../../../api/duplicates';
import { fetchRecordLabel } from '../../../../api/surveyResponseExtras';
import { type SurveyResponse } from '../../../../api/surveys';
import { useCached } from '../../../../lib/cache';
import { TSR } from '../../../../lib/forms/responseStrings';
import { type CrmLinkKind, pendingSuggestions } from '../../../../lib/forms/responses/crmActionLog';
import { type CrmLinking } from './useCrmLinking';

const KIND_LABELS: Record<CrmLinkKind, string> = {
  company: TSR.company,
  person: TSR.contact,
  opportunity: TSR.lead,
};

// The route says what the matched record really is: a phone/email search hit
// on a company is reported with kind 'lead' by the duplicates API.
const kindFromRoute = (route: string): CrmLinkKind | null =>
  route.startsWith('/company/') ? 'company' : route.startsWith('/person/') ? 'person' : route.startsWith('/lead/') ? 'opportunity' : null;

type CrmSuggestionsProps = {
  response: SurveyResponse;
  proposals: Partial<Record<CrmTargetField, string>>;
  linking: CrmLinking;
  canEdit: boolean;
};

// Hints, never links: an invitation link can be forwarded, and a similar name
// is not the same business. Every suggestion needs a reviewer's click.
export const CrmSuggestions = ({ response, proposals, linking, canEdit }: CrmSuggestionsProps) => {
  const links = {
    companyId: response.company?.id ?? null,
    personId: response.person?.id ?? null,
    opportunityId: response.opportunity?.id ?? null,
  };
  const invitation = pendingSuggestions(response.crmActions, links);
  const allLinked = links.companyId !== null && links.personId !== null && links.opportunityId !== null;
  const query = {
    companyName: proposals['company.name'] ?? response.name,
    phone: proposals['person.phone'] ?? '',
    email: proposals['person.email'] ?? '',
  };

  const { data: labels } = useCached(`svr:suggest-labels:${invitation.map((action) => action.recordId).join(',')}`, () =>
    Promise.all(
      invitation.map((action) => fetchRecordLabel(action.target, action.recordId).catch(() => '')),
    ),
  );
  const { data: matches } = useCached(`svr:dups:${response.id}:${JSON.stringify(query)}:${allLinked}`, () =>
    allLinked ? Promise.resolve([]) : findLeadDuplicates(query),
  );
  // Records this response already points at are not suggestions.
  const linkedIds = new Set(Object.values(links).filter((id): id is string => id !== null));
  const duplicateMatches = (matches ?? []).filter((match) => !linkedIds.has(match.id));

  return (
    <div className="svr-suggestions">
      {invitation.length > 0 && (
        <div className="svr-suggest-block">
          <h4>{TSR.suggestions}</h4>
          {invitation.map((action, index) => (
            <div key={action.key} className="svr-suggest-row">
              <span className="svr-suggest-kind">{KIND_LABELS[action.target]}</span>
              <a href={`#/${action.target === 'opportunity' ? 'lead' : action.target}/${action.recordId}`} dir="auto">
                {labels?.[index] || action.recordId.slice(0, 8)}
              </a>
              <span className="svr-badge-warn">{TSR.invitationSuggestion}</span>
              {canEdit && (
                <button type="button" className="btn line sm" disabled={linking.busy} onClick={() => void linking.link(action.target, action.recordId)}>
                  {TSR.useSuggestion}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!allLinked && (
        <div className="svr-suggest-block">
          <h4>{TSR.duplicates}</h4>
          {matches === null && <p className="svr-muted">{TSR.loading}</p>}
          {matches !== null && duplicateMatches.length === 0 && <p className="svr-muted">{TSR.noDuplicates}</p>}
          {duplicateMatches.length > 0 && <p className="svr-muted">{TSR.nameMatchWarning}</p>}
          {duplicateMatches.map((match) => {
            const kind = kindFromRoute(match.route);

            return (
              <div key={`${match.kind}:${match.id}`} className="svr-suggest-row">
                <span className="svr-suggest-kind">{kind === null ? TSR.matchKind[match.kind] : KIND_LABELS[kind]}</span>
                <a href={`#${match.route}`} dir="auto">{match.label}</a>
                <span className={`svr-match svr-match-${match.level}`}>{TSR.matchReason[match.reason] ?? match.reason}</span>
                {canEdit && kind !== null && (
                  <button type="button" className="btn line sm" disabled={linking.busy} onClick={() => void linking.link(kind, match.id)}>
                    {TSR.useSuggestion}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

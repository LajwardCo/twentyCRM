import { type CrmTargetField, type FormDefinition, proposeCrmChanges } from '@shared/surveys';
import { useMemo, useState } from 'react';

import { type CurrentUser } from '../../../../api/auth';
import { type SurveyResponse } from '../../../../api/surveys';
import { TSR } from '../../../../lib/forms/responseStrings';
import { CrmApplyChanges } from './CrmApplyChanges';
import { CrmLinkRow, linkedRecord } from './CrmLinkRow';
import { CrmSuggestions } from './CrmSuggestions';
import { useCrmLinking } from './useCrmLinking';

type ResponseCrmPanelProps = {
  response: SurveyResponse;
  definition: FormDefinition | null;
  user: CurrentUser;
  canEdit: boolean;
  initiallyOpen: boolean;
  onChanged: () => Promise<void> | void;
};

// Review-first CRM: the panel proposes, the reviewer decides. Nothing here
// merges records because names match, and nothing overwrites a CRM value
// without an explicit per-field choice.
export const ResponseCrmPanel = ({ response, definition, user, canEdit, initiallyOpen, onChanged }: ResponseCrmPanelProps) => {
  const [open, setOpen] = useState(initiallyOpen);
  const linking = useCrmLinking({ responseId: response.id, user, onChanged });

  // What the mapped answers would write into an empty CRM record — used to
  // prefill "create" forms and to search for duplicates.
  const proposals = useMemo(() => {
    const byField: Partial<Record<CrmTargetField, string>> = {};

    if (definition === null) return byField;

    for (const proposal of proposeCrmChanges(definition, response.answers, {})) {
      if (proposal.proposed !== null && byField[proposal.field] === undefined) byField[proposal.field] = String(proposal.proposed);
    }

    return byField;
  }, [definition, response.answers]);

  const summary = (['company', 'person', 'opportunity'] as const)
    .map((kind) => linkedRecord(response, kind)?.label)
    .filter((label): label is string => typeof label === 'string' && label !== '')
    .join(' · ');

  return (
    <section className="card svr-section svr-crm" aria-labelledby="svr-crm-title">
      <h3 id="svr-crm-title" className="svr-toggle-heading">
        <button type="button" className="svr-section-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span>{TSR.crmPanel}</span>
          <span className="svr-muted" dir="auto">{summary || TSR.notLinked}</span>
          <span className="svr-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </h3>

      {open && (
        <div className="svr-section-body">
          <p className="svr-muted">{TSR.crmHint}</p>

          {(['company', 'person', 'opportunity'] as const).map((kind) => (
            <CrmLinkRow
              key={kind}
              kind={kind}
              response={response}
              proposals={proposals}
              user={user}
              linking={linking}
              canEdit={canEdit}
            />
          ))}

          {linking.notice !== null && (
            <p className="svr-action-message" role="status">
              {linking.notice}
            </p>
          )}

          {linking.askActioned && (
            <div className="svr-ask" role="alertdialog" aria-label={TSR.askActioned}>
              <span>{TSR.askActioned}</span>
              <button type="button" className="btn gold sm" onClick={() => void linking.markActioned()}>
                {TSR.markActioned}
              </button>
              <button type="button" className="btn line sm" onClick={linking.dismissActioned}>
                {TSR.keepStatus}
              </button>
            </div>
          )}

          <CrmSuggestions response={response} proposals={proposals} linking={linking} canEdit={canEdit} />

          {canEdit && definition !== null && (response.company !== null || response.person !== null || response.opportunity !== null) && (
            <div className="svr-suggest-block">
              <h4>{TSR.applyChanges}</h4>
              <CrmApplyChanges response={response} definition={definition} user={user} onApplied={onChanged} />
            </div>
          )}
        </div>
      )}
    </section>
  );
};

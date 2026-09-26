import { useEffect, useState } from 'react';

import { type Member, fetchMembers } from '../../../api/admin';
import { type PaperReferenceMatch, findPaperReferenceMatches } from '../../../api/surveyCollect';
import { navigate } from '../../../lib/router';
import { type PaperMeta, normalizePaperReference } from '../../../lib/forms/collect/paperEntry';
import { TC } from '../../../lib/forms/collectStrings';
import { JalaliDatePicker } from '../../JalaliDatePicker';

type PaperMetaFieldsProps = {
  formId: string;
  responseId: string | null;
  value: PaperMeta;
  onChange: (patch: Partial<PaperMeta>) => void;
  enteredByName: string;
};

const memberName = (member: Member) =>
  `${member.name.firstName} ${member.name.lastName}`.trim() || member.userEmail || member.id;

// Where the sheet came from: when it was filled in, by whom, and its sheet
// reference (warned live when this form already has it).
export const PaperMetaFields = ({ formId, responseId, value, onChange, enteredByName }: PaperMetaFieldsProps) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [duplicates, setDuplicates] = useState<PaperReferenceMatch[]>([]);
  const reference = normalizePaperReference(value.paperReference);

  useEffect(() => {
    fetchMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (reference === '') {
      setDuplicates([]);

      return;
    }

    const handle = window.setTimeout(() => {
      findPaperReferenceMatches(formId, reference)
        .then((matches) => setDuplicates(matches.filter((match) => match.id !== responseId)))
        .catch(() => setDuplicates([]));
    }, 350);

    return () => window.clearTimeout(handle);
  }, [formId, reference, responseId]);

  return (
    <section className="card svc-paper-meta">
      <div className="svc-grid2">
        <div className="fld">
          <label htmlFor="svc-paper-date">{TC.collectionDate}</label>
          <JalaliDatePicker
            id="svc-paper-date"
            withTime={false}
            value={value.collectedDate}
            onChange={(collectedDate) => onChange({ collectedDate })}
          />
        </div>
        <div className="fld">
          <label htmlFor="svc-paper-collector">{TC.collector}</label>
          <select
            id="svc-paper-collector"
            value={value.collectorId}
            onChange={(event) => onChange({ collectorId: event.target.value })}
          >
            <option value="">{TC.noCollector}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {memberName(member)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="fld">
        <label htmlFor="svc-paper-ref">{TC.paperReference}</label>
        <input
          id="svc-paper-ref"
          dir="ltr"
          autoComplete="off"
          placeholder={TC.paperReferenceHint}
          value={value.paperReference}
          aria-invalid={duplicates.length > 0}
          aria-describedby={duplicates.length > 0 ? 'svc-paper-ref-dup' : undefined}
          onChange={(event) => onChange({ paperReference: event.target.value })}
        />
        {duplicates.length > 0 && (
          <div id="svc-paper-ref-dup" className="svc-warning" role="alert">
            <p>{TC.duplicateReference}</p>
            <button type="button" className="btn line sm" onClick={() => navigate(`/response/${duplicates[0].id}`)}>
              {TC.openExisting}
            </button>
          </div>
        )}
      </div>
      <div className="fld">
        <label htmlFor="svc-paper-notes">{TC.transcriptionNotes}</label>
        <textarea
          id="svc-paper-notes"
          dir="auto"
          value={value.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </div>
      <div className="svc-hint">{TC.enteredBy(enteredByName)}</div>
    </section>
  );
};

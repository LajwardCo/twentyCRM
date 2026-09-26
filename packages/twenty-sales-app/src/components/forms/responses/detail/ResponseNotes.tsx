import { useState } from 'react';

import { createResponseNote, fetchResponseNotes } from '../../../../api/surveyResponseExtras';
import { useCached } from '../../../../lib/cache';
import { formatJalaliDateTime } from '../../../../lib/jalali';
import { TSR } from '../../../../lib/forms/responseStrings';

type ResponseNotesProps = {
  responseId: string;
  opportunityId: string | null;
  canEdit: boolean;
};

export const ResponseNotes = ({ responseId, opportunityId, canEdit }: ResponseNotesProps) => {
  const { data: notes, error, refresh } = useCached(`svr:notes:${responseId}`, () => fetchResponseNotes(responseId));
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const add = async () => {
    if (saving || draft.trim() === '') return;

    setSaving(true);
    setMessage(null);

    try {
      await createResponseNote({ responseId, opportunityId, title: TSR.noteTitle, body: draft.trim() });
      setDraft('');
      await refresh();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card svr-section" aria-labelledby="svr-notes-title">
      <h3 id="svr-notes-title">{TSR.notes}</h3>
      {error !== null && <p className="svr-muted">{error}</p>}
      {notes !== null && notes.length === 0 && <p className="svr-muted">{TSR.noNotes}</p>}
      <ul className="svr-notes">
        {(notes ?? []).map((note) => (
          <li key={note.id}>
            <p dir="auto">{note.body}</p>
            <span className="svr-muted">
              {formatJalaliDateTime(note.createdAt)}
              {note.author !== '' && ` · ${note.author}`}
            </span>
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="svr-note-form">
          <textarea
            dir="auto"
            rows={3}
            value={draft}
            placeholder={TSR.notePlaceholder}
            aria-label={TSR.addNote}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="button" className="btn line sm" disabled={saving || draft.trim() === ''} onClick={() => void add()}>
            {saving ? TSR.creating : TSR.addNote}
          </button>
          {message !== null && <p className="svr-action-message" role="status">{message}</p>}
        </div>
      )}
    </section>
  );
};

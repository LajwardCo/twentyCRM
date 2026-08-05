import { useState } from 'react';

import { updateNote, type Note } from '../api/records';
import { navigate } from '../lib/router';
import { T6 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';

// Quick edit for a note from wherever it is listed, so fixing a typo does not
// mean leaving the lead. The full note page stays one tap away.

type NoteEditModalProps = {
  note: Pick<Note, 'id' | 'title'> & { bodyV2: { markdown: string | null } | null };
  onClose: () => void;
  onSaved: () => void;
};

export const NoteEditModal = ({ note, onClose, onSaved }: NoteEditModalProps) => {
  const [title, setTitle] = useState(note.title ?? '');
  const [body, setBody] = useState(note.bodyV2?.markdown ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (body.trim() === '') {
      setError(T6.noteBodyRequired);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateNote(note.id, {
        // An empty title would leave the note unlabelled in every list, so it
        // falls back to the opening of the body, as note creation does.
        title: title.trim() !== '' ? title.trim() : body.trim().slice(0, 60),
        bodyV2: { markdown: body.trim() },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : T6.saveFailed);
      setBusy(false);
    }
  };

  return (
    <ModalSheet title={T6.editNoteTitle} onClose={onClose}>
      <div className="fld">
        <label htmlFor="note-title">{T6.noteTitleLbl}</label>
        <input
          id="note-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div className="fld">
        <label htmlFor="note-body">{T6.noteBodyLbl}</label>
        <textarea
          id="note-body"
          autoFocus
          style={{ minHeight: 140 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      <button
        className="btn gold block"
        style={{ padding: 12 }}
        disabled={busy || body.trim() === ''}
        onClick={save}
      >
        {busy ? T6.saving : T6.saveChanges}
      </button>

      <button
        className="btn line sm"
        style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
        onClick={() => navigate(`/note/${note.id}`)}
      >
        {T6.openFullPage}
      </button>
    </ModalSheet>
  );
};

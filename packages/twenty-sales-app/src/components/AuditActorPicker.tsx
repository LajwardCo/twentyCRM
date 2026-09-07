import { useEffect, useRef, useState } from 'react';

import {
  searchAuditActors,
  fetchAuditActor,
  type AuditActorOption,
} from '../api/auditTrail';
import { TAUDIT } from '../lib/auditStrings';

// Searchable member picker for the audit screen's actor filter.
//
// It replaces a <select>, which could not work here: a workspace holds
// thousands of members, a dropdown can only ever hold the page that was
// fetched, and the person being looked for is exactly the one who is not in
// it. Every keystroke resolves against the server instead.
//
// The input's value is ALWAYS `query` -- never the selected label swapped in
// while closed. Showing one of two values in a controlled input means a
// keystroke that lands before React re-renders appends to the wrong one, and
// the field ends up holding the label and the typing concatenated. Selecting
// someone writes their name into `query` instead, and focusing selects the
// text so the next keystroke replaces it.

type AuditActorPickerProps = {
  value: string;
  onChange: (memberId: string) => void;
};

export const AuditActorPicker = ({ value, onChange }: AuditActorPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<AuditActorOption[] | null>(null);
  const [selected, setSelected] = useState<AuditActorOption | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Label a selection that came from the URL rather than from a click here.
  useEffect(() => {
    if (value === '') {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    let cancelled = false;
    void fetchAuditActor(value)
      .then((actor) => {
        if (cancelled || actor === null) return;
        setSelected(actor);
        setQuery(actor.name);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [value, selected?.id]);

  // Debounced search. Runs while closed too, so the first open is instant.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(
      () => {
        void searchAuditActors(query)
          .then((results) => {
            if (cancelled) return;
            setOptions(results);
            setHighlight(0);
            setFailed(false);
          })
          .catch(() => {
            if (!cancelled) setFailed(true);
          });
      },
      query === '' ? 0 : 250,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const pick = (actor: AuditActorOption | null) => {
    setSelected(actor);
    onChange(actor?.id ?? '');
    setOpen(false);
    setQuery(actor?.name ?? '');
  };

  // Closing without choosing must not leave half-typed text standing where a
  // selection is shown, or the field would claim a filter that is not applied.
  const close = () => {
    setOpen(false);
    setQuery(selected?.name ?? '');
  };

  // "Everyone" always sits at index 0, so the arrow keys can reach it.
  const rows: (AuditActorOption | null)[] = [null, ...(options ?? [])];

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = highlight + (event.key === 'ArrowDown' ? 1 : -1);
      setHighlight(Math.max(0, Math.min(rows.length - 1, next)));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (rows.length > 0) pick(rows[Math.min(highlight, rows.length - 1)]);
    }
  };

  return (
    <div className="actor-picker" ref={rootRef}>
      <input
        ref={inputRef}
        className="btn line sm actor-picker-input"
        value={query}
        placeholder={selected?.name ?? TAUDIT.auditActorSearch}
        aria-label={TAUDIT.auditFilterActor}
        onFocus={(event) => {
          setOpen(true);
          // Select rather than clear: the name stays visible until the moment
          // it is replaced, and no value is swapped out mid-keystroke.
          event.target.select();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />

      {selected !== null && !open && (
        <button
          className="actor-picker-clear"
          aria-label={TAUDIT.auditActorClear}
          onClick={() => pick(null)}
        >
          ×
        </button>
      )}

      {open && (
        <div className="actor-picker-list">
          {failed && <div className="actor-picker-empty">{TAUDIT.auditActorFailed}</div>}

          {!failed && options === null && (
            <div className="actor-picker-empty">{TAUDIT.auditLoading}</div>
          )}

          {!failed &&
            rows.map((actor, index) => (
              <button
                key={actor?.id ?? '__all__'}
                className={`actor-picker-option${index === highlight ? ' on' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(actor)}
              >
                <span>{actor?.name ?? TAUDIT.auditActorEveryone}</span>
                {actor?.userEmail && (
                  <small className="actor-picker-email">{actor.userEmail}</small>
                )}
              </button>
            ))}

          {!failed && options !== null && options.length === 0 && query !== '' && (
            <div className="actor-picker-empty">{TAUDIT.auditActorNoMatch}</div>
          )}
        </div>
      )}
    </div>
  );
};

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  buildSelectRows,
  filterOptions,
  type SearchOption,
  type SelectRow,
} from '../lib/optionSearch';
import { T17 } from '../lib/strings';
import { IconChevronDown, IconPlus, IconX } from './icons';

// A <select> you can type into, for lists that a native dropdown handles badly:
// partners and referrers grow past a hundred rows, and scrolling a native
// picker to find one by eye is slower than typing three letters.
//
// Two behaviours are deliberate and were learned the hard way elsewhere in this
// app:
//   * The list closes on an outside pointerdown, never on the input's blur --
//     on mobile, blur fires as the on-screen keyboard opens and used to tear
//     the control down before anything could be picked.
//   * The input's value is ALWAYS `query`, never the selected label swapped in
//     while closed. Showing one of two values in a controlled input means a
//     keystroke landing before React re-renders appends to the wrong one.

type SearchSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  // The row that clears the selection. Omit to make the field mandatory.
  emptyLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  // Committing on select is enough for a form; the meta rows also want to know
  // the user gave up so they can drop back out of edit mode.
  onCancel?: () => void;
  // Offers a row that creates the record instead of picking one, handing back
  // whatever was typed so the dialog it opens can start from that name. Without
  // it a name nobody has seeded yet is a dead end: the picker can only show
  // what already exists.
  onCreate?: (name: string) => void;
  createLabel?: string;
};

export const SearchSelect = ({
  id,
  value,
  onChange,
  options,
  emptyLabel,
  placeholder,
  disabled = false,
  autoFocus = false,
  ariaLabel,
  onCancel,
  onCreate,
  createLabel,
}: SearchSelectProps) => {
  const selected = options.find((option) => option.value === value) ?? null;
  const selectedLabel = selected?.label ?? '';

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(selectedLabel);
  // Opening the list must show EVERYTHING, not just the current selection:
  // `query` still holds the selected label at that point, and filtering by it
  // left a picker whose only option was the value you were trying to change.
  // Filtering starts at the first keystroke.
  const [typing, setTyping] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A selection made elsewhere (a saved form, a reset) has to show up here.
  // Skipped while open so it cannot overwrite what is being typed.
  useEffect(() => {
    if (!open) setQuery(selectedLabel);
  }, [selectedLabel, open]);

  // Everything downstream filters and labels off what was TYPED, which is the
  // empty string until the first keystroke -- `query` still holds the selected
  // label before that.
  const typedQuery = open && typing ? query : '';

  const matches = useMemo(
    () => filterOptions(options, typedQuery),
    [options, typedQuery],
  );

  const rows = useMemo(
    () =>
      buildSelectRows({
        matches,
        emptyLabel,
        createLabel:
          onCreate === undefined
            ? undefined
            : (createLabel ?? T17.searchSelectCreate),
        query: typedQuery,
      }),
    [matches, emptyLabel, onCreate, createLabel, typedQuery],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open, selectedLabel]);

  // The list hangs below the input, and a picker near the bottom of a scrolling
  // bottom sheet (WhatsApp templates) opened into the part of the sheet that is
  // not on screen -- it looked like nothing happened. Nudge the container so
  // the list is visible the moment it opens.
  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  // Keep the keyboard-highlighted row visible when the list is longer than the
  // dropdown; arrowing off the bottom edge otherwise moves an invisible cursor.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[highlight];
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setTyping(false);
    setHighlight(0);
  };

  const close = () => {
    setOpen(false);
    setTyping(false);
    setQuery(selectedLabel);
  };

  const pick = (row: SelectRow) => {
    setOpen(false);
    setTyping(false);

    if (row.kind === 'create') {
      // The box goes back to showing the current selection: the typed name
      // travels into the dialog, and backing out of it leaves this untouched.
      setQuery(selectedLabel);
      onCreate?.(row.name);
      return;
    }

    setQuery(row.kind === 'clear' ? '' : row.option.label);
    onChange(row.kind === 'clear' ? '' : row.option.value);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
      onCancel?.();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      // Functional update, so keys pressed faster than React re-renders each
      // move one row instead of all landing on the same starting index.
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setHighlight((prev) =>
        Math.max(0, Math.min(rows.length - 1, prev + step)),
      );
      return;
    }
    if (event.key === 'Enter') {
      // Never let a pick submit the surrounding form in the same keystroke.
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      const row = rows[Math.min(highlight, rows.length - 1)];
      if (row !== undefined) pick(row);
    }
  };

  const listId = id === undefined ? undefined : `${id}-list`;

  return (
    <div className={`ssel${disabled ? ' is-disabled' : ''}`} ref={rootRef}>
      <input
        id={id}
        className="ssel-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        value={query}
        placeholder={placeholder ?? T17.searchSelectPlaceholder}
        onFocus={(event) => {
          openList();
          // Select rather than clear: the current name stays readable until the
          // moment the first keystroke replaces it.
          event.target.select();
        }}
        onClick={openList}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setTyping(true);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
      />

      {value !== '' && emptyLabel !== undefined && !disabled ? (
        <button
          type="button"
          className="ssel-clear"
          aria-label={T17.searchSelectClear}
          onClick={() => {
            onChange('');
            setQuery('');
            setOpen(false);
            setTyping(false);
          }}
        >
          <IconX size={13} />
        </button>
      ) : (
        <span className="ssel-caret" aria-hidden="true">
          <IconChevronDown size={14} />
        </span>
      )}

      {open && (
        <div className="ssel-list" id={listId} role="listbox" ref={listRef}>
          {/* The clear row is not a match, so "nothing found" has to key off the
              filtered options rather than off the rendered row count. */}
          {typing && matches.length === 0 && (
            <div className="ssel-empty">{T17.searchSelectNoMatch}</div>
          )}
          {rows.map((row, index) => {
            const isSelected =
              row.kind === 'clear'
                ? value === ''
                : row.kind === 'option' && row.option.value === value;
            const hint = row.kind === 'option' ? row.option.hint : undefined;
            const label = row.kind === 'option' ? row.option.label : row.label;
            return (
              <button
                type="button"
                key={
                  row.kind === 'option'
                    ? (row.option.value === '' ? '__empty__' : row.option.value)
                    : `__${row.kind}__`
                }
                role="option"
                aria-selected={isSelected}
                className={`ssel-option${index === highlight ? ' on' : ''}${
                  isSelected ? ' sel' : ''
                }${row.kind === 'create' ? ' create' : ''}`}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(row)}
              >
                <span>
                  {row.kind === 'create' && <IconPlus size={12} />}
                  {label}
                </span>
                {hint !== undefined && hint !== '' && (
                  <small className="ssel-hint">{hint}</small>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

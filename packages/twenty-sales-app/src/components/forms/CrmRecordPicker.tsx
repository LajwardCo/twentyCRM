import { useEffect, useRef, useState } from 'react';

import {
  type CrmRecordKind,
  type CrmRecordOption,
  searchCrmRecords,
} from '../../api/surveyCrm';

type CrmRecordPickerProps = {
  kind: CrmRecordKind;
  value: { recordId: string; label: string } | null;
  onChange: (value: { recordId: string; label: string } | null) => void;
  // Narrows contacts and leads to one company.
  companyId?: string | null;
  placeholder?: string;
  inputId?: string;
  // Offers "create new" with whatever was typed.
  onCreate?: (typed: string) => void;
  createLabel?: string;
  disabled?: boolean;
};

const PLACEHOLDERS: Record<CrmRecordKind, string> = {
  company: 'جستجوی شرکت یا کسب‌وکار…',
  person: 'جستجوی مخاطب (نام یا شماره)…',
  opportunity: 'جستجوی سرنخ…',
};

// Searches CRM records as you type. Staff screens only: the public form never
// renders it, and the server never sends a public respondent CRM data.
export const CrmRecordPicker = ({
  kind,
  value,
  onChange,
  companyId,
  placeholder,
  inputId,
  onCreate,
  createLabel,
  disabled,
}: CrmRecordPickerProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CrmRecordOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handle = window.setTimeout(() => {
      setLoading(true);
      searchCrmRecords(kind, query, companyId)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);

    return () => window.clearTimeout(handle);
  }, [kind, query, companyId, open]);

  // Close on an outside pointerdown, never on blur (the mobile keyboard
  // opening fires blur and would tear the list down mid-tap).
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);

    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  if (value !== null) {
    return (
      <div className="sv-file-chip">
        <b dir="auto">{value.label}</b>
        <button type="button" className="btn line sm" disabled={disabled} onClick={() => onChange(null)}>
          تغییر
        </button>
      </div>
    );
  }

  return (
    <div className="sv-picker" ref={wrapperRef}>
      <input
        id={inputId}
        className="sv-input"
        dir="auto"
        disabled={disabled}
        placeholder={placeholder ?? PLACEHOLDERS[kind]}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div className="sv-picker-list" role="listbox">
          {loading && <div className="sv-picker-empty">در حال جستجو…</div>}
          {!loading && results.length === 0 && <div className="sv-picker-empty">موردی پیدا نشد</div>}
          {results.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={false}
              className="sv-picker-option"
              onClick={() => {
                onChange({ recordId: option.id, label: option.label });
                setOpen(false);
                setQuery('');
              }}
            >
              <span dir="auto">{option.label}</span>
              {option.sub !== '' && <small dir="auto">{option.sub}</small>}
            </button>
          ))}
          {onCreate !== undefined && query.trim() !== '' && (
            <button
              type="button"
              className="sv-picker-option sv-picker-create"
              onClick={() => {
                onCreate(query.trim());
                setOpen(false);
              }}
            >
              + {createLabel ?? 'ایجاد'} «{query.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
};

import {
  isFilterActive,
  type FilterField,
  type FilterState,
  type FilterValue,
} from '../lib/filters';
import { toPersianDigits } from '../lib/jalali';
import { T7 } from '../lib/strings';
import { JalaliDatePicker } from './JalaliDatePicker';
import { ModalSheet } from './ModalSheet';

type FilterSheetProps<TRow> = {
  fields: FilterField<TRow>[];
  state: FilterState;
  onSet: (key: string, value: FilterValue) => void;
  onClear: (key: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  resultCount: number | null;
};

// ---------- per-kind editors ----------

const MultiEnumEditor = <TRow,>({
  field,
  value,
  onSet,
}: {
  field: FilterField<TRow>;
  value: FilterValue | undefined;
  onSet: (value: FilterValue) => void;
}) => {
  const selected = value?.kind === 'multiEnum' ? value.values : [];
  const toggle = (option: string) => {
    const next = selected.includes(option)
      ? selected.filter((entry) => entry !== option)
      : [...selected, option];
    onSet({ kind: 'multiEnum', values: next });
  };

  if ((field.options ?? []).length === 0) {
    return <div className="filter-empty">{T7.noOptions}</div>;
  }

  return (
    <div className="filter-options">
      {(field.options ?? []).map((option) => (
        <button
          key={option.value}
          type="button"
          className={`filter-option${
            selected.includes(option.value) ? ' on' : ''
          }`}
          onClick={() => toggle(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};

const TextEditor = ({
  value,
  placeholder,
  onSet,
}: {
  value: FilterValue | undefined;
  placeholder: string;
  onSet: (value: FilterValue) => void;
}) => (
  <input
    className="filter-input"
    type="search"
    placeholder={placeholder}
    value={value?.kind === 'text' ? value.text : ''}
    onChange={(e) => onSet({ kind: 'text', text: e.target.value })}
  />
);

const parseBound = (raw: string): number | null => {
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const NumberRangeEditor = ({
  value,
  onSet,
}: {
  value: FilterValue | undefined;
  onSet: (value: FilterValue) => void;
}) => {
  const range = value?.kind === 'numberRange' ? value : { min: null, max: null };
  return (
    <div className="filter-range">
      <input
        className="filter-input num"
        type="number"
        inputMode="numeric"
        placeholder={T7.from}
        value={range.min ?? ''}
        onChange={(e) =>
          onSet({
            kind: 'numberRange',
            min: parseBound(e.target.value),
            max: range.max,
          })
        }
      />
      <span className="filter-range-sep">—</span>
      <input
        className="filter-input num"
        type="number"
        inputMode="numeric"
        placeholder={T7.to}
        value={range.max ?? ''}
        onChange={(e) =>
          onSet({
            kind: 'numberRange',
            min: range.min,
            max: parseBound(e.target.value),
          })
        }
      />
    </div>
  );
};

const DateRangeEditor = ({
  value,
  onSet,
}: {
  value: FilterValue | undefined;
  onSet: (value: FilterValue) => void;
}) => {
  const range = value?.kind === 'dateRange' ? value : { from: null, to: null };
  return (
    <div className="filter-range">
      <JalaliDatePicker
        withTime={false}
        value={range.from ?? ''}
        onChange={(next) =>
          onSet({ kind: 'dateRange', from: next || null, to: range.to })
        }
      />
      <span className="filter-range-sep">—</span>
      <JalaliDatePicker
        withTime={false}
        value={range.to ?? ''}
        onChange={(next) =>
          onSet({ kind: 'dateRange', from: range.from, to: next || null })
        }
      />
    </div>
  );
};

const BooleanEditor = ({
  value,
  onSet,
  onClear,
}: {
  value: FilterValue | undefined;
  onSet: (value: FilterValue) => void;
  onClear: () => void;
}) => {
  const current = value?.kind === 'boolean' ? value.value : null;
  return (
    <div className="seg">
      <button
        type="button"
        className={current === null ? 'on' : ''}
        onClick={onClear}
      >
        {T7.any}
      </button>
      <button
        type="button"
        className={current === true ? 'on' : ''}
        onClick={() => onSet({ kind: 'boolean', value: true })}
      >
        {T7.yes}
      </button>
      <button
        type="button"
        className={current === false ? 'on' : ''}
        onClick={() => onSet({ kind: 'boolean', value: false })}
      >
        {T7.no}
      </button>
    </div>
  );
};

// ---------- sheet ----------

export const FilterSheet = <TRow,>({
  fields,
  state,
  onSet,
  onClear,
  onClearAll,
  onClose,
  resultCount,
}: FilterSheetProps<TRow>) => (
  <ModalSheet title={T7.filterTitle} onClose={onClose}>
    <div className="filter-groups">
      {fields.map((field) => {
        const value = state[field.key];
        const set = (next: FilterValue) => onSet(field.key, next);
        return (
          <div className="filter-group" key={field.key}>
            <div className="filter-group-head">
              <span className="lbl">{field.label}</span>
              {isFilterActive(value) && (
                <button
                  type="button"
                  className="filter-reset"
                  onClick={() => onClear(field.key)}
                >
                  {T7.reset}
                </button>
              )}
            </div>

            {field.kind === 'multiEnum' && (
              <MultiEnumEditor field={field} value={value} onSet={set} />
            )}
            {field.kind === 'text' && (
              <TextEditor value={value} placeholder={field.label} onSet={set} />
            )}
            {field.kind === 'numberRange' && (
              <NumberRangeEditor value={value} onSet={set} />
            )}
            {field.kind === 'dateRange' && (
              <DateRangeEditor value={value} onSet={set} />
            )}
            {field.kind === 'boolean' && (
              <BooleanEditor
                value={value}
                onSet={set}
                onClear={() => onClear(field.key)}
              />
            )}
          </div>
        );
      })}
    </div>

    <div className="filter-actions">
      <button type="button" className="btn line sm" onClick={onClearAll}>
        {T7.clearAll}
      </button>
      <div className="grow" />
      <button type="button" className="btn gold sm" onClick={onClose}>
        {resultCount === null
          ? T7.showResults
          : `${T7.showResults} (${toPersianDigits(resultCount)})`}
      </button>
    </div>
  </ModalSheet>
);

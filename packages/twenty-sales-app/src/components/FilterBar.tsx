import { useState } from 'react';

import {
  filterChips,
  type FilterField,
  type FilterState,
} from '../lib/filters';
import { type UseFiltersResult } from '../lib/useFilters';
import { toPersianDigits } from '../lib/jalali';
import { T7 } from '../lib/strings';
import { FilterSheet } from './FilterSheet';
import { IconFilter, IconClose } from './icons';

type FilterBarProps<TRow> = {
  fields: FilterField<TRow>[];
  filters: UseFiltersResult;
  // Shown live inside the sheet so a seller sees the cost of a choice before
  // closing it.
  resultCount?: number | null;
};

// The filter entry point every list screen drops into its .toolbar row: one
// button carrying the active count, plus a removable chip per active filter.
export const FilterBar = <TRow,>({
  fields,
  filters,
  resultCount,
}: FilterBarProps<TRow>) => {
  const [open, setOpen] = useState(false);
  const chips = filterChips(fields, filters.state);

  return (
    <>
      <button
        type="button"
        className={`btn line sm${filters.count > 0 ? ' on' : ''}`}
        onClick={() => setOpen(true)}
      >
        <IconFilter size={14} />
        {T7.filters}
        {filters.count > 0 && (
          <span className="filter-count num">
            {toPersianDigits(filters.count)}
          </span>
        )}
      </button>

      {chips.length > 0 && (
        <div className="filter-chips">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="filter-chip"
              onClick={() => filters.clear(chip.key)}
              title={T7.removeFilter}
            >
              <span className="filter-chip-label">{chip.label}:</span>
              <span className="filter-chip-value">{chip.value}</span>
              <IconClose size={11} />
            </button>
          ))}
          {chips.length > 1 && (
            <button
              type="button"
              className="filter-chip clear-all"
              onClick={filters.clearAll}
            >
              {T7.clearAll}
            </button>
          )}
        </div>
      )}

      {open && (
        <FilterSheet
          fields={fields}
          state={filters.state}
          onSet={filters.set}
          onClear={filters.clear}
          onClearAll={filters.clearAll}
          onClose={() => setOpen(false)}
          resultCount={resultCount ?? null}
        />
      )}
    </>
  );
};

// Re-exported so a screen imports one module for the whole feature.
export type { FilterField, FilterState };

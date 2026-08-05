// The filter engine shared by every list screen.
//
// A screen declares WHICH fields it filters on; this module owns HOW a filter
// is evaluated. There are two evaluators because the screens differ in a way
// that matters for correctness:
//
//   * Leads and contacts are server-paged, so filtering in the browser would
//     silently filter a truncated page. They go through buildGraphQLFilter.
//   * Tasks, catalog and competitors already hold the full set in memory, so a
//     round trip per keystroke would be waste. They go through applyFilters.
//
// Both read the same FilterState, so a screen can switch sides without the UI
// or the URL format changing.

export type FilterOption = { value: string; label: string };

export type FilterFieldKind =
  | 'multiEnum'
  | 'text'
  | 'numberRange'
  | 'dateRange'
  | 'boolean';

export type FilterField<TRow = unknown> = {
  key: string;
  label: string;
  kind: FilterFieldKind;
  // Choices for a multiEnum. The empty string is a legal value and means
  // "record has no value here" — sellers ask for "leads with no owner".
  options?: FilterOption[];
  // Dotted path into the GraphQL filter input ('amount.amountMicros'), for
  // server-side screens.
  serverPath?: string;
  // Multiplier applied to a numberRange before it reaches the server: money is
  // entered in whole afghanis but stored in micros.
  scale?: number;
  // Reads the comparable value off a row, for client-side screens.
  get?: (row: TRow) => unknown;
  // Escape hatch for fields whose server clause isn't a plain comparison
  // (presence checks, relations). Wins over serverPath when present.
  buildServerFilter?: (value: FilterValue) => Record<string, unknown> | undefined;
  // Renders the chip/summary text for an active value. Defaults per kind.
  // Deliberately does not take the field back: referencing FilterField<TRow>
  // in its own signature would make the type invariant in TRow, which blocks a
  // screen from declaring one field set over two related row shapes.
  describe?: (value: FilterValue) => string;
};

export type FilterValue =
  | { kind: 'multiEnum'; values: string[] }
  | { kind: 'text'; text: string }
  | { kind: 'numberRange'; min: number | null; max: number | null }
  | { kind: 'dateRange'; from: string | null; to: string | null }
  | { kind: 'boolean'; value: boolean };

export type FilterState = Record<string, FilterValue>;

// ---------- activity ----------

// A filter with nothing chosen must behave exactly like no filter at all --
// otherwise an opened-then-emptied field quietly returns zero rows.
export const isFilterActive = (value: FilterValue | undefined): boolean => {
  if (!value) return false;
  switch (value.kind) {
    case 'multiEnum':
      return value.values.length > 0;
    case 'text':
      return value.text.trim() !== '';
    case 'numberRange':
      return value.min !== null || value.max !== null;
    case 'dateRange':
      return value.from !== null || value.to !== null;
    case 'boolean':
      return true;
  }
};

const activeEntries = <TRow>(
  fields: FilterField<TRow>[],
  state: FilterState,
): { field: FilterField<TRow>; value: FilterValue }[] =>
  fields
    .map((field) => ({ field, value: state[field.key] }))
    .filter(
      (entry): entry is { field: FilterField<TRow>; value: FilterValue } =>
        isFilterActive(entry.value) && entry.value.kind === entry.field.kind,
    );

export const activeFilterCount = <TRow>(
  fields: FilterField<TRow>[],
  state: FilterState,
): number => activeEntries(fields, state).length;

export const clearFilter = (state: FilterState, key: string): FilterState => {
  const next = { ...state };
  delete next[key];
  return next;
};

export const setFilter = (
  state: FilterState,
  key: string,
  value: FilterValue,
): FilterState =>
  isFilterActive(value) ? { ...state, [key]: value } : clearFilter(state, key);

// ---------- day boundaries ----------

// A date filter reads as a day, not an instant: "from 2026-03-01" must include
// everything that happened that morning in the seller's own timezone.
const parseDayParts = (day: string): [number, number, number] | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
};

export const startOfDay = (day: string): Date | null => {
  const parts = parseDayParts(day);
  return parts ? new Date(parts[0], parts[1], parts[2], 0, 0, 0, 0) : null;
};

export const endOfDay = (day: string): Date | null => {
  const parts = parseDayParts(day);
  return parts ? new Date(parts[0], parts[1], parts[2], 23, 59, 59, 999) : null;
};

// ---------- server side ----------

// 'amount.amountMicros' -> { amount: { amountMicros: <clause> } }
const nestPath = (path: string, clause: Record<string, unknown>) => {
  const segments = path.split('.');
  return segments.reduceRight<Record<string, unknown>>(
    (inner, segment) => ({ [segment]: inner }),
    clause,
  );
};

const serverClause = <TRow>(
  field: FilterField<TRow>,
  value: FilterValue,
): Record<string, unknown> | undefined => {
  if (field.buildServerFilter) return field.buildServerFilter(value);
  const path = field.serverPath;
  if (!path) return undefined;

  switch (value.kind) {
    case 'multiEnum':
      return nestPath(path, { in: value.values });
    case 'text':
      return nestPath(path, { ilike: `%${value.text.trim()}%` });
    case 'numberRange': {
      const scale = field.scale ?? 1;
      const clause: Record<string, number> = {};
      if (value.min !== null) clause.gte = value.min * scale;
      if (value.max !== null) clause.lte = value.max * scale;
      return nestPath(path, clause);
    }
    case 'dateRange': {
      const clause: Record<string, string> = {};
      const from = value.from ? startOfDay(value.from) : null;
      const to = value.to ? endOfDay(value.to) : null;
      if (from) clause.gte = from.toISOString();
      if (to) clause.lte = to.toISOString();
      return Object.keys(clause).length > 0 ? nestPath(path, clause) : undefined;
    }
    case 'boolean':
      // Without a builder there is no sensible default: a boolean filter is
      // almost always a presence check on some other column.
      return undefined;
  }
};

export const buildGraphQLFilter = <TRow>(
  fields: FilterField<TRow>[],
  state: FilterState,
): Record<string, unknown> | undefined => {
  const clauses = activeEntries(fields, state)
    .map(({ field, value }) => serverClause(field, value))
    .filter((clause): clause is Record<string, unknown> => clause !== undefined);

  return clauses.length > 0 ? { and: clauses } : undefined;
};

// ---------- client side ----------

const normalize = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    // Arabic vs Persian forms of the same letters, so a search typed on one
    // keyboard finds text entered on the other.
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ');

const asText = (raw: unknown): string =>
  raw === null || raw === undefined ? '' : String(raw);

const asNumber = (raw: unknown): number | null => {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asTime = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
};

const matches = <TRow>(
  field: FilterField<TRow>,
  value: FilterValue,
  row: TRow,
): boolean => {
  if (!field.get) return true;
  const raw = field.get(row);

  switch (value.kind) {
    case 'multiEnum':
      return value.values.includes(asText(raw));
    case 'text':
      return normalize(asText(raw)).includes(normalize(value.text));
    case 'numberRange': {
      const numeric = asNumber(raw);
      if (numeric === null) return false;
      // `scale` converts what the seller typed into what the row stores, and
      // has to mean the same thing here as it does server-side.
      const scale = field.scale ?? 1;
      if (value.min !== null && numeric < value.min * scale) return false;
      if (value.max !== null && numeric > value.max * scale) return false;
      return true;
    }
    case 'dateRange': {
      const time = asTime(raw);
      if (time === null) return false;
      const from = value.from ? startOfDay(value.from) : null;
      const to = value.to ? endOfDay(value.to) : null;
      if (from && time < from.getTime()) return false;
      if (to && time > to.getTime()) return false;
      return true;
    }
    case 'boolean':
      return Boolean(raw) === value.value;
  }
};

export const applyFilters = <TRow>(
  fields: FilterField<TRow>[],
  state: FilterState,
  rows: TRow[],
): TRow[] => {
  const entries = activeEntries(fields, state);
  if (entries.length === 0) return rows;
  return rows.filter((row) =>
    entries.every(({ field, value }) => matches(field, value, row)),
  );
};

// ---------- url serialization ----------

const RANGE_SEPARATOR = '..';

const encodeValue = (value: FilterValue): string | null => {
  switch (value.kind) {
    case 'multiEnum':
      return value.values.join(',');
    case 'text':
      return value.text.trim();
    case 'numberRange':
      return `${value.min ?? ''}${RANGE_SEPARATOR}${value.max ?? ''}`;
    case 'dateRange':
      return `${value.from ?? ''}${RANGE_SEPARATOR}${value.to ?? ''}`;
    case 'boolean':
      return value.value ? '1' : '0';
  }
};

export const encodeFilterState = <TRow>(
  fields: FilterField<TRow>[],
  state: FilterState,
): string => {
  const params = new URLSearchParams();
  for (const { field, value } of activeEntries(fields, state)) {
    const encoded = encodeValue(value);
    if (encoded !== null && encoded !== '') params.set(field.key, encoded);
  }
  // URLSearchParams percent-encodes Persian text and commas; the hash carries
  // it fine and decodeFilterState reverses it, so leave it encoded.
  return params.toString();
};

const decodeRange = (raw: string): [string, string] | null => {
  const index = raw.indexOf(RANGE_SEPARATOR);
  if (index === -1) return null;
  return [raw.slice(0, index), raw.slice(index + RANGE_SEPARATOR.length)];
};

const decodeValue = (
  kind: FilterFieldKind,
  raw: string,
): FilterValue | null => {
  switch (kind) {
    case 'multiEnum': {
      const values = raw.split(',').filter((entry) => entry !== '');
      return values.length > 0 ? { kind, values } : null;
    }
    case 'text':
      return raw.trim() === '' ? null : { kind, text: raw.trim() };
    case 'numberRange': {
      const parts = decodeRange(raw);
      if (!parts) return null;
      const min = parts[0] === '' ? null : Number(parts[0]);
      const max = parts[1] === '' ? null : Number(parts[1]);
      if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
        return null;
      }
      return min === null && max === null ? null : { kind, min, max };
    }
    case 'dateRange': {
      const parts = decodeRange(raw);
      if (!parts) return null;
      const from = parts[0] === '' ? null : parts[0];
      const to = parts[1] === '' ? null : parts[1];
      if ((from && !parseDayParts(from)) || (to && !parseDayParts(to))) return null;
      return from === null && to === null ? null : { kind, from, to };
    }
    case 'boolean':
      if (raw !== '0' && raw !== '1') return null;
      return { kind, value: raw === '1' };
  }
};

export const decodeFilterState = <TRow>(
  fields: FilterField<TRow>[],
  query: string,
): FilterState => {
  const params = new URLSearchParams(query.replace(/^\?/, ''));
  const state: FilterState = {};
  for (const field of fields) {
    const raw = params.get(field.key);
    if (raw === null) continue;
    const value = decodeValue(field.kind, raw);
    if (value) state[field.key] = value;
  }
  return state;
};

// ---------- chip labels ----------

const optionLabel = <TRow>(field: FilterField<TRow>, value: string): string =>
  field.options?.find((option) => option.value === value)?.label ?? value;

export const describeFilter = <TRow>(
  field: FilterField<TRow>,
  value: FilterValue,
): string => {
  if (field.describe) return field.describe(value);
  switch (value.kind) {
    case 'multiEnum':
      return value.values.length <= 2
        ? value.values.map((entry) => optionLabel(field, entry)).join('، ')
        : `${value.values.length} مورد`;
    case 'text':
      return value.text.trim();
    case 'numberRange':
    case 'dateRange': {
      const from = value.kind === 'numberRange' ? value.min : value.from;
      const to = value.kind === 'numberRange' ? value.max : value.to;
      if (from !== null && to !== null) return `${from} تا ${to}`;
      if (from !== null) return `از ${from}`;
      return `تا ${to}`;
    }
    case 'boolean':
      return value.value ? 'بله' : 'خیر';
  }
};

// Chips shown next to the filter button: one per active field.
export const filterChips = <TRow>(
  fields: FilterField<TRow>[],
  state: FilterState,
): { key: string; label: string; value: string }[] =>
  activeEntries(fields, state).map(({ field, value }) => ({
    key: field.key,
    label: field.label,
    value: describeFilter(field, value),
  }));

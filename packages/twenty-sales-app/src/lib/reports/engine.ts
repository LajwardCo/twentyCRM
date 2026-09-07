import {
  addCurrencyTotals,
  type CurrencyTotals,
  DEFAULT_CURRENCY,
  formatMoneyTotals,
  totalsAreEmpty,
} from '../format';
import { type FilterField, type FilterOption } from '../filters';
import { formatJalaliDate, toPersianDigits } from '../jalali';
import { RT } from './strings';
import {
  type ColumnKind,
  type ReportCell,
  type ReportColumn,
  type ReportKpi,
  type ReportRow,
} from './types';

// The generic half of the report library: everything that works the same way
// on every report, so a report definition only has to say what its rows mean.

// ---------- cell constructors ----------

export const NO_VALUE = '—';

export const textCell = (
  value: string | null | undefined,
  extra: Partial<ReportCell> = {},
): ReportCell => ({
  value: value === undefined || value === '' ? null : value,
  ...extra,
});

export const numberCell = (
  value: number | null,
  extra: Partial<ReportCell> = {},
): ReportCell => ({ value, ...extra });

export const percentCell = (
  value: number | null,
  extra: Partial<ReportCell> = {},
): ReportCell => ({ value, ...extra });

export const daysCell = (
  value: number | null,
  extra: Partial<ReportCell> = {},
): ReportCell => ({ value, ...extra });

export const dateCell = (
  iso: string | null | undefined,
  extra: Partial<ReportCell> = {},
): ReportCell => ({ value: iso ?? null, ...extra });

// Ranking needs one comparable number even when a row mixes currencies, so the
// largest single-currency bucket is used -- an approximation that never claims
// to be a total, unlike adding AFN to USD.
export const rankTotals = (totals: CurrencyTotals): number =>
  Math.max(0, ...Object.values(totals));

export const moneyCell = (
  totals: CurrencyTotals,
  extra: Partial<ReportCell> = {},
): ReportCell => ({
  value: totalsAreEmpty(totals) ? null : rankTotals(totals),
  totals,
  ...extra,
});

export const amountCell = (
  micros: number | null | undefined,
  currencyCode?: string | null,
  extra: Partial<ReportCell> = {},
): ReportCell => moneyCell(addCurrencyTotals({}, micros, currencyCode), extra);

// ---------- formatting ----------

export const formatCell = (kind: ColumnKind, cell: ReportCell): string => {
  if (cell.text !== undefined) return cell.text;
  if (kind === 'money') {
    return cell.totals && !totalsAreEmpty(cell.totals)
      ? formatMoneyTotals(cell.totals)
      : NO_VALUE;
  }
  if (cell.value === null) return NO_VALUE;
  switch (kind) {
    case 'number':
      return toPersianDigits(cell.value as number);
    case 'percent':
      return `${toPersianDigits(Math.round(cell.value as number))}٪`;
    case 'days':
      return `${toPersianDigits(Math.round(cell.value as number))} ${RT.dayUnit}`;
    case 'date':
      return formatJalaliDate(String(cell.value));
    case 'text':
    default:
      return String(cell.value);
  }
};

const csvCell = (kind: ColumnKind, cell: ReportCell): string => {
  if (kind === 'money') {
    const totals = cell.totals ?? {};
    const parts = Object.entries(totals)
      .filter(([, micros]) => micros)
      .map(([code, micros]) => `${code} ${(micros / 1_000_000).toFixed(2)}`);
    return parts.join(' + ');
  }
  if (cell.value === null) return '';
  if (kind === 'date') return String(cell.value).slice(0, 10);
  // Numbers go out in latin digits: a spreadsheet cannot add Persian ones.
  if (kind === 'number' || kind === 'percent' || kind === 'days') {
    return String(cell.value);
  }
  return String(cell.value);
};

// ---------- sorting ----------

const NUMERIC_KINDS: ColumnKind[] = ['number', 'money', 'percent', 'days'];

export const sortRows = (
  rows: ReportRow[],
  columns: ReportColumn[],
  key: string,
  dir: 'asc' | 'desc',
): ReportRow[] => {
  const column = columns.find((c) => c.key === key);
  if (!column) return rows;
  const numeric = NUMERIC_KINDS.includes(column.kind);
  const factor = dir === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = a.cells[key]?.value ?? null;
    const right = b.cells[key]?.value ?? null;
    // A missing value sorts last in both directions: "no data" is not the
    // smallest value, it is the absence of one.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (numeric) return (Number(left) - Number(right)) * factor;
    return String(left).localeCompare(String(right), 'fa') * factor;
  });
};

// ---------- filters ----------

const NONE = '';

const enumOptions = (rows: ReportRow[], key: string): FilterOption[] => {
  const seen = new Set<string>();
  let hasNone = false;
  for (const row of rows) {
    const value = row.cells[key]?.value ?? null;
    if (value === null || value === '') hasNone = true;
    else seen.add(String(value));
  }
  const options = [...seen]
    .sort((a, b) => a.localeCompare(b, 'fa'))
    .map((value) => ({ value, label: value }));
  return hasNone ? [...options, { value: NONE, label: RT.noValue }] : options;
};

const FILTER_KIND = {
  enum: 'multiEnum',
  text: 'text',
  range: 'numberRange',
  dateRange: 'dateRange',
} as const;

// Every filter here runs in the browser: the rows are already fully loaded and
// derived (days-in-stage, win rate, commission), so there is nothing the
// server could filter on.
export const reportFilterFields = (
  columns: ReportColumn[],
  rows: ReportRow[],
): FilterField<ReportRow>[] =>
  columns
    .filter((column) => column.filter !== undefined)
    .map((column) => ({
      key: column.key,
      label: column.label,
      kind: FILTER_KIND[column.filter as keyof typeof FILTER_KIND],
      options:
        column.filter === 'enum' ? enumOptions(rows, column.key) : undefined,
      get: (row: ReportRow) => row.cells[column.key]?.value ?? null,
    }));

// ---------- grouping ----------

export const GROUP_COUNT_KEY = '__count';

const DEFAULT_AGGREGATE: Record<ColumnKind, ReportColumn['aggregate']> = {
  text: 'none',
  number: 'sum',
  money: 'sum',
  percent: 'avg',
  days: 'avg',
  date: 'max',
};

const aggregateNumbers = (
  values: number[],
  how: ReportColumn['aggregate'],
): number | null => {
  if (values.length === 0) return null;
  switch (how) {
    case 'avg':
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    case 'count':
      return values.length;
    case 'sum':
    default:
      return values.reduce((sum, v) => sum + v, 0);
  }
};

export const groupColumns = (
  columns: ReportColumn[],
  groupKey: string,
): ReportColumn[] => {
  const grouped = columns.find((c) => c.key === groupKey);
  const rest = columns.filter(
    (c) => c.key !== groupKey && c.kind !== 'text' && c.aggregate !== 'none',
  );
  return [
    { key: groupKey, label: grouped?.label ?? groupKey, kind: 'text', filter: 'enum' },
    { key: GROUP_COUNT_KEY, label: RT.rowCount, kind: 'number' },
    ...rest,
  ];
};

export const groupRows = (
  rows: ReportRow[],
  columns: ReportColumn[],
  groupKey: string,
): ReportRow[] => {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const raw = row.cells[groupKey]?.value;
    const label = raw === null || raw === undefined || raw === '' ? RT.noValue : String(raw);
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }

  const aggregated = columns.filter(
    (c) => c.key !== groupKey && c.kind !== 'text' && c.aggregate !== 'none',
  );

  return [...groups.entries()].map(([label, list]) => {
    const cells: Record<string, ReportCell> = {
      [groupKey]: textCell(label),
      [GROUP_COUNT_KEY]: numberCell(list.length),
    };

    for (const column of aggregated) {
      const how = column.aggregate ?? DEFAULT_AGGREGATE[column.kind];
      if (column.kind === 'money') {
        const totals: CurrencyTotals = {};
        for (const row of list) {
          const rowTotals = row.cells[column.key]?.totals ?? {};
          for (const [code, micros] of Object.entries(rowTotals)) {
            addCurrencyTotals(totals, micros, code);
          }
        }
        cells[column.key] = moneyCell(totals);
        continue;
      }
      if (column.kind === 'date') {
        const dates = list
          .map((row) => row.cells[column.key]?.value)
          .filter((value): value is string => typeof value === 'string');
        cells[column.key] = dateCell(
          dates.length > 0 ? dates.sort()[dates.length - 1] : null,
        );
        continue;
      }
      const numbers = list
        .map((row) => row.cells[column.key]?.value)
        .filter((value): value is number => typeof value === 'number');
      cells[column.key] = { value: aggregateNumbers(numbers, how) };
    }

    return { id: label, cells };
  });
};

// ---------- ranked breakdown (the chart above the table) ----------

// `countKey` exists for reports whose rows are already groups (a leaderboard
// has one row per seller): counting those rows draws a bar of 1 next to every
// name. Naming a numeric column instead sums what the bar is actually about.
export const breakdownRows = (
  rows: ReportRow[],
  groupKey: string,
  valueKey?: string,
  countKey?: string,
): { label: string; count: number; value: CurrencyTotals }[] => {
  const groups = new Map<string, { count: number; value: CurrencyTotals }>();
  for (const row of rows) {
    const raw = row.cells[groupKey]?.value;
    const label = raw === null || raw === undefined || raw === '' ? NO_VALUE : String(raw);
    const entry = groups.get(label) ?? { count: 0, value: {} };
    if (countKey) {
      const measured = row.cells[countKey]?.value;
      entry.count += typeof measured === 'number' ? Math.round(measured) : 0;
    } else {
      entry.count += 1;
    }
    if (valueKey) {
      const totals = row.cells[valueKey]?.totals ?? {};
      for (const [code, micros] of Object.entries(totals)) {
        addCurrencyTotals(entry.value, micros, code);
      }
    }
    groups.set(label, entry);
  }
  return [...groups.entries()]
    .map(([label, entry]) => ({ label, ...entry }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
};

// ---------- KPI helpers, used by the report definitions ----------

export const sumMoney = (rows: ReportRow[], key: string): CurrencyTotals => {
  const totals: CurrencyTotals = {};
  for (const row of rows) {
    for (const [code, micros] of Object.entries(row.cells[key]?.totals ?? {})) {
      addCurrencyTotals(totals, micros, code);
    }
  }
  return totals;
};

export const sumNumber = (rows: ReportRow[], key: string): number =>
  rows.reduce((sum, row) => {
    const value = row.cells[key]?.value;
    return sum + (typeof value === 'number' ? value : 0);
  }, 0);

export const averageNumber = (rows: ReportRow[], key: string): number | null => {
  const values = rows
    .map((row) => row.cells[key]?.value)
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

// The most common value in a column, with its share -- used by KPI tiles that
// answer "which one dominates".
export const topLabel = (rows: ReportRow[], key: string): string => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row.cells[key]?.value;
    if (value === null || value === undefined || value === '') continue;
    counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? `${best[0]} (${toPersianDigits(best[1])})` : NO_VALUE;
};

export const countWhere = (
  rows: ReportRow[],
  predicate: (row: ReportRow) => boolean,
): number => rows.filter(predicate).length;

export const kpi = (
  label: string,
  value: string,
  extra: Partial<ReportKpi> = {},
): ReportKpi => ({ label, value, ...extra });

export const countKpi = (label: string, value: number, extra: Partial<ReportKpi> = {}): ReportKpi =>
  kpi(label, toPersianDigits(value), extra);

export const moneyKpi = (
  label: string,
  totals: CurrencyTotals,
  extra: Partial<ReportKpi> = {},
): ReportKpi =>
  kpi(label, totalsAreEmpty(totals) ? NO_VALUE : formatMoneyTotals(totals), extra);

export const percentKpi = (
  label: string,
  value: number | null,
  extra: Partial<ReportKpi> = {},
): ReportKpi =>
  kpi(
    label,
    value === null ? NO_VALUE : `${toPersianDigits(Math.round(value))}٪`,
    extra,
  );

export const daysKpi = (
  label: string,
  value: number | null,
  extra: Partial<ReportKpi> = {},
): ReportKpi =>
  kpi(
    label,
    value === null ? NO_VALUE : `${toPersianDigits(Math.round(value))} ${RT.dayUnit}`,
    extra,
  );

// ---------- CSV export ----------

// Excel only reads UTF-8 without a BOM as latin-1, which turns every Persian
// column into mojibake, so the BOM stays.
const BOM = '﻿';

const escapeCsv = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

export const toCsv = (rows: ReportRow[], columns: ReportColumn[]): string => {
  const header = columns.map((column) => escapeCsv(column.label)).join(',');
  const body = rows.map((row) =>
    columns
      .map((column) =>
        escapeCsv(csvCell(column.kind, row.cells[column.key] ?? { value: null })),
      )
      .join(','),
  );
  return `${BOM}${[header, ...body].join('\n')}\n`;
};

export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// Currency helper for report definitions that build their own totals.
export const currencyOf = (code?: string | null): string =>
  code ?? DEFAULT_CURRENCY;

import { describe, expect, it } from 'vitest';

import { type FilterState } from '../filters';
import { applyFilters } from '../filters';
import {
  amountCell,
  breakdownRows,
  daysCell,
  formatCell,
  GROUP_COUNT_KEY,
  groupColumns,
  groupRows,
  moneyCell,
  numberCell,
  percentCell,
  reportFilterFields,
  sortRows,
  sumMoney,
  textCell,
  toCsv,
  topLabel,
} from './engine';
import { type ReportColumn, type ReportRow } from './types';

const COLUMNS: ReportColumn[] = [
  { key: 'seller', label: 'فروشنده', kind: 'text', filter: 'enum' },
  { key: 'stage', label: 'مرحله', kind: 'text', filter: 'enum' },
  { key: 'value', label: 'ارزش', kind: 'money', filter: 'range' },
  { key: 'age', label: 'عمر', kind: 'days', filter: 'range' },
  { key: 'rate', label: 'نرخ', kind: 'percent' },
  { key: 'created', label: 'تاریخ', kind: 'date', filter: 'dateRange' },
];

const row = (
  id: string,
  seller: string | null,
  stage: string,
  micros: number | null,
  currency: string,
  age: number | null,
  rate: number | null,
  created: string,
): ReportRow => ({
  id,
  cells: {
    seller: textCell(seller),
    stage: textCell(stage),
    value: amountCell(micros, currency),
    age: daysCell(age),
    rate: percentCell(rate),
    created: { value: created },
  },
});

const ROWS: ReportRow[] = [
  row('a', 'احمد', 'جدید', 1_000_000, 'AFN', 4, 50, '2026-03-01T08:00:00.000Z'),
  row('b', 'احمد', 'بسته', 3_000_000, 'AFN', 30, 100, '2026-04-01T08:00:00.000Z'),
  row('c', 'زهرا', 'جدید', 20_000_000, 'USD', null, 0, '2026-05-01T08:00:00.000Z'),
  row('d', null, 'جدید', null, 'AFN', 12, null, '2026-06-01T08:00:00.000Z'),
];

describe('sortRows', () => {
  it('should order numeric columns by magnitude, not by rendered text', () => {
    const sorted = sortRows(ROWS, COLUMNS, 'value', 'desc');
    expect(sorted.map((r) => r.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('should keep rows with no value last in both directions', () => {
    expect(sortRows(ROWS, COLUMNS, 'age', 'asc').map((r) => r.id)).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
    expect(sortRows(ROWS, COLUMNS, 'age', 'desc').map((r) => r.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('should leave the source array untouched', () => {
    const before = ROWS.map((r) => r.id);
    sortRows(ROWS, COLUMNS, 'value', 'asc');
    expect(ROWS.map((r) => r.id)).toEqual(before);
  });
});

describe('groupRows', () => {
  it('should sum money per currency rather than across currencies', () => {
    const grouped = groupRows(ROWS, COLUMNS, 'stage');
    const fresh = grouped.find((r) => r.id === 'جدید');
    expect(fresh?.cells.value.totals).toEqual({ AFN: 1_000_000, USD: 20_000_000 });
  });

  it('should count rows per group', () => {
    const grouped = groupRows(ROWS, COLUMNS, 'stage');
    expect(grouped.find((r) => r.id === 'جدید')?.cells[GROUP_COUNT_KEY].value).toBe(3);
    expect(grouped.find((r) => r.id === 'بسته')?.cells[GROUP_COUNT_KEY].value).toBe(1);
  });

  it('should average percent and day columns instead of summing them', () => {
    const grouped = groupRows(ROWS, COLUMNS, 'seller');
    const ahmad = grouped.find((r) => r.id === 'احمد');
    expect(ahmad?.cells.rate.value).toBe(75);
    expect(ahmad?.cells.age.value).toBe(17);
  });

  it('should bucket rows with no group value under a named group', () => {
    const grouped = groupRows(ROWS, COLUMNS, 'seller');
    expect(grouped.map((r) => r.id)).toContain('بدون مقدار');
  });

  it('should replace the column set with the grouped one', () => {
    const columns = groupColumns(COLUMNS, 'stage');
    expect(columns.map((c) => c.key)).toEqual([
      'stage',
      GROUP_COUNT_KEY,
      'value',
      'age',
      'rate',
      'created',
    ]);
  });
});

describe('reportFilterFields', () => {
  it('should derive enum options from the values actually present', () => {
    const fields = reportFilterFields(COLUMNS, ROWS);
    const seller = fields.find((f) => f.key === 'seller');
    expect(seller?.options?.map((o) => o.value)).toEqual(['احمد', 'زهرا', '']);
  });

  it('should produce fields before any row exists, so a link decodes', () => {
    const fields = reportFilterFields(COLUMNS, []);
    expect(fields.map((f) => f.key)).toEqual([
      'seller',
      'stage',
      'value',
      'age',
      'created',
    ]);
  });

  it('should filter rows on the cell value', () => {
    const fields = reportFilterFields(COLUMNS, ROWS);
    const state: FilterState = {
      seller: { kind: 'multiEnum', values: ['احمد'] },
    };
    expect(applyFilters(fields, state, ROWS).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('should match the empty-value option against rows with no value', () => {
    const fields = reportFilterFields(COLUMNS, ROWS);
    const state: FilterState = { seller: { kind: 'multiEnum', values: [''] } };
    expect(applyFilters(fields, state, ROWS).map((r) => r.id)).toEqual(['d']);
  });
});

describe('formatCell', () => {
  it('should render a money cell per currency and never as one sum', () => {
    const cell = moneyCell({ AFN: 1_000_000, USD: 2_000_000 });
    expect(formatCell('money', cell)).toContain('؋');
    expect(formatCell('money', cell)).toContain('$');
  });

  it('should show an em dash for a missing value rather than zero', () => {
    expect(formatCell('number', numberCell(null))).toBe('—');
    expect(formatCell('money', moneyCell({}))).toBe('—');
    expect(formatCell('percent', percentCell(null))).toBe('—');
  });

  it('should keep an explicit text override', () => {
    expect(formatCell('number', { value: 3, text: 'سه' })).toBe('سه');
  });
});

describe('toCsv', () => {
  it('should export numbers in latin digits so a spreadsheet can add them', () => {
    const csv = toCsv([ROWS[0]], COLUMNS);
    const [, body] = csv.split('\n');
    expect(body).toBe('احمد,جدید,AFN 1.00,4,50,2026-03-01');
  });

  it('should start with a BOM so Excel reads Persian as UTF-8', () => {
    expect(toCsv(ROWS, COLUMNS).charCodeAt(0)).toBe(0xfeff);
  });

  it('should quote a value containing a comma', () => {
    const csv = toCsv(
      [{ id: 'x', cells: { seller: textCell('احمد, زهرا') } }],
      [{ key: 'seller', label: 'فروشنده', kind: 'text' }],
    );
    expect(csv).toContain('"احمد, زهرا"');
  });
});

describe('aggregate helpers', () => {
  it('should keep currencies apart when summing a column', () => {
    expect(sumMoney(ROWS, 'value')).toEqual({ AFN: 4_000_000, USD: 20_000_000 });
  });

  it('should rank a breakdown by row count', () => {
    expect(breakdownRows(ROWS, 'stage')).toEqual([
      { label: 'جدید', count: 3, value: {} },
      { label: 'بسته', count: 1, value: {} },
    ]);
  });

  it('should name the most common value with its count', () => {
    expect(topLabel(ROWS, 'stage')).toBe('جدید (۳)');
  });

  it('should report no dominant value on an empty set', () => {
    expect(topLabel([], 'stage')).toBe('—');
  });
});

describe('breakdownRows on already-aggregated rows', () => {
  const AGG: ReportRow[] = [
    { id: 'a', cells: { seller: textCell('احمد'), leads: numberCell(12) } },
    { id: 'b', cells: { seller: textCell('زهرا'), leads: numberCell(3) } },
  ];

  it('should measure the named column instead of counting one row per group', () => {
    expect(breakdownRows(AGG, 'seller', undefined, 'leads')).toEqual([
      { label: 'احمد', count: 12, value: {} },
      { label: 'زهرا', count: 3, value: {} },
    ]);
  });

  it('should still count rows when no measure is named', () => {
    expect(breakdownRows(AGG, 'seller').map((r) => r.count)).toEqual([1, 1]);
  });
});

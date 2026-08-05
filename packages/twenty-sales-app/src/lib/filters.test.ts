import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  applyFilters,
  buildGraphQLFilter,
  decodeFilterState,
  encodeFilterState,
  type FilterField,
  type FilterState,
} from './filters';

type Row = {
  name: string;
  stage: string | null;
  ownerId: string | null;
  amountMicros: number | null;
  createdAt: string;
  phone: string | null;
};

const FIELDS: FilterField<Row>[] = [
  {
    key: 'stage',
    label: 'مرحله',
    kind: 'multiEnum',
    serverPath: 'stage',
    get: (row) => row.stage,
    options: [
      { value: 'NEW_LEAD', label: 'جدید' },
      { value: 'LOST_MISSED', label: 'از دست رفته' },
    ],
  },
  {
    key: 'owner',
    label: 'مسئول',
    kind: 'multiEnum',
    serverPath: 'ownerId',
    get: (row) => row.ownerId,
    options: [],
  },
  { key: 'q', label: 'نام', kind: 'text', serverPath: 'name', get: (row) => row.name },
  {
    key: 'value',
    label: 'ارزش',
    kind: 'numberRange',
    serverPath: 'amount.amountMicros',
    get: (row) => row.amountMicros,
    scale: 1_000_000,
  },
  {
    key: 'created',
    label: 'ثبت',
    kind: 'dateRange',
    serverPath: 'createdAt',
    get: (row) => row.createdAt,
  },
  {
    key: 'hasPhone',
    label: 'شماره دارد',
    kind: 'boolean',
    get: (row) => row.phone !== null,
    buildServerFilter: (value) =>
      value
        ? { phone: { is: 'NOT_NULL' } }
        : { phone: { is: 'NULL' } },
  },
];

const rows: Row[] = [
  {
    name: 'شرکت نور',
    stage: 'NEW_LEAD',
    ownerId: 'u1',
    amountMicros: 100_000_000,
    createdAt: '2026-03-10T08:00:00.000Z',
    phone: '0700000000',
  },
  {
    name: 'تجارت آریا',
    stage: 'LOST_MISSED',
    ownerId: 'u2',
    amountMicros: 5_000_000,
    createdAt: '2026-01-05T08:00:00.000Z',
    phone: null,
  },
  {
    name: 'نور تجارت',
    stage: null,
    ownerId: null,
    amountMicros: null,
    createdAt: '2026-05-20T08:00:00.000Z',
    phone: '0788888888',
  },
];

describe('buildGraphQLFilter', () => {
  it('returns undefined when no filter is active', () => {
    expect(buildGraphQLFilter(FIELDS, {})).toBeUndefined();
  });

  it('ignores filters whose value is empty', () => {
    const state: FilterState = {
      stage: { kind: 'multiEnum', values: [] },
      q: { kind: 'text', text: '   ' },
      value: { kind: 'numberRange', min: null, max: null },
    };
    expect(buildGraphQLFilter(FIELDS, state)).toBeUndefined();
  });

  it('maps a multi-enum to an `in` clause', () => {
    const state: FilterState = {
      stage: { kind: 'multiEnum', values: ['NEW_LEAD', 'LOST_MISSED'] },
    };
    expect(buildGraphQLFilter(FIELDS, state)).toEqual({
      and: [{ stage: { in: ['NEW_LEAD', 'LOST_MISSED'] } }],
    });
  });

  it('maps text to a wrapped ilike', () => {
    const state: FilterState = { q: { kind: 'text', text: ' نور ' } };
    expect(buildGraphQLFilter(FIELDS, state)).toEqual({
      and: [{ name: { ilike: '%نور%' } }],
    });
  });

  it('nests dotted server paths and scales number ranges', () => {
    const state: FilterState = {
      value: { kind: 'numberRange', min: 10, max: 100 },
    };
    expect(buildGraphQLFilter(FIELDS, state)).toEqual({
      and: [
        { amount: { amountMicros: { gte: 10_000_000, lte: 100_000_000 } } },
      ],
    });
  });

  it('emits only the bound that is set', () => {
    const state: FilterState = {
      value: { kind: 'numberRange', min: null, max: 100 },
    };
    expect(buildGraphQLFilter(FIELDS, state)).toEqual({
      and: [{ amount: { amountMicros: { lte: 100_000_000 } } }],
    });
  });

  it('widens a date range to whole local days', () => {
    const state: FilterState = {
      created: { kind: 'dateRange', from: '2026-03-01', to: '2026-03-31' },
    };
    const built = buildGraphQLFilter(FIELDS, state) as {
      and: { createdAt: { gte: string; lte: string } }[];
    };
    const { gte, lte } = built.and[0].createdAt;
    expect(new Date(gte).getTime()).toBe(new Date(2026, 2, 1, 0, 0, 0, 0).getTime());
    expect(new Date(lte).getTime()).toBe(
      new Date(2026, 2, 31, 23, 59, 59, 999).getTime(),
    );
  });

  it('uses a field-supplied builder for booleans', () => {
    const state: FilterState = { hasPhone: { kind: 'boolean', value: true } };
    expect(buildGraphQLFilter(FIELDS, state)).toEqual({
      and: [{ phone: { is: 'NOT_NULL' } }],
    });
  });

  it('combines every active field under a single `and`', () => {
    const state: FilterState = {
      stage: { kind: 'multiEnum', values: ['NEW_LEAD'] },
      q: { kind: 'text', text: 'نور' },
    };
    const built = buildGraphQLFilter(FIELDS, state) as { and: unknown[] };
    expect(built.and).toHaveLength(2);
  });
});

describe('applyFilters', () => {
  it('is the identity when nothing is active', () => {
    expect(applyFilters(FIELDS, {}, rows)).toEqual(rows);
  });

  it('filters by multi-enum, keeping any listed value', () => {
    const out = applyFilters(
      FIELDS,
      { stage: { kind: 'multiEnum', values: ['NEW_LEAD', 'LOST_MISSED'] } },
      rows,
    );
    expect(out.map((r) => r.name)).toEqual(['شرکت نور', 'تجارت آریا']);
  });

  it('matches empty values through the empty-option sentinel', () => {
    const out = applyFilters(
      FIELDS,
      { stage: { kind: 'multiEnum', values: [''] } },
      rows,
    );
    expect(out.map((r) => r.name)).toEqual(['نور تجارت']);
  });

  it('matches text case- and space-insensitively on a substring', () => {
    const out = applyFilters(FIELDS, { q: { kind: 'text', text: ' نور ' } }, rows);
    expect(out.map((r) => r.name)).toEqual(['شرکت نور', 'نور تجارت']);
  });

  it('filters a number range inclusively and drops null values', () => {
    const out = applyFilters(
      FIELDS,
      { value: { kind: 'numberRange', min: 5, max: 100 } },
      rows,
    );
    expect(out.map((r) => r.name)).toEqual(['شرکت نور', 'تجارت آریا']);
  });

  it('filters a date range across whole days', () => {
    const out = applyFilters(
      FIELDS,
      { created: { kind: 'dateRange', from: '2026-01-01', to: '2026-03-10' } },
      rows,
    );
    expect(out.map((r) => r.name)).toEqual(['شرکت نور', 'تجارت آریا']);
  });

  it('filters booleans', () => {
    const out = applyFilters(
      FIELDS,
      { hasPhone: { kind: 'boolean', value: false } },
      rows,
    );
    expect(out.map((r) => r.name)).toEqual(['تجارت آریا']);
  });

  it('ands multiple active fields together', () => {
    const out = applyFilters(
      FIELDS,
      {
        q: { kind: 'text', text: 'نور' },
        hasPhone: { kind: 'boolean', value: true },
        stage: { kind: 'multiEnum', values: ['NEW_LEAD'] },
      },
      rows,
    );
    expect(out.map((r) => r.name)).toEqual(['شرکت نور']);
  });

  it('ignores state entries for fields the screen does not declare', () => {
    const out = applyFilters(FIELDS, { unknown: { kind: 'text', text: 'x' } }, rows);
    expect(out).toEqual(rows);
  });
});

describe('activeFilterCount', () => {
  it('counts only fields with a usable value', () => {
    const state: FilterState = {
      stage: { kind: 'multiEnum', values: ['NEW_LEAD'] },
      owner: { kind: 'multiEnum', values: [] },
      q: { kind: 'text', text: '' },
      value: { kind: 'numberRange', min: null, max: 3 },
      hasPhone: { kind: 'boolean', value: false },
    };
    expect(activeFilterCount(FIELDS, state)).toBe(3);
  });
});

describe('url round trip', () => {
  it('restores every filter kind', () => {
    const state: FilterState = {
      stage: { kind: 'multiEnum', values: ['NEW_LEAD', 'LOST_MISSED'] },
      q: { kind: 'text', text: 'نور تجارت' },
      value: { kind: 'numberRange', min: 10, max: null },
      created: { kind: 'dateRange', from: '2026-03-01', to: '2026-03-31' },
      hasPhone: { kind: 'boolean', value: false },
    };
    expect(decodeFilterState(FIELDS, encodeFilterState(FIELDS, state))).toEqual(state);
  });

  it('encodes an empty state as an empty string', () => {
    expect(encodeFilterState(FIELDS, {})).toBe('');
    expect(decodeFilterState(FIELDS, '')).toEqual({});
  });

  it('drops inactive filters from the query', () => {
    const query = encodeFilterState(FIELDS, {
      stage: { kind: 'multiEnum', values: [] },
      q: { kind: 'text', text: 'x' },
    });
    expect(query).toBe('q=x');
  });

  it('ignores unknown or malformed query keys', () => {
    expect(decodeFilterState(FIELDS, 'bogus=1&value=notanumber')).toEqual({});
  });

  it('tolerates a leading question mark', () => {
    expect(decodeFilterState(FIELDS, '?q=x')).toEqual({
      q: { kind: 'text', text: 'x' },
    });
  });
});

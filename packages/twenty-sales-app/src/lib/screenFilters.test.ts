import { describe, expect, it } from 'vitest';

import { buildGraphQLFilter, type FilterState } from './filters';
import {
  contactFilterFields,
  distinctOptions,
  effectiveOpenOnly,
  fileFilterFields,
  leadFilterFields,
  memberOptions,
} from './screenFilters';

const members = [
  {
    id: 'u1',
    name: { firstName: 'رشید', lastName: 'احمدی' },
    userEmail: null,
  },
];

const leadFields = () => leadFilterFields(members, []);

describe('leadFilterFields', () => {
  it('sends a plain `in` when no empty-value option is picked', () => {
    const state: FilterState = {
      owner: { kind: 'multiEnum', values: ['u1'] },
    };
    expect(buildGraphQLFilter(leadFields(), state)).toEqual({
      and: [{ ownerId: { in: ['u1'] } }],
    });
  });

  // A NULL column matches no `in` list, so "no owner" has to become an
  // explicit NULL check or the filter silently returns nothing.
  it('turns a lone "no value" pick into a NULL check', () => {
    const state: FilterState = {
      owner: { kind: 'multiEnum', values: [''] },
    };
    expect(buildGraphQLFilter(leadFields(), state)).toEqual({
      and: [{ ownerId: { is: 'NULL' } }],
    });
  });

  it('ORs the NULL check alongside the picked values', () => {
    const state: FilterState = {
      owner: { kind: 'multiEnum', values: ['u1', ''] },
    };
    expect(buildGraphQLFilter(leadFields(), state)).toEqual({
      and: [{ or: [{ ownerId: { in: ['u1'] } }, { ownerId: { is: 'NULL' } }] }],
    });
  });

  it('scales a value range from afghanis to micros', () => {
    const state: FilterState = {
      value: { kind: 'numberRange', min: 50_000, max: null },
    };
    expect(buildGraphQLFilter(leadFields(), state)).toEqual({
      and: [{ amount: { amountMicros: { gte: 50_000_000_000 } } }],
    });
  });

  it('maps "has contact" to a presence check on the relation', () => {
    expect(
      buildGraphQLFilter(leadFields(), {
        hasContact: { kind: 'boolean', value: true },
      }),
    ).toEqual({ and: [{ pointOfContactId: { is: 'NOT_NULL' } }] });

    expect(
      buildGraphQLFilter(leadFields(), {
        hasContact: { kind: 'boolean', value: false },
      }),
    ).toEqual({ and: [{ pointOfContactId: { is: 'NULL' } }] });
  });
});

describe('contactFilterFields', () => {
  const fields = contactFilterFields([{ id: 'c1', name: 'شرکت نور' }]);

  // Twenty writes a cleared TEXT field as '' rather than NULL, so a presence
  // check on a phone is an emptiness test, not a NULL test.
  it('treats an empty phone string as "no phone"', () => {
    expect(
      buildGraphQLFilter(fields, { hasPhone: { kind: 'boolean', value: true } }),
    ).toEqual({ and: [{ phones: { primaryPhoneNumber: { neq: '' } } }] });

    expect(
      buildGraphQLFilter(fields, { hasPhone: { kind: 'boolean', value: false } }),
    ).toEqual({ and: [{ phones: { primaryPhoneNumber: { eq: '' } } }] });
  });

  it('filters job title as a substring', () => {
    expect(
      buildGraphQLFilter(fields, { job: { kind: 'text', text: 'مدیر' } }),
    ).toEqual({ and: [{ jobTitle: { ilike: '%مدیر%' } }] });
  });
});

describe('distinctOptions', () => {
  const rows = [
    { brand: 'الف' },
    { brand: 'ب' },
    { brand: 'الف' },
    { brand: '  ' },
    { brand: null },
  ];

  it('dedupes, sorts, and folds blank values into one bucket', () => {
    expect(distinctOptions(rows, (row) => row.brand, 'بدون برند')).toEqual([
      { value: 'الف', label: 'الف' },
      { value: 'ب', label: 'ب' },
      { value: '', label: 'بدون برند' },
    ]);
  });

  it('omits the blank bucket when every row has a value', () => {
    expect(
      distinctOptions([{ brand: 'الف' }], (row) => row.brand, 'بدون برند'),
    ).toEqual([{ value: 'الف', label: 'الف' }]);
  });
});

describe('memberOptions', () => {
  it('labels a member with their full name', () => {
    expect(memberOptions(members)).toEqual([
      { value: 'u1', label: 'رشید احمدی' },
    ]);
  });
});

describe('effectiveOpenOnly', () => {
  it('keeps the open-pipeline toggle when no stage filter is set', () => {
    expect(effectiveOpenOnly(true, {})).toBe(true);
    expect(effectiveOpenOnly(false, {})).toBe(false);
  });

  it('ignores a stage filter that is open but empty', () => {
    expect(
      effectiveOpenOnly(true, { stage: { kind: 'multiEnum', values: [] } }),
    ).toBe(true);
  });

  // The regression: `stage IN (open stages) AND stage IN (LOST_MISSED)` matches
  // nothing, so lost leads were unreachable from the leads screen.
  it('lets an explicit closed-stage filter override the toggle', () => {
    expect(
      effectiveOpenOnly(true, {
        stage: { kind: 'multiEnum', values: ['LOST_MISSED'] },
      }),
    ).toBe(false);
    expect(
      effectiveOpenOnly(true, {
        stage: { kind: 'multiEnum', values: ['ACTIVE_CUSTOMER'] },
      }),
    ).toBe(false);
  });

  it('also stands down for an open-stage filter, which the toggle would only duplicate', () => {
    expect(
      effectiveOpenOnly(true, {
        stage: { kind: 'multiEnum', values: ['NEW_LEAD'] },
      }),
    ).toBe(false);
  });

  it('is unaffected by filters on other fields', () => {
    expect(
      effectiveOpenOnly(true, { temp: { kind: 'multiEnum', values: ['HOT'] } }),
    ).toBe(true);
  });
});

describe('fileFilterFields', () => {
  it('offers the type filter only once attachment.fileType is provisioned', () => {
    expect(fileFilterFields({ hasFileType: true }).map((f) => f.key)).toContain(
      'type',
    );
    expect(
      fileFilterFields({ hasFileType: false }).map((f) => f.key),
    ).not.toContain('type');
  });

  it('filters by type on the server, with "no type" as a null check', () => {
    const fields = fileFilterFields({ hasFileType: true });
    const state: FilterState = {
      type: { kind: 'multiEnum', values: ['CALL_RECORDING', ''] },
    };
    expect(buildGraphQLFilter(fields, state)).toEqual({
      and: [
        {
          or: [
            { fileType: { in: ['CALL_RECORDING'] } },
            { fileType: { is: 'NULL' } },
          ],
        },
      ],
    });
  });

  it('matches a media kind against the jsonb text of the file composite', () => {
    // FILES fields only accept RawJsonFilter (is/like) and Postgres prints
    // jsonb as `"extension": ".pdf"`; the API path stores the dot, the QR
    // upload path does not, and only `like` (case-sensitive) is available.
    const fields = fileFilterFields({ hasFileType: false });
    const state: FilterState = { kind: { kind: 'multiEnum', values: ['pdf'] } };
    expect(buildGraphQLFilter(fields, state)).toEqual({
      and: [
        {
          or: [
            { file: { like: '%"extension": ".pdf"%' } },
            { file: { like: '%"extension": "pdf"%' } },
            { file: { like: '%"extension": ".PDF"%' } },
            { file: { like: '%"extension": "PDF"%' } },
          ],
        },
      ],
    });
  });

  it('searches the name and bounds the upload date', () => {
    const fields = fileFilterFields({ hasFileType: false });
    const state: FilterState = {
      name: { kind: 'text', text: 'call' },
      date: { kind: 'dateRange', from: '2026-09-01', to: null },
    };
    const filter = buildGraphQLFilter(fields, state) as { and: unknown[] };
    expect(filter.and[0]).toEqual({ name: { ilike: '%call%' } });
    expect(filter.and[1]).toMatchObject({ createdAt: { gte: expect.any(String) } });
  });
});

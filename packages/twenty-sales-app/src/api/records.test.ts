import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { coreQuery } from './client';
import {
  fetchAllLeads,
  fetchLead,
  fetchProducts,
  softDeleteLead,
  softDeleteNote,
} from './records';

const mockedCoreQuery = vi.mocked(coreQuery);

const leadPage = (
  count: number,
  hasNextPage: boolean,
  endCursor: string | null,
) => ({
  opportunities: {
    edges: Array.from({ length: count }, (_, i) => ({
      node: { id: `${endCursor ?? 'last'}-${i}` },
    })),
    pageInfo: { hasNextPage, endCursor },
  },
});

// The deal-line product picker groups by category and shows the brand. On an
// instance that hasn't run provision-product-brand-category.mjs yet those
// fields don't exist, and one unknown field fails the whole document -- which
// would take the picker (and the pricing panel around it) down.
describe('fetchProducts taxonomy tolerance', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('selects brand and category', async () => {
    mockedCoreQuery.mockResolvedValue({ products: { edges: [] } });

    await fetchProducts();

    const [query] = mockedCoreQuery.mock.calls[0];
    expect(query).toContain('brand');
    expect(query).toContain('category');
  });

  it('retries without them and nulls them when the instance lacks the fields', async () => {
    mockedCoreQuery
      .mockRejectedValueOnce(new Error('Cannot query field "category" on type "Product".'))
      .mockResolvedValueOnce({
        products: { edges: [{ node: { id: 'p1', name: 'HMIS' } }] },
      });

    const products = await fetchProducts();

    expect(mockedCoreQuery).toHaveBeenCalledTimes(2);
    expect(mockedCoreQuery.mock.calls[1][0]).not.toContain('category');
    expect(products[0]).toMatchObject({ id: 'p1', brand: null, category: null });
  });

  it('does not swallow unrelated errors', async () => {
    mockedCoreQuery.mockRejectedValue(new Error('Network request failed'));

    await expect(fetchProducts()).rejects.toThrow('Network request failed');
    expect(mockedCoreQuery).toHaveBeenCalledTimes(1);
  });
});

// The reports used to ask for `first: 300` and present the result as the whole
// pipeline. Anything that aggregates now walks the connection cursor.
describe('fetchAllLeads pagination', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('follows the cursor until the server says there is no next page', async () => {
    mockedCoreQuery
      .mockResolvedValueOnce(leadPage(200, true, 'cursor-1'))
      .mockResolvedValueOnce(leadPage(200, true, 'cursor-2'))
      .mockResolvedValueOnce(leadPage(37, false, null));

    const result = await fetchAllLeads({});

    expect(result.items).toHaveLength(437);
    expect(result.truncated).toBe(false);
    expect(mockedCoreQuery).toHaveBeenCalledTimes(3);
    expect(mockedCoreQuery.mock.calls[0][1]).toMatchObject({ after: null });
    expect(mockedCoreQuery.mock.calls[1][1]).toMatchObject({ after: 'cursor-1' });
    expect(mockedCoreQuery.mock.calls[2][1]).toMatchObject({ after: 'cursor-2' });
  });

  it('stops at a single page when there is nothing more', async () => {
    mockedCoreQuery.mockResolvedValueOnce(leadPage(12, false, null));

    const result = await fetchAllLeads({});

    expect(result.items).toHaveLength(12);
    expect(result.truncated).toBe(false);
    expect(mockedCoreQuery).toHaveBeenCalledTimes(1);
  });

  // A silent cap reads exactly like complete data, which is the failure being
  // fixed -- so hitting the safety cap is reported instead.
  it('reports truncation rather than silently capping', async () => {
    mockedCoreQuery.mockResolvedValue(leadPage(200, true, 'cursor-n'));

    const result = await fetchAllLeads({});

    expect(result.truncated).toBe(true);
    expect(mockedCoreQuery).toHaveBeenCalledTimes(50);
  });

  it('bounds the period server-side when the caller passes one', async () => {
    mockedCoreQuery.mockResolvedValueOnce(leadPage(1, false, null));

    await fetchAllLeads({ createdAfter: '2026-07-01T00:00:00.000Z' });

    expect(mockedCoreQuery.mock.calls[0][1]).toMatchObject({
      filter: { and: [{ createdAt: { gte: '2026-07-01T00:00:00.000Z' } }] },
    });
  });
});

describe('soft delete', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
    mockedCoreQuery.mockResolvedValue({});
  });

  it('records the reason before deleting the lead', async () => {
    await softDeleteLead({ id: 'lead-1', companyId: 'co-1' }, '  اشتباه ثبت شده  ');

    const [reasonQuery, reasonVars] = mockedCoreQuery.mock.calls[0];
    expect(reasonQuery).toContain('updateOpportunity');
    expect(reasonVars).toMatchObject({
      id: 'lead-1',
      data: { deletionReason: 'اشتباه ثبت شده' },
    });

    const [deleteQuery] = mockedCoreQuery.mock.calls.at(-1) ?? [];
    expect(deleteQuery).toContain('deleteOpportunity');
  });

  // An instance that hasn't run provision-deletion-reason.mjs must still be
  // able to delete, with the reason filed somewhere that survives.
  it('falls back to a note when the instance has no deletionReason field', async () => {
    mockedCoreQuery
      .mockRejectedValueOnce(
        new Error('Field "deletionReason" is not defined by type "OpportunityUpdateInput".'),
      )
      .mockResolvedValue({ createNote: { id: 'note-1' } });

    await softDeleteLead({ id: 'lead-1', companyId: 'co-1' }, 'تکراری بود');

    const queries = mockedCoreQuery.mock.calls.map(([query]) => query as string);
    expect(queries.some((q) => q.includes('createNote'))).toBe(true);
    expect(queries.at(-1)).toContain('deleteOpportunity');
  });

  it('still deletes when the reason cannot be filed at all', async () => {
    mockedCoreQuery.mockRejectedValueOnce(new Error('no such field'));
    mockedCoreQuery.mockRejectedValueOnce(new Error('cannot create note'));
    mockedCoreQuery.mockResolvedValue({});

    await expect(
      softDeleteLead({ id: 'lead-1' }, 'دلیل'),
    ).resolves.toBeUndefined();

    expect(mockedCoreQuery.mock.calls.at(-1)?.[0]).toContain('deleteOpportunity');
  });

  it('uses the soft delete mutation for notes too', async () => {
    await softDeleteNote('note-1', 'اشتباه');

    expect(mockedCoreQuery.mock.calls.at(-1)?.[0]).toContain('deleteNote');
  });
});

// "Everything is soft deleted, no hard delete at all" is a property of the
// whole API layer, not of one call site — so it is asserted over the source.
describe('no hard delete anywhere in the API layer', () => {
  it('contains no destroy mutation', () => {
    const apiDir = join(import.meta.dirname, '.');
    const offenders = readdirSync(apiDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .filter((file) =>
        /destroy[A-Z]/.test(readFileSync(join(apiDir, file), 'utf8')),
      );

    expect(offenders).toEqual([]);
  });
});

// agreedPrice/agreedAt/stageChangedAt only exist once
// provision-subscriptions-referrals-offers.mjs has run. One unknown field
// fails the whole document, so an unprovisioned instance must lose the values,
// not the lead screen.
describe('fetchLead optional-field tolerance', () => {
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('asks for the agreed price and the stage timestamp', async () => {
    mockedCoreQuery.mockResolvedValue({ opportunity: { id: 'l1' } });

    await fetchLead('l1');

    const [query] = mockedCoreQuery.mock.calls[0];
    expect(query).toContain('agreedPrice');
    expect(query).toContain('agreedAt');
    expect(query).toContain('stageChangedAt');
  });

  it('drops only the rejected group and still returns the lead', async () => {
    mockedCoreQuery
      .mockRejectedValueOnce(
        new Error('Cannot query field "agreedPrice" on type "Opportunity".'),
      )
      .mockResolvedValueOnce({ opportunity: { id: 'l1', name: 'Nour' } });

    const lead = await fetchLead('l1');

    expect(lead).toEqual({ id: 'l1', name: 'Nour' });
    const [retryQuery] = mockedCoreQuery.mock.calls[1];
    expect(retryQuery).not.toContain('agreedPrice');
    // A different script provisions stageChangedAt, so it survives.
    expect(retryQuery).toContain('stageChangedAt');
  });

  it('gives up on a failure that is not a missing field', async () => {
    mockedCoreQuery.mockRejectedValue(new Error('Network request failed'));

    await expect(fetchLead('l1')).rejects.toThrow('Network request failed');
  });
});

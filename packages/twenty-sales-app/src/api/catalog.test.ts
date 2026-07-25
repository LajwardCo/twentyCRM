import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { coreQuery } from './client';
import { fetchCatalogProducts, saveCatalogProduct } from './catalog';

const mockedCoreQuery = vi.mocked(coreQuery);

describe('catalog product brand/category', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchCatalogProducts selects brand and category', async () => {
    mockedCoreQuery.mockResolvedValue({ products: { edges: [] } });

    await fetchCatalogProducts();

    const [query] = mockedCoreQuery.mock.calls[0];
    expect(query).toContain('brand');
    expect(query).toContain('category');
  });

  it('saveCatalogProduct sends trimmed brand and category', async () => {
    mockedCoreQuery.mockResolvedValue({ createProduct: { id: 'p1' } });

    await saveCatalogProduct({ name: 'HMIS', brand: '  Hamagan  ', category: ' Healthcare ' });

    const [, variables] = mockedCoreQuery.mock.calls[0];
    expect((variables as { data: Record<string, unknown> }).data).toMatchObject({
      brand: 'Hamagan',
      category: 'Healthcare',
    });
  });

  it('saveCatalogProduct sends null for blank brand and category', async () => {
    mockedCoreQuery.mockResolvedValue({ updateProduct: { id: 'p1' } });

    await saveCatalogProduct({ name: 'HMIS', brand: '   ', category: '' }, 'p1');

    const [, variables] = mockedCoreQuery.mock.calls[0];
    expect((variables as { data: Record<string, unknown> }).data).toMatchObject({
      brand: null,
      category: null,
    });
  });
});

// An instance that hasn't run provision-product-brand-category.mjs yet doesn't
// know these fields, and GraphQL rejects the whole document over one unknown
// field -- so the catalog has to degrade instead of going blank.
describe('catalog on an instance without the taxonomy fields', () => {
  // mockReset, not clearAllMocks: these cases queue per-call behaviour with
  // mock*Once and a leftover queue would bleed into the next test.
  beforeEach(() => {
    mockedCoreQuery.mockReset();
  });

  it('fetchCatalogProducts retries without brand/category and nulls them', async () => {
    mockedCoreQuery
      .mockRejectedValueOnce(new Error('Cannot query field "brand" on type "Product".'))
      .mockResolvedValueOnce({
        products: { edges: [{ node: { id: 'p1', name: 'HMIS' } }] },
      });

    const products = await fetchCatalogProducts();

    expect(mockedCoreQuery).toHaveBeenCalledTimes(2);
    expect(mockedCoreQuery.mock.calls[1][0]).not.toContain('brand');
    expect(products).toEqual([{ id: 'p1', name: 'HMIS', brand: null, category: null }]);
  });

  it('saveCatalogProduct retries the mutation without brand/category', async () => {
    mockedCoreQuery
      .mockRejectedValueOnce(
        new Error('Field "brand" is not defined by type "ProductCreateInput".'),
      )
      .mockResolvedValueOnce({ createProduct: { id: 'p1' } });

    const id = await saveCatalogProduct({ name: 'HMIS', brand: 'Hamagan', category: 'Health' });

    expect(id).toBe('p1');
    const [, variables] = mockedCoreQuery.mock.calls[1];
    const payload = (variables as { data: Record<string, unknown> }).data;
    expect(payload).not.toHaveProperty('brand');
    expect(payload).not.toHaveProperty('category');
    expect(payload).toMatchObject({ name: 'HMIS' });
  });

  it('does not swallow unrelated errors', async () => {
    mockedCoreQuery.mockRejectedValue(new Error('Network request failed'));

    await expect(fetchCatalogProducts()).rejects.toThrow('Network request failed');
    expect(mockedCoreQuery).toHaveBeenCalledTimes(1);
  });
});

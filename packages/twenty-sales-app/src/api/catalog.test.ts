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

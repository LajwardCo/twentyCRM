import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({
  coreQuery: vi.fn(),
  metadataQuery: vi.fn(),
}));

import { coreQuery } from './client';
import { fetchProducts } from './records';

const mockedCoreQuery = vi.mocked(coreQuery);

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

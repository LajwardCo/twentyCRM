import { describe, expect, it } from 'vitest';

import { collectTaxonomyValues, groupProductsByCategory } from './taxonomy';

describe('collectTaxonomyValues', () => {
  it('returns the distinct sorted values in use', () => {
    const values = collectTaxonomyValues(
      [
        { brand: 'Hamagan', category: 'Health' },
        { brand: 'Hamagan', category: 'Education' },
        { brand: 'Lajward', category: 'Health' },
      ],
      'brand',
    );

    expect(values).toEqual(['Hamagan', 'Lajward']);
  });

  it('drops null, empty and whitespace-only values', () => {
    const values = collectTaxonomyValues(
      [
        { brand: null, category: 'Health' },
        { brand: '', category: '' },
        { brand: '   ', category: '   ' },
        { brand: 'Hamagan', category: 'Health' },
      ],
      'category',
    );

    expect(values).toEqual(['Health']);
  });

  it('returns an empty list when there are no products yet', () => {
    expect(collectTaxonomyValues(null, 'brand')).toEqual([]);
  });
});

describe('groupProductsByCategory', () => {
  it('groups products under their category, sorted by category name', () => {
    const groups = groupProductsByCategory([
      { id: '1', category: 'Health' },
      { id: '2', category: 'Education' },
      { id: '3', category: 'Health' },
    ]);

    expect(groups).toEqual([
      { category: 'Education', products: [{ id: '2', category: 'Education' }] },
      {
        category: 'Health',
        products: [
          { id: '1', category: 'Health' },
          { id: '3', category: 'Health' },
        ],
      },
    ]);
  });

  it('puts uncategorized products in a trailing group with a null category', () => {
    const groups = groupProductsByCategory([
      { id: '1', category: null },
      { id: '2', category: 'Health' },
      { id: '3', category: '  ' },
    ]);

    expect(groups.map((g) => g.category)).toEqual(['Health', null]);
    expect(groups[1].products.map((p) => p.id)).toEqual(['1', '3']);
  });

  it('returns a single null group when nothing is categorized', () => {
    const groups = groupProductsByCategory([{ id: '1', category: null }]);

    expect(groups).toEqual([{ category: null, products: [{ id: '1', category: null }] }]);
  });
});

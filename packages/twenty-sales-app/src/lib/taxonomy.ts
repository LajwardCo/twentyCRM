// Product catalog taxonomy helpers. brand and category are free-text fields on
// the Product object (see tools/sales-crm/provision-product-brand-category.mjs)
// -- these turn the values actually in use into suggestions, filters and picker
// groups, so the taxonomy stays consistent without a fixed SELECT.

const isFilled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim() !== '';

export const collectTaxonomyValues = (
  products: { brand: string | null; category: string | null }[] | null | undefined,
  key: 'brand' | 'category',
): string[] =>
  [...new Set((products ?? []).map((p) => p[key]).filter(isFilled))].sort((a, b) =>
    a.localeCompare(b, 'fa'),
  );

// Uncategorized products come last under a null category so the caller can
// label that group however it wants.
export const groupProductsByCategory = <TProduct extends { category: string | null }>(
  products: TProduct[],
): { category: string | null; products: TProduct[] }[] => {
  const byCategory = new Map<string, TProduct[]>();
  const uncategorized: TProduct[] = [];

  for (const product of products) {
    if (!isFilled(product.category)) {
      uncategorized.push(product);
      continue;
    }
    const existing = byCategory.get(product.category);
    if (existing) existing.push(product);
    else byCategory.set(product.category, [product]);
  }

  const groups = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'fa'))
    .map(([category, grouped]) => ({ category: category as string | null, products: grouped }));

  return uncategorized.length > 0
    ? [...groups, { category: null, products: uncategorized }]
    : groups;
};

import { fetchCatalogProducts } from '../api/catalog';
import { useCached } from '../lib/cache';
import { T4 } from '../lib/strings';
import { collectTaxonomyValues } from '../lib/taxonomy';

// Brand + category inputs, shared by the products-tab editor and the product
// detail editor. Both are free text on purpose (see
// tools/sales-crm/provision-product-brand-category.mjs) -- consistency comes
// from suggesting the values the catalog already uses rather than from a fixed
// SELECT the catalog manager can't extend. Reads the products list from the
// same cache key the catalog views use, so this costs no extra request.

type Props = {
  brand: string | null | undefined;
  category: string | null | undefined;
  onChange: (patch: { brand?: string; category?: string }) => void;
};

export const ProductTaxonomyFields = ({ brand, category, onChange }: Props) => {
  const { data: products } = useCached('catalog:products', fetchCatalogProducts);
  const brands = collectTaxonomyValues(products, 'brand');
  const categories = collectTaxonomyValues(products, 'category');

  return (
    <div className="f2">
      <div className="fld">
        <label>{T4.brandLbl}</label>
        <input
          list="product-brand-options"
          placeholder={T4.brandPlaceholder}
          value={brand ?? ''}
          onChange={(e) => onChange({ brand: e.target.value })}
        />
        <datalist id="product-brand-options">
          {brands.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </div>
      <div className="fld">
        <label>{T4.categoryLbl}</label>
        <input
          list="product-category-options"
          placeholder={T4.categoryPlaceholder}
          value={category ?? ''}
          onChange={(e) => onChange({ category: e.target.value })}
        />
        <datalist id="product-category-options">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
    </div>
  );
};

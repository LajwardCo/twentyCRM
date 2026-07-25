// Product / Package / Pricing Version / Discount Rule catalog management.
// Same coreQuery + create<Singular>/update<Singular> mutation pattern as
// admin.ts (saveCompetitor) and records.ts (addProductToLead) -- see
// docs/superpowers/specs/2026-07-09-sales-app-catalog-management-design.md.
import { coreQuery } from './client';

type CurrencyAmount = { amountMicros: number | null; currencyCode: string | null } | null;

// ---------- product ----------

// A single pricing metric for a PER_FACTOR product: a per-unit fee billed at a
// chosen cadence. billingFrequency is optional for backward compatibility --
// legacy rows without it are treated as MONTHLY by the server.
export type PricingFactor = {
  name: string;
  unitPrice: number;
  billingFrequency?: 'MONTHLY' | 'HOURLY' | 'ANNUAL';
};

export type CatalogProduct = {
  id: string;
  name: string;
  // Free-text catalog taxonomy: brand is the vendor/product line, category the
  // grouping. Deliberately not SELECTs -- each workspace defines its own
  // taxonomy, and the editor suggests existing values instead (same reasoning
  // as discountRule.conditionMetric).
  brand: string | null;
  category: string | null;
  baseInstallPrice: CurrencyAmount;
  baseAnnualPrice: CurrencyAmount;
  maxDiscountPercent: number | null;
  pricingModel: string | null;
  pricingFactors: PricingFactor[] | null;
  pricingFactorNotes: string | null;
  isSellable: boolean | null;
  createdAt: string;
};

const PRODUCT_FIELDS_BASE = `
  id name maxDiscountPercent pricingModel pricingFactors pricingFactorNotes isSellable createdAt
  baseInstallPrice { amountMicros currencyCode }
  baseAnnualPrice { amountMicros currencyCode }
`;

const PRODUCT_FIELDS = `brand category ${PRODUCT_FIELDS_BASE}`;

// An instance where provision-product-brand-category.mjs hasn't run yet doesn't
// know brand/category, and GraphQL rejects the whole document over one unknown
// field -- which would blank the catalog rather than just hide two values. So
// every product call requests them, and falls back once on that exact error.
// Same pattern as admin.ts's `link` fallback; see the sales-app schema-skew
// note. Drop the fallback once every instance has run the script.
const isMissingTaxonomyFieldError = (error: unknown): boolean =>
  error instanceof Error &&
  /(Cannot query field|is not defined by type).*"(brand|category)"|"(brand|category)".*(is not defined by type)/i.test(
    error.message,
  );

const withNullTaxonomy = (products: CatalogProduct[]): CatalogProduct[] =>
  products.map((product) => ({
    ...product,
    brand: product.brand ?? null,
    category: product.category ?? null,
  }));

export const fetchCatalogProducts = async (): Promise<CatalogProduct[]> => {
  const run = async (fields: string) => {
    const data = await coreQuery<{ products: { edges: { node: CatalogProduct }[] } }>(
      `query CatalogProducts {
        products(first: 200, orderBy: [{ name: AscNullsLast }]) {
          edges { node { ${fields} } }
        }
      }`,
    );
    return withNullTaxonomy(data.products.edges.map((e) => e.node));
  };

  try {
    return await run(PRODUCT_FIELDS);
  } catch (error) {
    if (!isMissingTaxonomyFieldError(error)) throw error;
    return run(PRODUCT_FIELDS_BASE);
  }
};

export const fetchProductById = async (id: string): Promise<CatalogProduct | undefined> => {
  const run = async (fields: string) => {
    const data = await coreQuery<{ products: { edges: { node: CatalogProduct }[] } }>(
      `query CatalogProductById($id: UUID!) {
        products(filter: { id: { eq: $id } }, first: 1) {
          edges { node { ${fields} } }
        }
      }`,
      { id },
    );
    return withNullTaxonomy(data.products.edges.map((e) => e.node))[0];
  };

  try {
    return await run(PRODUCT_FIELDS);
  } catch (error) {
    if (!isMissingTaxonomyFieldError(error)) throw error;
    return run(PRODUCT_FIELDS_BASE);
  }
};

export type ProductCurrencyCode = 'AFN' | 'USD';

export type CatalogProductInput = {
  name: string;
  brand?: string | null;
  category?: string | null;
  currencyCode?: ProductCurrencyCode | null;
  baseInstallPriceAmount?: number | null;
  baseAnnualPriceAmount?: number | null;
  maxDiscountPercent?: number | null;
  pricingModel?: string | null;
  pricingFactors?: PricingFactor[] | null;
  pricingFactorNotes?: string | null;
  isSellable?: boolean | null;
};

const toAmount = (
  amount: number | null | undefined,
  currencyCode: string = 'AFN',
): { amountMicros: number; currencyCode: string } | null =>
  amount || amount === 0
    ? { amountMicros: Math.round(amount * 1_000_000), currencyCode }
    : null;

const trimToNull = (value: string | null | undefined): string | null =>
  value && value.trim() !== '' ? value.trim() : null;

// Drop empty metric rows and normalize numeric/frequency fields before saving.
const cleanPricingFactors = (
  factors: PricingFactor[] | null | undefined,
): PricingFactor[] | null => {
  if (!factors) return null;
  const cleaned = factors
    .filter((f) => f.name.trim() !== '')
    .map((f) => ({
      name: f.name.trim(),
      unitPrice: Number(f.unitPrice) || 0,
      billingFrequency: f.billingFrequency ?? 'MONTHLY',
    }));
  return cleaned.length > 0 ? cleaned : null;
};

export const saveCatalogProduct = async (
  input: CatalogProductInput,
  id?: string,
): Promise<string> => {
  const currencyCode = input.currencyCode ?? 'AFN';
  const payload: Record<string, unknown> = {
    name: input.name,
    brand: trimToNull(input.brand),
    category: trimToNull(input.category),
    baseInstallPrice: toAmount(input.baseInstallPriceAmount, currencyCode),
    baseAnnualPrice: toAmount(input.baseAnnualPriceAmount, currencyCode),
    maxDiscountPercent: input.maxDiscountPercent ?? null,
    pricingModel: input.pricingModel || null,
    pricingFactors:
      input.pricingModel === 'PER_FACTOR'
        ? cleanPricingFactors(input.pricingFactors)
        : null,
    pricingFactorNotes: input.pricingFactorNotes || null,
    isSellable: input.isSellable ?? true,
  };
  const run = async (data: Record<string, unknown>) => {
    if (id) {
      const updated = await coreQuery<{ updateProduct: { id: string } }>(
        `mutation UpdateCatalogProduct($id: UUID!, $data: ProductUpdateInput!) {
          updateProduct(id: $id, data: $data) { id }
        }`,
        { id, data },
      );
      return updated.updateProduct.id;
    }
    const created = await coreQuery<{ createProduct: { id: string } }>(
      `mutation CreateCatalogProduct($data: ProductCreateInput!) {
        createProduct(data: $data) { id }
      }`,
      { data },
    );
    return created.createProduct.id;
  };

  try {
    return await run(payload);
  } catch (error) {
    if (!isMissingTaxonomyFieldError(error)) throw error;
    // Save the rest rather than lose the edit; the taxonomy sticks once the
    // provisioning script has run on this instance.
    const { brand: _brand, category: _category, ...withoutTaxonomy } = payload;
    return run(withoutTaxonomy);
  }
};

// ---------- package ----------

export type CatalogPackage = {
  id: string;
  name: string;
  status: string | null;
  allowsCustomPricing: boolean | null;
  notes: string | null;
  productId: string | null;
  createdAt: string;
};

const PACKAGE_FIELDS = `id name status allowsCustomPricing notes productId createdAt`;

export const fetchPackagesForProduct = async (
  productId: string,
): Promise<CatalogPackage[]> => {
  const data = await coreQuery<{ packages: { edges: { node: CatalogPackage }[] } }>(
    `query PackagesForProduct($productId: UUID!) {
      packages(filter: { productId: { eq: $productId } }, first: 100, orderBy: [{ name: AscNullsLast }]) {
        edges { node { ${PACKAGE_FIELDS} } }
      }
    }`,
    { productId },
  );
  return data.packages.edges.map((e) => e.node);
};

export const fetchPackageById = async (id: string): Promise<CatalogPackage | undefined> => {
  const data = await coreQuery<{ packages: { edges: { node: CatalogPackage }[] } }>(
    `query PackageById($id: UUID!) {
      packages(filter: { id: { eq: $id } }, first: 1) {
        edges { node { ${PACKAGE_FIELDS} } }
      }
    }`,
    { id },
  );
  return data.packages.edges[0]?.node;
};

export type CatalogPackageInput = {
  name: string;
  productId: string;
  status?: string | null;
  allowsCustomPricing?: boolean | null;
  notes?: string | null;
};

export const savePackage = async (
  input: CatalogPackageInput,
  id?: string,
): Promise<string> => {
  const payload: Record<string, unknown> = {
    name: input.name,
    productId: input.productId,
    status: input.status || 'ACTIVE',
    allowsCustomPricing: input.allowsCustomPricing ?? false,
    notes: input.notes || null,
  };
  if (id) {
    const data = await coreQuery<{ updatePackage: { id: string } }>(
      `mutation UpdatePackage($id: UUID!, $data: PackageUpdateInput!) {
        updatePackage(id: $id, data: $data) { id }
      }`,
      { id, data: payload },
    );
    return data.updatePackage.id;
  }
  const data = await coreQuery<{ createPackage: { id: string } }>(
    `mutation CreatePackage($data: PackageCreateInput!) {
      createPackage(data: $data) { id }
    }`,
    { data: payload },
  );
  return data.createPackage.id;
};

// ---------- pricing version ----------

export type TierBand = {
  minQty: number;
  maxQty: number | null;
  mode: 'FLAT' | 'PER_UNIT';
  amount: number;
};

export type FactorTierSchedule = {
  factor: string;
  billingFrequency: 'MONTHLY' | 'HOURLY' | 'ANNUAL';
  bands: TierBand[];
};

export type CatalogPricingVersion = {
  id: string;
  packageId: string | null;
  versionNumber: number | null;
  isActive: boolean | null;
  effectiveFrom: string | null;
  deactivatedAt: string | null;
  currencyCode: string | null;
  tierSchedule: FactorTierSchedule[] | null;
  createdAt: string;
};

const PRICING_VERSION_FIELDS = `
  id packageId versionNumber isActive effectiveFrom deactivatedAt currencyCode tierSchedule createdAt
`;

export const fetchPricingVersionsForPackage = async (
  packageId: string,
): Promise<CatalogPricingVersion[]> => {
  const data = await coreQuery<{
    pricingVersions: { edges: { node: CatalogPricingVersion }[] };
  }>(
    `query PricingVersionsForPackage($packageId: UUID!) {
      pricingVersions(filter: { packageId: { eq: $packageId } }, first: 100, orderBy: [{ versionNumber: DescNullsLast }]) {
        edges { node { ${PRICING_VERSION_FIELDS} } }
      }
    }`,
    { packageId },
  );
  return data.pricingVersions.edges.map((e) => e.node);
};

export type CatalogPricingVersionInput = {
  packageId: string;
  isActive?: boolean | null;
  effectiveFrom?: string | null;
  currencyCode?: string | null;
  tierSchedule: FactorTierSchedule[];
};

// versionNumber is never sent -- PricingVersionCreateOnePreQueryHook assigns
// it server-side and, when isActive is true, deactivates whichever version
// was previously active on this package.
export const savePricingVersion = async (
  input: CatalogPricingVersionInput,
  id?: string,
): Promise<string> => {
  const payload: Record<string, unknown> = {
    packageId: input.packageId,
    isActive: input.isActive ?? true,
    effectiveFrom: input.effectiveFrom ?? new Date().toISOString(),
    currencyCode: input.currencyCode || 'AFN',
    tierSchedule: input.tierSchedule,
  };
  if (id) {
    const data = await coreQuery<{ updatePricingVersion: { id: string } }>(
      `mutation UpdatePricingVersion($id: UUID!, $data: PricingVersionUpdateInput!) {
        updatePricingVersion(id: $id, data: $data) { id }
      }`,
      { id, data: payload },
    );
    return data.updatePricingVersion.id;
  }
  const data = await coreQuery<{ createPricingVersion: { id: string } }>(
    `mutation CreatePricingVersion($data: PricingVersionCreateInput!) {
      createPricingVersion(data: $data) { id }
    }`,
    { data: payload },
  );
  return data.createPricingVersion.id;
};

// ---------- discount rule ----------

export type CatalogDiscountRule = {
  id: string;
  name: string;
  status: string | null;
  appliesToProductId: string | null;
  appliesToProduct: { id: string; name: string } | null;
  conditionType: string | null;
  conditionMinQuantity: number | null;
  conditionMetric: string | null;
  conditionSiblingProductId: string | null;
  conditionSiblingProduct: { id: string; name: string } | null;
  discountType: string | null;
  discountPercentValue: number | null;
  discountFixedAmount: CurrencyAmount;
  notes: string | null;
  createdAt: string;
};

const DISCOUNT_RULE_FIELDS = `
  id name status appliesToProductId conditionType conditionMinQuantity conditionMetric
  conditionSiblingProductId discountType discountPercentValue notes createdAt
  appliesToProduct { id name }
  conditionSiblingProduct { id name }
  discountFixedAmount { amountMicros currencyCode }
`;

export const fetchDiscountRules = async (): Promise<CatalogDiscountRule[]> => {
  const data = await coreQuery<{
    discountRules: { edges: { node: CatalogDiscountRule }[] };
  }>(
    `query DiscountRules {
      discountRules(first: 200, orderBy: [{ name: AscNullsLast }]) {
        edges { node { ${DISCOUNT_RULE_FIELDS} } }
      }
    }`,
  );
  return data.discountRules.edges.map((e) => e.node);
};

export type CatalogDiscountRuleInput = {
  name: string;
  status?: string | null;
  appliesToProductId: string;
  conditionType: string;
  conditionMinQuantity?: number | null;
  conditionMetric?: string | null;
  conditionSiblingProductId?: string | null;
  discountType: string;
  discountPercentValue?: number | null;
  discountFixedAmount?: number | null;
  // Currency the fixed-amount discount is denominated in -- inherited from the
  // applies-to product so a rule can't drift from the price it discounts.
  currencyCode?: ProductCurrencyCode | null;
  notes?: string | null;
};

export const saveDiscountRule = async (
  input: CatalogDiscountRuleInput,
  id?: string,
): Promise<string> => {
  // MIN_QUANTITY thresholds the whole line quantity; MIN_METRIC_QUANTITY
  // thresholds a specific pricing metric's quantity -- both reuse
  // conditionMinQuantity for the threshold value.
  const usesMinQuantity =
    input.conditionType === 'MIN_QUANTITY' ||
    input.conditionType === 'MIN_METRIC_QUANTITY';

  const payload: Record<string, unknown> = {
    name: input.name,
    status: input.status || 'ACTIVE',
    appliesToProductId: input.appliesToProductId,
    conditionType: input.conditionType,
    conditionMinQuantity: usesMinQuantity ? (input.conditionMinQuantity ?? null) : null,
    conditionMetric:
      input.conditionType === 'MIN_METRIC_QUANTITY' ? (input.conditionMetric || null) : null,
    conditionSiblingProductId:
      input.conditionType === 'SIBLING_PRODUCT_PURCHASED'
        ? (input.conditionSiblingProductId ?? null)
        : null,
    discountType: input.discountType,
    discountPercentValue:
      input.discountType === 'PERCENTAGE' ? (input.discountPercentValue ?? null) : null,
    discountFixedAmount:
      input.discountType === 'FIXED_AMOUNT'
        ? toAmount(input.discountFixedAmount, input.currencyCode ?? 'AFN')
        : null,
    notes: input.notes || null,
  };
  if (id) {
    const data = await coreQuery<{ updateDiscountRule: { id: string } }>(
      `mutation UpdateDiscountRule($id: UUID!, $data: DiscountRuleUpdateInput!) {
        updateDiscountRule(id: $id, data: $data) { id }
      }`,
      { id, data: payload },
    );
    return data.updateDiscountRule.id;
  }
  const data = await coreQuery<{ createDiscountRule: { id: string } }>(
    `mutation CreateDiscountRule($data: DiscountRuleCreateInput!) {
      createDiscountRule(data: $data) { id }
    }`,
    { data: payload },
  );
  return data.createDiscountRule.id;
};

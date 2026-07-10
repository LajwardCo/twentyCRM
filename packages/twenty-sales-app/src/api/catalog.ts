// Product / Package / Pricing Version / Discount Rule catalog management.
// Same coreQuery + create<Singular>/update<Singular> mutation pattern as
// admin.ts (saveCompetitor) and records.ts (addProductToLead) -- see
// docs/superpowers/specs/2026-07-09-sales-app-catalog-management-design.md.
import { coreQuery } from './client';

type CurrencyAmount = { amountMicros: number | null; currencyCode: string | null } | null;

// ---------- product ----------

export type CatalogProduct = {
  id: string;
  name: string;
  baseInstallPrice: CurrencyAmount;
  baseAnnualPrice: CurrencyAmount;
  maxDiscountPercent: number | null;
  pricingModel: string | null;
  pricingFactorNotes: string | null;
  isSellable: boolean | null;
  createdAt: string;
};

const PRODUCT_FIELDS = `
  id name maxDiscountPercent pricingModel pricingFactorNotes isSellable createdAt
  baseInstallPrice { amountMicros currencyCode }
  baseAnnualPrice { amountMicros currencyCode }
`;

export const fetchCatalogProducts = async (): Promise<CatalogProduct[]> => {
  const data = await coreQuery<{ products: { edges: { node: CatalogProduct }[] } }>(
    `query CatalogProducts {
      products(first: 200, orderBy: [{ name: AscNullsLast }]) {
        edges { node { ${PRODUCT_FIELDS} } }
      }
    }`,
  );
  return data.products.edges.map((e) => e.node);
};

export const fetchProductById = async (id: string): Promise<CatalogProduct | undefined> => {
  const data = await coreQuery<{ products: { edges: { node: CatalogProduct }[] } }>(
    `query CatalogProductById($id: UUID!) {
      products(filter: { id: { eq: $id } }, first: 1) {
        edges { node { ${PRODUCT_FIELDS} } }
      }
    }`,
    { id },
  );
  return data.products.edges[0]?.node;
};

export type CatalogProductInput = {
  name: string;
  baseInstallPriceAfn?: number | null;
  baseAnnualPriceAfn?: number | null;
  maxDiscountPercent?: number | null;
  pricingModel?: string | null;
  pricingFactorNotes?: string | null;
  isSellable?: boolean | null;
};

const toAmount = (afn: number | null | undefined): { amountMicros: number; currencyCode: string } | null =>
  afn || afn === 0 ? { amountMicros: Math.round(afn * 1_000_000), currencyCode: 'AFN' } : null;

export const saveCatalogProduct = async (
  input: CatalogProductInput,
  id?: string,
): Promise<string> => {
  const payload: Record<string, unknown> = {
    name: input.name,
    baseInstallPrice: toAmount(input.baseInstallPriceAfn),
    baseAnnualPrice: toAmount(input.baseAnnualPriceAfn),
    maxDiscountPercent: input.maxDiscountPercent ?? null,
    pricingModel: input.pricingModel || null,
    pricingFactorNotes: input.pricingFactorNotes || null,
    isSellable: input.isSellable ?? true,
  };
  if (id) {
    const data = await coreQuery<{ updateProduct: { id: string } }>(
      `mutation UpdateCatalogProduct($id: UUID!, $data: ProductUpdateInput!) {
        updateProduct(id: $id, data: $data) { id }
      }`,
      { id, data: payload },
    );
    return data.updateProduct.id;
  }
  const data = await coreQuery<{ createProduct: { id: string } }>(
    `mutation CreateCatalogProduct($data: ProductCreateInput!) {
      createProduct(data: $data) { id }
    }`,
    { data: payload },
  );
  return data.createProduct.id;
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
  billingFrequency: 'MONTHLY' | 'ANNUAL';
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
  conditionSiblingProductId: string | null;
  conditionSiblingProduct: { id: string; name: string } | null;
  discountType: string | null;
  discountPercentValue: number | null;
  discountFixedAmount: CurrencyAmount;
  notes: string | null;
  createdAt: string;
};

const DISCOUNT_RULE_FIELDS = `
  id name status appliesToProductId conditionType conditionMinQuantity
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
  conditionSiblingProductId?: string | null;
  discountType: string;
  discountPercentValue?: number | null;
  discountFixedAmountAfn?: number | null;
  notes?: string | null;
};

export const saveDiscountRule = async (
  input: CatalogDiscountRuleInput,
  id?: string,
): Promise<string> => {
  const payload: Record<string, unknown> = {
    name: input.name,
    status: input.status || 'ACTIVE',
    appliesToProductId: input.appliesToProductId,
    conditionType: input.conditionType,
    conditionMinQuantity:
      input.conditionType === 'MIN_QUANTITY' ? (input.conditionMinQuantity ?? null) : null,
    conditionSiblingProductId:
      input.conditionType === 'SIBLING_PRODUCT_PURCHASED'
        ? (input.conditionSiblingProductId ?? null)
        : null,
    discountType: input.discountType,
    discountPercentValue:
      input.discountType === 'PERCENTAGE' ? (input.discountPercentValue ?? null) : null,
    discountFixedAmount:
      input.discountType === 'FIXED_AMOUNT' ? toAmount(input.discountFixedAmountAfn) : null,
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

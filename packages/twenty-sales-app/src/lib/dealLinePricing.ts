import {
  type PricingFactor,
  type ProductPriceBook,
  SUPPORTED_CURRENCIES,
} from '../api/catalog';

// Everything the deal-line form needs to know about a product, satisfied by
// both the catalog's CatalogProduct and the picker's lighter ProductOption.
export type PricedProduct = {
  pricingModel: string | null;
  pricingFactors: PricingFactor[] | null;
  priceBook: ProductPriceBook | null;
  baseInstallPrice: { amountMicros: number | null; currencyCode: string | null } | null;
  baseAnnualPrice: { amountMicros: number | null; currencyCode: string | null } | null;
};

// What the seller restated on one line -- sent as DealProduct.priceOverrides
// and re-priced server-side. Only keys that actually differ from the catalog
// are ever filled, so an untouched form sends nothing at all.
export type LinePriceOverridesPayload = {
  currencyCode?: string;
  fixedInstall?: number;
  fixedAnnual?: number;
  factorRates?: Record<string, number>;
};

// Form state. Amounts stay as strings while being typed: '' means "use the
// catalog number", which is a different thing from a typed 0.
export type DealLineDraft = {
  productId: string;
  quantity: string;
  packageId: string;
  currencyCode: string;
  fixedInstall: string;
  fixedAnnual: string;
  metricRates: Record<string, string>;
  metricQuantities: Record<string, string>;
  discountRuleId: string;
};

const MICROS_PER_UNIT = 1_000_000;
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export const emptyDealLineDraft = (): DealLineDraft => ({
  productId: '',
  quantity: '1',
  packageId: '',
  currencyCode: '',
  fixedInstall: '',
  fixedAnnual: '',
  metricRates: {},
  metricQuantities: {},
  discountRuleId: '',
});

// Sellers type on Persian keyboards and paste grouped numbers; both have to
// reach the pricing math as plain numbers.
export const parseAmountInput = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;

  const normalized = raw
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[,\s٬]/g, '')
    .trim();

  if (normalized === '') return null;

  const value = Number(normalized);

  return Number.isFinite(value) && value >= 0 ? value : null;
};

export const productPrimaryCurrency = (
  product: PricedProduct | undefined,
): string =>
  product?.baseInstallPrice?.currencyCode ??
  product?.baseAnnualPrice?.currencyCode ??
  SUPPORTED_CURRENCIES[0];

// Currencies offered on the line: the ones the product is actually priced in
// first, then the rest -- a seller can still quote in a currency the catalog
// hasn't got a number for, they just have to state the amounts themselves.
export const lineCurrencyOptions = (
  product: PricedProduct | undefined,
): string[] => {
  const priced = new Set<string>([productPrimaryCurrency(product)]);

  for (const currencyCode of Object.keys(product?.priceBook ?? {})) {
    priced.add(currencyCode);
  }

  return [
    ...priced,
    ...SUPPORTED_CURRENCIES.filter((currencyCode) => !priced.has(currencyCode)),
  ];
};

export const isCurrencyPricedInCatalog = (
  product: PricedProduct | undefined,
  currencyCode: string,
): boolean =>
  currencyCode === productPrimaryCurrency(product) ||
  product?.priceBook?.[currencyCode] !== undefined;

export type CatalogFixedAmounts = { install: number | null; annual: number | null };

// The catalog's fixed amounts in a given currency. An amount entered in the
// product's primary currency is NOT a number in another currency, so a
// currency the price book doesn't cover simply has none.
export const catalogFixedAmounts = (
  product: PricedProduct | undefined,
  currencyCode: string,
): CatalogFixedAmounts => {
  const entry = product?.priceBook?.[currencyCode];

  if (entry !== undefined) {
    return {
      install: entry.install ?? null,
      annual: entry.annual ?? null,
    };
  }

  if (currencyCode !== productPrimaryCurrency(product)) {
    return { install: null, annual: null };
  }

  const install = product?.baseInstallPrice?.amountMicros ?? null;
  const annual = product?.baseAnnualPrice?.amountMicros ?? null;

  return {
    install: install === null ? null : install / MICROS_PER_UNIT,
    annual: annual === null ? null : annual / MICROS_PER_UNIT,
  };
};

// Metric rates live on the product in its primary currency only (the metrics
// table is single-currency by design) -- in any other currency the seller
// states the rate on the line.
export const catalogMetricRate = (
  product: PricedProduct | undefined,
  metricName: string,
  currencyCode: string,
): number | null => {
  if (currencyCode !== productPrimaryCurrency(product)) {
    return null;
  }

  const factor = (product?.pricingFactors ?? []).find(
    (candidate) => candidate.name === metricName,
  );

  return factor?.unitPrice ?? null;
};

export const metricBillingFrequency = (
  product: PricedProduct | undefined,
  metricName: string,
): PricingFactor['billingFrequency'] =>
  (product?.pricingFactors ?? []).find(
    (candidate) => candidate.name === metricName,
  )?.billingFrequency ?? 'MONTHLY';

// The rate table this line actually prices at: what the seller typed, else
// the catalog rate, else nothing (a metric with no rate contributes nothing
// rather than silently pricing at zero-times-quantity).
export const effectivePricingFactors = (
  product: PricedProduct | undefined,
  draft: DealLineDraft,
  metricNames: string[],
): PricingFactor[] =>
  metricNames.flatMap((metricName) => {
    const unitPrice =
      parseAmountInput(draft.metricRates[metricName]) ??
      catalogMetricRate(product, metricName, draft.currencyCode);

    return unitPrice === null
      ? []
      : [
          {
            name: metricName,
            unitPrice,
            billingFrequency: metricBillingFrequency(product, metricName),
          },
        ];
  });

export const effectiveFixedAmounts = (
  product: PricedProduct | undefined,
  draft: DealLineDraft,
): { install: number; annual: number } => {
  const catalog = catalogFixedAmounts(product, draft.currencyCode);

  return {
    install: parseAmountInput(draft.fixedInstall) ?? catalog.install ?? 0,
    annual: parseAmountInput(draft.fixedAnnual) ?? catalog.annual ?? 0,
  };
};

export const buildFactorQuantities = (
  draft: DealLineDraft,
  metricNames: string[],
): Record<string, number> =>
  Object.fromEntries(
    metricNames.flatMap((metricName) => {
      const quantity = parseAmountInput(draft.metricQuantities[metricName]);

      return quantity === null || quantity < 1 ? [] : [[metricName, quantity]];
    }),
  );

// Only genuine departures from the catalog are sent. A seller who opens the
// form, sees the suggested numbers and changes nothing produces no overrides
// at all, so the server keeps pricing such lines exactly as it did before
// this feature existed.
export const buildPriceOverrides = (
  product: PricedProduct | undefined,
  draft: DealLineDraft,
  metricNames: string[],
): LinePriceOverridesPayload | null => {
  const overrides: LinePriceOverridesPayload = {};
  const catalog = catalogFixedAmounts(product, draft.currencyCode);

  if (
    draft.currencyCode !== '' &&
    draft.currencyCode !== productPrimaryCurrency(product)
  ) {
    overrides.currencyCode = draft.currencyCode;
  }

  const fixedInstall = parseAmountInput(draft.fixedInstall);
  const fixedAnnual = parseAmountInput(draft.fixedAnnual);

  if (fixedInstall !== null && fixedInstall !== catalog.install) {
    overrides.fixedInstall = fixedInstall;
  }

  if (fixedAnnual !== null && fixedAnnual !== catalog.annual) {
    overrides.fixedAnnual = fixedAnnual;
  }

  const factorRates = Object.fromEntries(
    metricNames.flatMap((metricName) => {
      const rate = parseAmountInput(draft.metricRates[metricName]);

      return rate === null ||
        rate === catalogMetricRate(product, metricName, draft.currencyCode)
        ? []
        : [[metricName, rate]];
    }),
  );

  if (Object.keys(factorRates).length > 0) {
    overrides.factorRates = factorRates;
  }

  // A currency switch alone still counts: it changes which catalog amounts
  // the server prices from.
  return Object.keys(overrides).length > 0 ? overrides : null;
};

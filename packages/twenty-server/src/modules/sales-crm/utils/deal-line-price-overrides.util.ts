import {
  type FactorTierSchedule,
  productFactorToTierSchedule,
  type ProductPricingFactor,
} from 'src/modules/sales-crm/utils/pricing-tier-schedule.util';
import { type CurrencyValue } from 'src/modules/sales-crm/types/currency-value.type';

const MICROS_PER_UNIT = 1_000_000;
const DEFAULT_CURRENCY_CODE = 'USD';

// What a seller may restate on a single Deal Product line
// (DealProduct.priceOverrides). Every key is optional -- an absent field
// prices exactly as the catalog says, which is what the vast majority of
// lines do. Amounts are in major units (؋/$), matching what the seller typed.
export type LinePriceOverrides = {
  currencyCode?: string;
  fixedInstall?: number;
  fixedAnnual?: number;
  // Per-unit rate per metric name, same keys as factorQuantities.
  factorRates?: Record<string, number>;
};

// Fixed install/annual amounts per currency (Product.priceBook). A product
// priced in both AFN and USD carries a real, separately-entered amount for
// each -- no exchange rate is ever applied, because the business quotes
// different numbers per currency rather than converting one.
export type PriceBookEntry = { install?: number; annual?: number };
export type ProductPriceBook = Record<string, PriceBookEntry>;

// RAW_JSON reaches us as an object on most paths but as a string on some, and
// it is user-editable in the CRM UI -- so every value is re-validated here
// rather than trusted into the pricing math.
const asRecord = (raw: unknown): Record<string, unknown> => {
  const value = typeof raw === 'string' ? safeParseJson(raw) : raw;

  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

// Negative money is never a valid rate; it would flip a line's sign rather
// than discount it.
const asAmount = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : undefined;

const asFactorRates = (raw: unknown): Record<string, number> | undefined => {
  const entries = Object.entries(asRecord(raw))
    .map(([name, value]) => [name, asAmount(value)] as const)
    .filter(
      (entry): entry is readonly [string, number] =>
        entry[0].trim() !== '' && entry[1] !== undefined,
    );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

export const parseLinePriceOverrides = (raw: unknown): LinePriceOverrides => {
  const record = asRecord(raw);
  const currencyCode =
    typeof record.currencyCode === 'string' && record.currencyCode.trim() !== ''
      ? record.currencyCode.trim().toUpperCase()
      : undefined;
  const fixedInstall = asAmount(record.fixedInstall);
  const fixedAnnual = asAmount(record.fixedAnnual);
  const factorRates = asFactorRates(record.factorRates);

  return {
    ...(currencyCode !== undefined ? { currencyCode } : {}),
    ...(fixedInstall !== undefined ? { fixedInstall } : {}),
    ...(fixedAnnual !== undefined ? { fixedAnnual } : {}),
    ...(factorRates !== undefined ? { factorRates } : {}),
  };
};

export const parseProductPriceBook = (raw: unknown): ProductPriceBook => {
  const book: ProductPriceBook = {};

  for (const [currencyCode, value] of Object.entries(asRecord(raw))) {
    const entryRecord = asRecord(value);
    const install = asAmount(entryRecord.install);
    const annual = asAmount(entryRecord.annual);

    if (install === undefined && annual === undefined) {
      continue;
    }

    book[currencyCode.trim().toUpperCase()] = {
      ...(install !== undefined ? { install } : {}),
      ...(annual !== undefined ? { annual } : {}),
    };
  }

  return book;
};

export const hasLinePriceOverrides = (overrides: LinePriceOverrides): boolean =>
  Object.keys(overrides).length > 0;

export type ResolvedLineFixedAmounts = {
  currencyCode: string;
  baseInstallMicros: number;
  baseAnnualMicros: number;
};

// Picks the currency this line is denominated in and the fixed amounts that
// go with it. Precedence: what the seller typed on the line > the product's
// price book for that currency > the product's own base price -- and the base
// price only counts when the line is in the product's primary currency, since
// an AFN amount is not a USD amount.
export const resolveLineFixedAmounts = ({
  priceBook,
  overrides,
  baseInstallPrice,
  baseAnnualPrice,
  fallbackCurrencyCode = DEFAULT_CURRENCY_CODE,
}: {
  priceBook: ProductPriceBook;
  overrides: LinePriceOverrides;
  baseInstallPrice: CurrencyValue | null | undefined;
  baseAnnualPrice: CurrencyValue | null | undefined;
  fallbackCurrencyCode?: string;
}): ResolvedLineFixedAmounts => {
  const primaryCurrencyCode =
    baseInstallPrice?.currencyCode ??
    baseAnnualPrice?.currencyCode ??
    fallbackCurrencyCode;
  const currencyCode = overrides.currencyCode ?? primaryCurrencyCode;
  const isPrimaryCurrency = currencyCode === primaryCurrencyCode;
  const bookEntry = priceBook[currencyCode];

  const resolve = (
    override: number | undefined,
    bookAmount: number | undefined,
    basePrice: CurrencyValue | null | undefined,
  ): number => {
    if (override !== undefined) {
      return Math.round(override * MICROS_PER_UNIT);
    }

    if (bookAmount !== undefined) {
      return Math.round(bookAmount * MICROS_PER_UNIT);
    }

    return isPrimaryCurrency ? Number(basePrice?.amountMicros ?? 0) : 0;
  };

  return {
    currencyCode,
    baseInstallMicros: resolve(
      overrides.fixedInstall,
      bookEntry?.install,
      baseInstallPrice,
    ),
    baseAnnualMicros: resolve(
      overrides.fixedAnnual,
      bookEntry?.annual,
      baseAnnualPrice,
    ),
  };
};

// A rate the seller restated wins over the catalog rate for this line only.
// A rate naming a metric the product doesn't carry is kept as a new metric --
// the seller sold something the catalog hasn't caught up with yet, and
// dropping it would silently under-price the line. Cadence for such a metric
// is MONTHLY, the same default legacy rows get.
export const applyFactorRateOverridesToProductFactors = (
  factors: ProductPricingFactor[],
  factorRates: Record<string, number> | undefined,
): ProductPricingFactor[] => {
  if (factorRates === undefined) {
    return factors;
  }

  const known = new Set(factors.map((factor) => factor.name));

  return [
    ...factors.map((factor) =>
      factorRates[factor.name] !== undefined
        ? { ...factor, unitPrice: factorRates[factor.name] }
        : factor,
    ),
    ...Object.entries(factorRates)
      .filter(([name]) => !known.has(name))
      .map(([name, unitPrice]) => ({
        name,
        unitPrice,
        billingFrequency: 'MONTHLY' as const,
      })),
  ];
};

// Same rule against a Package's volume tiers: the negotiated rate replaces
// the whole band ladder for that metric, so the tiers can't quietly out-price
// what the seller agreed. The metric's cadence is the package's.
export const applyFactorRateOverridesToTierSchedule = (
  tierSchedule: FactorTierSchedule[],
  factorRates: Record<string, number> | undefined,
): FactorTierSchedule[] => {
  if (factorRates === undefined) {
    return tierSchedule;
  }

  const scheduled = new Set(tierSchedule.map((entry) => entry.factor));

  return [
    ...tierSchedule.map((entry) =>
      factorRates[entry.factor] !== undefined
        ? {
            ...entry,
            bands: [
              {
                minQty: 1,
                maxQty: null,
                mode: 'PER_UNIT' as const,
                amount: factorRates[entry.factor],
              },
            ],
          }
        : entry,
    ),
    ...Object.entries(factorRates)
      .filter(([name]) => !scheduled.has(name))
      .map(([name, unitPrice]) =>
        productFactorToTierSchedule({ name, unitPrice }),
      ),
  ];
};

// How far below the catalog price a line was restated, as a percentage --
// the number the Product's maxDiscountPercent ceiling is checked against.
// Pricing a line ABOVE catalog is not a discount.
export const impliedDiscountPercent = (
  catalogMicros: number,
  overriddenMicros: number,
): number => {
  if (catalogMicros <= 0 || overriddenMicros >= catalogMicros) {
    return 0;
  }

  return (
    Math.round(((catalogMicros - overriddenMicros) / catalogMicros) * 10000) /
    100
  );
};

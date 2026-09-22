import { type PricingFactor } from '../api/catalog';
import { type DealProductLine } from '../api/records';
import { formatMoney } from './format';
import { toPersianDigits } from './jalali';
import { BILLING_FREQUENCY_LABELS, T18 } from './strings';

// What a deal line is made of, as the lines printed under the item on a sales
// order: the package it was priced from, the fixed install/annual amounts,
// one line per metric with quantity, rate and subtotal, and the discount.
//
// The server's priceSnapshot is the authority when the line was priced from
// a pricing version (it carries the matched tier band). A line priced from
// the product's own metric table has no snapshot; its rates come from the
// seller's overrides, else the catalog.

type Money = { amountMicros: number | null; currencyCode: string | null } | null;

type Product = {
  pricingModel: string | null;
  pricingFactors: PricingFactor[] | null;
  baseInstallPrice?: Money;
  baseAnnualPrice?: Money;
  priceBook?: Record<string, { install?: number; annual?: number }> | null;
};

const units = (value: Money | undefined): number | null =>
  value?.amountMicros ? value.amountMicros / 1_000_000 : null;

// The fixed part of a line that also bills metrics: what the seller restated,
// else the catalog's amount in the line's currency, else its primary amount.
const fixedPart = (
  kind: 'install' | 'annual',
  line: DealProductLine,
  product: Product | undefined,
  currencyCode: string | null,
): number | null => {
  const restated = kind === 'install' ? line.priceOverrides?.fixedInstall : line.priceOverrides?.fixedAnnual;
  if (typeof restated === 'number') return restated || null;
  const booked = currencyCode ? product?.priceBook?.[currencyCode]?.[kind] : undefined;
  if (typeof booked === 'number') return booked || null;
  const base = kind === 'install' ? product?.baseInstallPrice : product?.baseAnnualPrice;
  return base?.currencyCode && currencyCode && base.currencyCode !== currencyCode ? null : units(base);
};

const money = (units: number | null | undefined, currencyCode: string | null | undefined): string =>
  formatMoney(units ? Math.round(units * 1_000_000) : null, currencyCode);

const period = (frequency: string | undefined): string =>
  frequency ? BILLING_FREQUENCY_LABELS[frequency] ?? frequency : '';

const metricLine = (
  name: string,
  quantity: number,
  rate: number | null,
  subtotal: number | null,
  frequency: string | undefined,
  currencyCode: string | null,
): string => {
  const parts = [`${name} × ${toPersianDigits(quantity)}`];
  if (rate !== null) parts.push(`@ ${money(rate, currencyCode)}`);
  if (subtotal !== null) parts.push(`= ${money(subtotal, currencyCode)}`);
  const per = period(frequency);
  return `${parts.join(' ')}${per ? ` (${per})` : ''}`;
};

export type CadenceSplit = {
  // All in micros, matching DealProductLine amounts.
  oneTimeMicros: number; // fixed one-time install / setup fee
  monthlyMicros: number; // sub-annual recurring (monthly + hourly metrics)
  annualMicros: number; // annual fixed + annual metrics
  currencyCode: string | null;
};

// Separate a deal line's one-time charge from its recurring charges. The server
// folds monthly + hourly metrics INTO installPrice (see
// product-fixed-plus-metrics-price.util.ts), so a line's "install price" is
// really one-time + monthly. We recover the split from the line's own fixed
// install part, guaranteeing consistency: oneTime + monthly === installPrice and
// annual === annualPrice, so no total ever changes -- only its presentation.
export const splitDealLineCadence = (
  line: DealProductLine,
  product: Product | undefined,
): CadenceSplit => {
  const currencyCode =
    line.priceOverrides?.currencyCode ??
    line.installPrice?.currencyCode ??
    line.annualPrice?.currencyCode ??
    null;
  const installMicros = line.installPrice?.amountMicros ?? 0;
  const annualMicros = line.annualPrice?.amountMicros ?? 0;

  const hasMetrics =
    (line.priceSnapshot?.breakdown?.length ?? 0) > 0 ||
    Object.keys(line.factorQuantities ?? {}).length > 0;

  // No metrics: the whole install charge is a one-time fee; nothing recurs.
  if (!hasMetrics) {
    return { oneTimeMicros: installMicros, monthlyMicros: 0, annualMicros, currencyCode };
  }

  // With metrics, installPrice = fixed install (one-time) + monthly + hourly.
  // The fixed part is the one-time fee; the remainder is the recurring part.
  const fixedInstallUnits = fixedPart('install', line, product, currencyCode) ?? 0;
  const oneTimeMicros = Math.min(
    Math.max(Math.round(fixedInstallUnits * 1_000_000), 0),
    installMicros,
  );
  const monthlyMicros = Math.max(0, installMicros - oneTimeMicros);
  return { oneTimeMicros, monthlyMicros, annualMicros, currencyCode };
};

export const describeDealLine = (line: DealProductLine, product: Product | undefined): string[] => {
  const out: string[] = [];
  const currencyCode =
    line.priceOverrides?.currencyCode ?? line.installPrice?.currencyCode ?? line.annualPrice?.currencyCode ?? null;
  const snapshot = line.priceSnapshot ?? null;

  if (snapshot?.packageName) {
    const version = snapshot.versionNumber ? ` (${T18.detailVersion} ${toPersianDigits(snapshot.versionNumber)})` : '';
    out.push(`${T18.detailPackage}: ${snapshot.packageName}${version}`);
  }

  const metricsFromSnapshot = snapshot?.breakdown ?? [];
  const quantities = line.factorQuantities ?? {};
  const hasMetrics = metricsFromSnapshot.length > 0 || Object.keys(quantities).length > 0;

  // A line that bills metrics carries them inside installPrice/annualPrice;
  // naming those totals "install"/"annual" on top of the metric lines would
  // double-count in the reader's head. Such a line names only its fixed part.
  const install = hasMetrics ? fixedPart('install', line, product, currencyCode) : units(line.installPrice);
  const annual = hasMetrics ? fixedPart('annual', line, product, currencyCode) : units(line.annualPrice);
  if (install) out.push(`${T18.detailInstall}: ${money(install, currencyCode)}`);
  if (annual) out.push(`${T18.detailAnnual}: ${money(annual, currencyCode)}`);

  if (metricsFromSnapshot.length > 0) {
    for (const entry of metricsFromSnapshot) {
      out.push(
        metricLine(
          entry.factor,
          entry.quantity,
          entry.matchedBand?.amount ?? null,
          entry.subtotal,
          entry.billingFrequency,
          currencyCode,
        ),
      );
    }
  } else {
    // Catalog metric rates are quoted in the product's primary currency only;
    // a line restated in another currency has a rate only where the seller
    // typed one.
    const catalogCurrency = product?.baseInstallPrice?.currencyCode ?? product?.baseAnnualPrice?.currencyCode ?? null;
    const catalogRatesApply = !currencyCode || !catalogCurrency || currencyCode === catalogCurrency;
    for (const [name, quantity] of Object.entries(quantities)) {
      if (typeof quantity !== 'number' || quantity <= 0) continue;
      const catalog = product?.pricingFactors?.find((factor) => factor.name === name);
      const rate = line.priceOverrides?.factorRates?.[name] ?? (catalogRatesApply ? catalog?.unitPrice : null) ?? null;
      out.push(
        metricLine(name, quantity, rate, rate === null ? null : rate * quantity, catalog?.billingFrequency, currencyCode),
      );
    }
  }

  if ((line.discountPercent ?? 0) > 0) {
    out.push(`${T18.detailDiscount}: ${toPersianDigits(line.discountPercent ?? 0)}٪`);
  }

  return out;
};

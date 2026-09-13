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

type Product = {
  pricingModel: string | null;
  pricingFactors: PricingFactor[] | null;
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

  // A purely metric-priced line's installPrice IS the metric subtotal; naming
  // it "install" on top of the metric lines would double-count in the reader's
  // head. Fixed amounts are only called out when the product has them.
  const fixedProduct = product?.pricingModel !== 'PER_FACTOR' || !hasMetrics;
  const install = line.installPrice?.amountMicros ? line.installPrice.amountMicros / 1_000_000 : null;
  const annual = line.annualPrice?.amountMicros ? line.annualPrice.amountMicros / 1_000_000 : null;
  if (fixedProduct && install) out.push(`${T18.detailInstall}: ${money(install, currencyCode)}`);
  if (fixedProduct && annual) out.push(`${T18.detailAnnual}: ${money(annual, currencyCode)}`);

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
    for (const [name, quantity] of Object.entries(quantities)) {
      if (typeof quantity !== 'number' || quantity <= 0) continue;
      const catalog = product?.pricingFactors?.find((factor) => factor.name === name);
      const rate = line.priceOverrides?.factorRates?.[name] ?? catalog?.unitPrice ?? null;
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

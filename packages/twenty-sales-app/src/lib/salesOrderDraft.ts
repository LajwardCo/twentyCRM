import { type DealProductLine } from '../api/records';
import { type SalesOrderLineInput, type UsystemsItem } from '../api/usystems';
import { T18 } from './strings';
import { describeDealLine, splitDealLineCadence } from './salesOrderLineDetails';

// The lines a sales order starts from: the lead's deal products, split by
// billing cadence so a one-time install fee and a monthly recurring charge are
// never conflated into one number. Micros become plain currency units here --
// Core takes decimal amounts.

// A line's billing cadence. Monthly is multiplied by the contracted months when
// the order total is computed; one-time and annual are charged once.
export type LineCadence = 'oneTime' | 'monthly' | 'annual';

export type DraftLine = SalesOrderLineInput & {
  key: string;
  details: string;
  cadence: LineCadence;
};

export const CADENCE_ORDER: LineCadence[] = ['oneTime', 'monthly', 'annual'];

export const cadenceLabel = (cadence: LineCadence): string =>
  cadence === 'monthly' ? T18.cadenceMonthly : cadence === 'annual' ? T18.cadenceAnnual : T18.cadenceOneTime;

// Enough of a catalog product to describe a line's metrics; the picker's
// ProductOption and the catalog's CatalogProduct both satisfy it.
export type DraftProduct = {
  id: string;
  pricingModel: string | null;
  pricingFactors: { name: string; unitPrice: number; billingFrequency?: 'MONTHLY' | 'HOURLY' | 'ANNUAL' }[] | null;
  baseInstallPrice?: { amountMicros: number | null; currencyCode: string | null } | null;
  baseAnnualPrice?: { amountMicros: number | null; currencyCode: string | null } | null;
  priceBook?: Record<string, { install?: number; annual?: number }> | null;
};

const fromMicros = (micros: number | null | undefined): number =>
  micros ? Math.round(micros) / 1_000_000 : 0;

export const draftLinesFromDeal = (
  lines: DealProductLine[],
  products: DraftProduct[] = [],
): DraftLine[] => {
  const out: DraftLine[] = [];
  lines
    .filter((line) => line.lineStatus !== 'REMOVED')
    .forEach((line, index) => {
      const name = (line.product?.name || line.name || '').trim();
      if (!name) return;
      const quantity = line.quantity && line.quantity > 0 ? line.quantity : 1;
      const product = products.find((candidate) => candidate.id === line.product?.id);
      const split = splitDealLineCadence(line, product);
      const details = describeDealLine(line, product).join('\n');

      const allParts: { cadence: LineCadence; micros: number }[] = [
        { cadence: 'oneTime', micros: split.oneTimeMicros },
        { cadence: 'monthly', micros: split.monthlyMicros },
        { cadence: 'annual', micros: split.annualMicros },
      ];
      const parts = allParts.filter((part) => part.micros > 0);
      if (parts.length === 0) return;

      // Only suffix the item name (— نصب / ماهانه / سالانه) when the line
      // actually splits into more than one cadence, so a plain one-time product
      // stays a single clean line.
      const multi = parts.length > 1;
      parts.forEach((part, partIndex) => {
        out.push({
          key: `${line.id || `line-${index}`}-${part.cadence}`,
          description: multi ? `${name} — ${cadenceLabel(part.cadence)}` : name,
          quantity,
          unitPrice: fromMicros(part.micros),
          unit: '',
          details: partIndex === 0 ? details : '',
          cadence: part.cadence,
        });
      });
    });
  return out;
};

export const emptyLine = (cadence: LineCadence = 'oneTime'): DraftLine => ({
  key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  description: '',
  quantity: 1,
  unitPrice: 0,
  unit: '',
  details: '',
  cadence,
});

// A line added from the Core catalog picker (a product OR a service). Its type
// only shows the seller what they picked; a service is billed like any other
// one-time line unless they switch its cadence.
export const lineFromItem = (item: UsystemsItem): DraftLine => ({
  key: `item-${item.id}-${Date.now()}`,
  description: item.name,
  quantity: 1,
  unitPrice: Number(item.sales_price) || 0,
  unit: '',
  details: '',
  cadence: 'oneTime',
});

export type DraftSummary = {
  oneTime: number;
  monthly: number; // per-month recurring subtotal
  monthlyContract: number; // monthly × months
  annual: number;
  subtotal: number; // oneTime + monthlyContract + annual (pre-discount)
  discount: number;
  grandTotal: number;
};

const clampPercent = (value: number): number => Math.min(Math.max(Number(value) || 0, 0), 100);

// Split the order total by cadence, apply the contracted months to the monthly
// part and the additional discount to the whole -- so the seller sees one-time
// and monthly separately even in the total.
export const summarizeDraft = (
  lines: DraftLine[],
  months: number,
  discountPercent: number,
): DraftSummary => {
  let oneTime = 0;
  let monthly = 0;
  let annual = 0;
  for (const line of lines) {
    const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
    if (line.cadence === 'monthly') monthly += amount;
    else if (line.cadence === 'annual') annual += amount;
    else oneTime += amount;
  }
  const monthsMultiplier = Math.max(1, Math.round(Number(months) || 1));
  const monthlyContract = monthly * monthsMultiplier;
  const subtotal = oneTime + monthlyContract + annual;
  const discount = subtotal * (clampPercent(discountPercent) / 100);
  return { oneTime, monthly, monthlyContract, annual, subtotal, discount, grandTotal: subtotal - discount };
};

// The lines actually sent to Core: monthly lines are multiplied by the
// contracted months, and the additional discount is baked into every unit price
// (Core has no order-level discount field). The cadence + months + discount are
// also restated in the memo for the document.
export const buildPayloadLines = (
  lines: DraftLine[],
  months: number,
  discountPercent: number,
): SalesOrderLineInput[] => {
  const monthsMultiplier = Math.max(1, Math.round(Number(months) || 1));
  const discountFactor = 1 - clampPercent(discountPercent) / 100;
  return lines
    .filter((line) => line.description.trim() !== '' && Number(line.quantity) > 0)
    .map(({ description, quantity, unitPrice, unit, details, cadence }) => {
      const multiplier = cadence === 'monthly' ? monthsMultiplier : 1;
      return {
        description: description.trim(),
        quantity: Number(quantity) * multiplier,
        unitPrice: Math.round((Number(unitPrice) || 0) * discountFactor * 1_000_000) / 1_000_000,
        ...(unit && unit.trim() ? { unit: unit.trim() } : {}),
        ...(details.trim() ? { details: details.trim() } : {}),
      };
    });
};

export const validDraftLines = (lines: DraftLine[]): DraftLine[] =>
  lines.filter((line) => line.description.trim() !== '' && Number(line.quantity) > 0);

/** Default deadline: 30 days out, as the yyyy-mm-dd the date picker speaks. */
export const defaultValidUntil = (from = new Date()): string => {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

export const today = (): string => new Date().toISOString().slice(0, 10);

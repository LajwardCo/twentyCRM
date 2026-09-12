import { type DealProductLine } from '../api/records';
import { type SalesOrderLineInput } from '../api/usystems';

// The lines a sales order starts from: the lead's deal products, priced at
// the annual price where one is set, otherwise the install price. Micros
// become plain currency units here -- Core takes decimal amounts.

export type DraftLine = SalesOrderLineInput & { key: string };

const fromMicros = (micros: number | null | undefined): number =>
  micros ? Math.round(micros) / 1_000_000 : 0;

export const draftLinesFromDeal = (lines: DealProductLine[]): DraftLine[] =>
  lines
    .filter((line) => line.lineStatus !== 'REMOVED')
    .map((line, index) => {
      const price = line.annualPrice?.amountMicros
        ? line.annualPrice
        : line.installPrice;
      return {
        key: line.id || `line-${index}`,
        description: line.product?.name || line.name || '',
        quantity: line.quantity && line.quantity > 0 ? line.quantity : 1,
        unitPrice: fromMicros(price?.amountMicros),
        unit: '',
      };
    })
    .filter((line) => line.description.trim() !== '');

export const emptyLine = (): DraftLine => ({
  key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  description: '',
  quantity: 1,
  unitPrice: 0,
  unit: '',
});

export const draftTotal = (lines: DraftLine[]): number =>
  lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);

export const validDraftLines = (lines: DraftLine[]): SalesOrderLineInput[] =>
  lines
    .filter((line) => line.description.trim() !== '' && Number(line.quantity) > 0)
    .map(({ description, quantity, unitPrice, unit }) => ({
      description: description.trim(),
      quantity: Number(quantity),
      unitPrice: Number(unitPrice) || 0,
      ...(unit && unit.trim() ? { unit: unit.trim() } : {}),
    }));

/** Default deadline: 30 days out, as the yyyy-mm-dd the date picker speaks. */
export const defaultValidUntil = (from = new Date()): string => {
  const d = new Date(from);
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

export const today = (): string => new Date().toISOString().slice(0, 10);

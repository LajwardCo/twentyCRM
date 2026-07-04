// packages/twenty-server/src/modules/sales-crm/types/currency-value.type.ts
// Shared shape for Twenty's CURRENCY composite field type -- {amountMicros,
// currencyCode}, not a plain number (writing a raw number is silently
// dropped by Twenty's GraphQL layer). Previously duplicated identically
// across four files in this module; extracted here once that reached the
// point of real cross-file drift risk.
export type CurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
};

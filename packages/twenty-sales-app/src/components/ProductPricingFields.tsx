import {
  type CatalogProductInput,
  type ProductCurrencyCode,
  type ProductPriceBook,
  SUPPORTED_CURRENCIES,
} from '../api/catalog';
import { CURRENCY_LABELS, T4 } from '../lib/strings';
import { ProductMetricsEditor } from './ProductMetricsEditor';

// The fixed amounts + metrics half of the product editor, shared by the
// catalog list (CatalogView) and the product detail page
// (CatalogDetailViews) so the two stay in step. Fixed and per-metric pricing
// are additive, not alternatives: a PER_FACTOR product may also carry a
// one-time install fee and/or a fixed annual fee, either of which may be left
// blank.
//
// Fixed amounts are per currency: a product sold in both AFN and USD carries a
// separately-entered price in each, because the business quotes different
// numbers rather than converting one at an exchange rate. The primary
// currency's row is what baseInstallPrice/baseAnnualPrice hold, and it is the
// currency the metric rates below are denominated in.

const CURRENCY_SYMBOLS: Record<string, string> = { AFN: '؋', USD: '$' };

const SECTION_STYLE = {
  background: 'var(--surface-2, rgba(127,127,127,.06))',
  marginBottom: 8,
} as const;

type ProductPricingFieldsProps = {
  value: CatalogProductInput;
  onChange: (patch: Partial<CatalogProductInput>) => void;
};

const amountFor = (
  value: CatalogProductInput,
  currencyCode: string,
  key: 'install' | 'annual',
): number | null | undefined => {
  const primaryCurrency = value.currencyCode ?? SUPPORTED_CURRENCIES[0];

  if (currencyCode === primaryCurrency) {
    return key === 'install'
      ? value.baseInstallPriceAmount
      : value.baseAnnualPriceAmount;
  }

  return value.priceBook?.[currencyCode]?.[key] ?? null;
};

export const ProductPricingFields = ({
  value,
  onChange,
}: ProductPricingFieldsProps) => {
  const primaryCurrency = value.currencyCode ?? SUPPORTED_CURRENCIES[0];
  const isPerFactor = value.pricingModel === 'PER_FACTOR';

  // The primary currency's amounts live in the base* fields (the CRM's own
  // currency composites); every other currency lives in the price book. One
  // editor writes to whichever holds the row being edited.
  const setAmount = (
    currencyCode: string,
    key: 'install' | 'annual',
    raw: string,
  ) => {
    const amount = raw === '' ? null : Number(raw);

    if (currencyCode === primaryCurrency) {
      onChange(
        key === 'install'
          ? { baseInstallPriceAmount: amount }
          : { baseAnnualPriceAmount: amount },
      );
      return;
    }

    const book: ProductPriceBook = { ...(value.priceBook ?? {}) };
    const entry = { ...(book[currencyCode] ?? {}) };

    if (amount === null || Number.isNaN(amount)) {
      delete entry[key];
    } else {
      entry[key] = amount;
    }

    if (Object.keys(entry).length === 0) {
      delete book[currencyCode];
    } else {
      book[currencyCode] = entry;
    }

    onChange({ priceBook: Object.keys(book).length > 0 ? book : null });
  };

  // Switching the primary currency moves the amounts rather than silently
  // re-labelling them: whatever the new currency already had in the price book
  // becomes the base amounts, and the old base amounts stay in the book under
  // the old currency.
  const setPrimaryCurrency = (nextCurrency: ProductCurrencyCode) => {
    if (nextCurrency === primaryCurrency) return;

    const book: ProductPriceBook = { ...(value.priceBook ?? {}) };
    const incoming = book[nextCurrency] ?? {};
    const outgoing = {
      ...(value.baseInstallPriceAmount || value.baseInstallPriceAmount === 0
        ? { install: value.baseInstallPriceAmount }
        : {}),
      ...(value.baseAnnualPriceAmount || value.baseAnnualPriceAmount === 0
        ? { annual: value.baseAnnualPriceAmount }
        : {}),
    };

    delete book[nextCurrency];

    if (Object.keys(outgoing).length > 0) {
      book[primaryCurrency] = outgoing;
    }

    onChange({
      currencyCode: nextCurrency,
      baseInstallPriceAmount: incoming.install ?? null,
      baseAnnualPriceAmount: incoming.annual ?? null,
      priceBook: Object.keys(book).length > 0 ? book : null,
    });
  };

  return (
    <>
      <div className="card card-pad" style={SECTION_STYLE}>
        <div className="sub" style={{ marginBottom: 8 }}>
          {T4.priceBookSection}
        </div>
        <div className="sub" style={{ marginBottom: 8 }}>
          {isPerFactor ? T4.fixedPlusMetricsHint : T4.priceBookHint}
        </div>

        {SUPPORTED_CURRENCIES.map((currencyCode) => {
          const symbol = CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;

          return (
            <div key={currencyCode} style={{ marginBottom: 10 }}>
              <div className="sub" style={{ marginBottom: 4 }}>
                {CURRENCY_LABELS[currencyCode] ?? currencyCode}
                {currencyCode === primaryCurrency ? ` · ${T4.primaryCurrencyLbl}` : ''}
              </div>
              <div className="f2">
                <div className="fld" style={{ marginBottom: 0 }}>
                  <label>
                    {isPerFactor ? T4.fixedInstallLbl : T4.installPriceColumn} ({symbol})
                  </label>
                  <input
                    inputMode="decimal"
                    dir="ltr"
                    value={amountFor(value, currencyCode, 'install') ?? ''}
                    onChange={(e) => setAmount(currencyCode, 'install', e.target.value)}
                  />
                </div>
                <div className="fld" style={{ marginBottom: 0 }}>
                  <label>
                    {isPerFactor ? T4.fixedAnnualLbl : T4.annualPriceColumn} ({symbol})
                  </label>
                  <input
                    inputMode="decimal"
                    dir="ltr"
                    value={amountFor(value, currencyCode, 'annual') ?? ''}
                    onChange={(e) => setAmount(currencyCode, 'annual', e.target.value)}
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div className="fld" style={{ maxWidth: 220, marginBottom: 0 }}>
          <label>{T4.primaryCurrencyLbl}</label>
          <select
            value={primaryCurrency}
            onChange={(e) => setPrimaryCurrency(e.target.value as ProductCurrencyCode)}
          >
            {SUPPORTED_CURRENCIES.map((currencyCode) => (
              <option key={currencyCode} value={currencyCode}>
                {CURRENCY_LABELS[currencyCode] ?? currencyCode}
              </option>
            ))}
          </select>
          <div className="sub" style={{ marginTop: 4 }}>
            {T4.primaryCurrencyHint}
          </div>
        </div>
      </div>

      {isPerFactor && (
        <div className="card card-pad" style={SECTION_STYLE}>
          <div className="sub" style={{ marginBottom: 8 }}>
            {T4.metricsSection}
          </div>
          <ProductMetricsEditor
            value={value.pricingFactors ?? []}
            currencyCode={primaryCurrency}
            onChange={(next) => onChange({ pricingFactors: next })}
          />
        </div>
      )}
    </>
  );
};

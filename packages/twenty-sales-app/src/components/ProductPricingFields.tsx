import { type CatalogProductInput } from '../api/catalog';
import { T4 } from '../lib/strings';
import { ProductMetricsEditor } from './ProductMetricsEditor';

// The fixed amounts + metrics half of the product editor, shared by the
// catalog list (CatalogView) and the product detail page
// (CatalogDetailViews) so the two stay in step. Fixed and per-metric pricing
// are additive, not alternatives: a PER_FACTOR product may also carry a
// one-time install fee and/or a fixed annual fee, either of which may be left
// blank.

const CURRENCY_SYMBOLS: Record<string, string> = { AFN: '؋', USD: '$' };

const SECTION_STYLE = {
  background: 'var(--surface-2, rgba(127,127,127,.06))',
  marginBottom: 8,
} as const;

type ProductPricingFieldsProps = {
  value: CatalogProductInput;
  onChange: (patch: Partial<CatalogProductInput>) => void;
};

export const ProductPricingFields = ({
  value,
  onChange,
}: ProductPricingFieldsProps) => {
  const currencyCode = value.currencyCode ?? 'AFN';
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;
  const isPerFactor = value.pricingModel === 'PER_FACTOR';

  const setAmount = (
    key: 'baseInstallPriceAmount' | 'baseAnnualPriceAmount',
    raw: string,
  ) => onChange({ [key]: raw === '' ? null : Number(raw) });

  return (
    <>
      <div className="card card-pad" style={SECTION_STYLE}>
        <div className="sub" style={{ marginBottom: 8 }}>
          {T4.fixedSection}
        </div>
        {isPerFactor && (
          <div className="sub" style={{ marginBottom: 8 }}>
            {T4.fixedPlusMetricsHint}
          </div>
        )}
        <div className="f2">
          <div className="fld">
            <label>
              {isPerFactor ? T4.fixedInstallLbl : T4.baseInstallPriceLbl} ({symbol})
            </label>
            <input
              inputMode="decimal"
              dir="ltr"
              value={value.baseInstallPriceAmount ?? ''}
              onChange={(e) => setAmount('baseInstallPriceAmount', e.target.value)}
            />
          </div>
          <div className="fld">
            <label>
              {isPerFactor ? T4.fixedAnnualLbl : T4.baseAnnualPriceLbl} ({symbol})
            </label>
            <input
              inputMode="decimal"
              dir="ltr"
              value={value.baseAnnualPriceAmount ?? ''}
              onChange={(e) => setAmount('baseAnnualPriceAmount', e.target.value)}
            />
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
            currencyCode={currencyCode}
            onChange={(next) => onChange({ pricingFactors: next })}
          />
        </div>
      )}
    </>
  );
};

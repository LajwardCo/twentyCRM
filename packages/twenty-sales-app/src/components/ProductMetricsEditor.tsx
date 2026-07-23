import { type PricingFactor } from '../api/catalog';
import { BILLING_FREQUENCY_LABELS, T4 } from '../lib/strings';

// Structured builder for Product.pricingFactors (the "based on metrics" pricing
// model). Each metric is a per-unit fee billed at a chosen cadence -- e.g.
// User 100/month, Inventory 5/hour, Employee 1200/year. Deliberately not a raw
// JSON textarea: this drives every PER_FACTOR deal's computed price. See
// docs/superpowers/specs/2026-07-23-sales-app-pricing-currency-metrics-design.md.

const CURRENCY_SYMBOLS: Record<string, string> = { AFN: '؋', USD: '$' };

const EMPTY_METRIC: PricingFactor = {
  name: '',
  unitPrice: 0,
  billingFrequency: 'MONTHLY',
};

type Props = {
  value: PricingFactor[];
  currencyCode: string;
  onChange: (next: PricingFactor[]) => void;
};

export const ProductMetricsEditor = ({ value, currencyCode, onChange }: Props) => {
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;

  const updateMetric = (index: number, patch: Partial<PricingFactor>) => {
    onChange(value.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const removeMetric = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addMetric = () => {
    onChange([...value, { ...EMPTY_METRIC }]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="sub">{T4.metricsHint}</div>
      {value.length === 0 && <div className="empty-state">{T4.noMetricsYet}</div>}
      {value.map((metric, mi) => (
        <div
          key={mi}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
        >
          <div className="fld" style={{ flex: 1, minWidth: 140 }}>
            <label>{T4.metricNameLbl}</label>
            <input
              placeholder={T4.metricNamePlaceholder}
              value={metric.name}
              onChange={(e) => updateMetric(mi, { name: e.target.value })}
            />
          </div>
          <div className="fld" style={{ maxWidth: 130 }}>
            <label>
              {T4.metricUnitPriceLbl} ({symbol})
            </label>
            <input
              inputMode="decimal"
              dir="ltr"
              value={metric.unitPrice}
              onChange={(e) => updateMetric(mi, { unitPrice: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="fld" style={{ maxWidth: 130 }}>
            <label>{T4.metricFrequencyLbl}</label>
            <select
              value={metric.billingFrequency ?? 'MONTHLY'}
              onChange={(e) =>
                updateMetric(mi, {
                  billingFrequency: e.target.value as PricingFactor['billingFrequency'],
                })
              }
            >
              {Object.entries(BILLING_FREQUENCY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn line sm" onClick={() => removeMetric(mi)}>
            {T4.removeMetric}
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="btn soft sm" onClick={addMetric}>
          {T4.addMetric}
        </button>
      </div>
    </div>
  );
};

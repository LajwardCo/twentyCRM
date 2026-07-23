import { type FactorTierSchedule, type TierBand } from '../api/catalog';
import { BILLING_FREQUENCY_LABELS } from '../lib/strings';

// Structured builder for PricingVersion.tierSchedule -- deliberately not a
// raw JSON textarea: this data directly drives every deal's computed price,
// so a hand-typed JSON typo is a real risk. See
// docs/superpowers/specs/2026-07-09-sales-app-catalog-management-design.md.

const EMPTY_BAND: TierBand = { minQty: 1, maxQty: null, mode: 'FLAT', amount: 0 };
const EMPTY_FACTOR: FactorTierSchedule = {
  factor: '',
  billingFrequency: 'MONTHLY',
  bands: [{ ...EMPTY_BAND }],
};

type Props = {
  value: FactorTierSchedule[];
  onChange: (next: FactorTierSchedule[]) => void;
};

export const TierScheduleEditor = ({ value, onChange }: Props) => {
  const updateFactor = (index: number, patch: Partial<FactorTierSchedule>) => {
    onChange(value.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const removeFactor = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addFactor = () => {
    onChange([...value, { ...EMPTY_FACTOR, bands: [{ ...EMPTY_BAND }] }]);
  };

  const updateBand = (factorIndex: number, bandIndex: number, patch: Partial<TierBand>) => {
    updateFactor(factorIndex, {
      bands: value[factorIndex].bands.map((b, i) => (i === bandIndex ? { ...b, ...patch } : b)),
    });
  };

  const removeBand = (factorIndex: number, bandIndex: number) => {
    updateFactor(factorIndex, {
      bands: value[factorIndex].bands.filter((_, i) => i !== bandIndex),
    });
  };

  const addBand = (factorIndex: number) => {
    updateFactor(factorIndex, { bands: [...value[factorIndex].bands, { ...EMPTY_BAND }] });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {value.map((factor, fi) => (
        <div
          key={fi}
          className="card card-pad"
          style={{ background: 'var(--surface-2, rgba(127,127,127,.06))' }}
        >
          <div className="f2">
            <div className="fld">
              <label>نام عامل قیمت‌گذاری *</label>
              <input
                placeholder="مثلاً doctor"
                dir="ltr"
                value={factor.factor}
                onChange={(e) => updateFactor(fi, { factor: e.target.value })}
              />
            </div>
            <div className="fld">
              <label>دوره صورتحساب</label>
              <select
                value={factor.billingFrequency}
                onChange={(e) =>
                  updateFactor(fi, {
                    billingFrequency: e.target.value as FactorTierSchedule['billingFrequency'],
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
          </div>

          <div className="sub" style={{ margin: '10px 0 6px' }}>
            پله‌های قیمت
          </div>
          {factor.bands.map((band, bi) => (
            <div
              key={bi}
              style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8, flexWrap: 'wrap' }}
            >
              <div className="fld" style={{ maxWidth: 90 }}>
                <label>حداقل تعداد</label>
                <input
                  inputMode="numeric"
                  dir="ltr"
                  value={band.minQty}
                  onChange={(e) => updateBand(fi, bi, { minQty: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="fld" style={{ maxWidth: 90 }}>
                <label>حداکثر تعداد</label>
                <input
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="بدون سقف"
                  value={band.maxQty ?? ''}
                  onChange={(e) =>
                    updateBand(fi, bi, { maxQty: e.target.value === '' ? null : Number(e.target.value) })
                  }
                />
              </div>
              <div className="fld" style={{ maxWidth: 130 }}>
                <label>نوع</label>
                <select
                  value={band.mode}
                  onChange={(e) => updateBand(fi, bi, { mode: e.target.value as TierBand['mode'] })}
                >
                  <option value="FLAT">مبلغ ثابت کل</option>
                  <option value="PER_UNIT">به ازای هر واحد</option>
                </select>
              </div>
              <div className="fld" style={{ maxWidth: 110 }}>
                <label>مبلغ</label>
                <input
                  inputMode="decimal"
                  dir="ltr"
                  value={band.amount}
                  onChange={(e) => updateBand(fi, bi, { amount: Number(e.target.value) || 0 })}
                />
              </div>
              <button
                type="button"
                className="btn line sm"
                disabled={factor.bands.length <= 1}
                onClick={() => removeBand(fi, bi)}
              >
                حذف پله
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn soft sm" onClick={() => addBand(fi)}>
              ＋ پله جدید
            </button>
            <button type="button" className="btn line sm" onClick={() => removeFactor(fi)}>
              حذف این عامل
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn soft sm" onClick={addFactor}>
        ＋ عامل قیمت‌گذاری جدید
      </button>
    </div>
  );
};

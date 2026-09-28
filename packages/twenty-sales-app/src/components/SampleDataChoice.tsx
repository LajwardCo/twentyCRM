import { TDATA } from '../lib/strings';

type SampleDataChoiceProps = {
  // null until the agent answers: there is deliberately no default.
  value: boolean | null;
  onChange: (value: boolean) => void;
  // The "with data" card describes demo content or starter data.
  withDataDesc: string;
};

const OPTIONS: { value: boolean; label: string; emoji: string }[] = [
  { value: true, label: TDATA.withData, emoji: '📦' },
  { value: false, label: TDATA.clean, emoji: '🧹' },
];

// Two cards for "create with sample data?" — shared by the demo and the
// customer-system wizards.
export const SampleDataChoice = ({ value, onChange, withDataDesc }: SampleDataChoiceProps) => (
  <div className="fld" style={{ marginTop: 14, marginBottom: 0 }}>
    <label id="sample-data-label">{TDATA.question} *</label>
    <div className="demo-sub-hint" style={{ marginTop: 0, marginBottom: 8 }}>{TDATA.questionHint}</div>
    <div className="demo-biz-grid" role="radiogroup" aria-labelledby="sample-data-label">
      {OPTIONS.map((option) => (
        <button
          type="button"
          key={String(option.value)}
          role="radio"
          aria-checked={value === option.value}
          className={`demo-biz-card ${value === option.value ? 'selected' : ''}`}
          onClick={() => onChange(option.value)}
        >
          <span className="demo-biz-emoji">{option.emoji}</span>
          <span className="demo-biz-label">{option.label}</span>
          <span className="demo-biz-desc">{option.value ? withDataDesc : TDATA.cleanDesc}</span>
        </button>
      ))}
    </div>
  </div>
);

export const sampleDataLabel = (value: boolean | null | undefined): string =>
  value === false ? TDATA.no : TDATA.yes;

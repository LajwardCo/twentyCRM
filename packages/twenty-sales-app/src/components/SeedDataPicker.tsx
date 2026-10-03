import type { SeedOption, SeedOptionKey } from '../lib/seedOptions';
import { TSEED } from '../lib/strings';

type SeedDataPickerProps = {
  options: SeedOption[];
  unticked: Set<SeedOptionKey>;
  onToggle: (key: SeedOptionKey) => void;
};

// After "with sample data", one box per kind of data — all ticked to start, the
// agent unticks what the customer doesn't need. Shared by both wizards.
export const SeedDataPicker = ({ options, unticked, onToggle }: SeedDataPickerProps) => (
  <div className="demo-content-toggles" role="group" aria-labelledby="seed-data-title">
    <div className="demo-toggles-title" id="seed-data-title">{TSEED.title}</div>
    <div className="demo-sub-hint" style={{ marginTop: 0, marginBottom: 6 }}>{TSEED.hint}</div>
    {options.map((option) => (
      <label key={option.key} className="demo-check-row demo-toggle" data-seed-option={option.key}>
        <input type="checkbox" checked={!unticked.has(option.key)} onChange={() => onToggle(option.key)} />
        <span>
          {option.emoji} {option.label}
        </span>
      </label>
    ))}
  </div>
);

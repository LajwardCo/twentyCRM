import { useState } from 'react';

import { toLocalInputValue } from '../lib/format';
import {
  offsetToRemindAt,
  presetFromRemindAt,
  REMINDER_PRESETS,
  type ReminderPreset,
} from '../lib/reminders';
import { T_REMIND } from '../lib/strings';
import { JalaliDatePicker } from './JalaliDatePicker';

type ReminderFieldProps = {
  // "yyyy-mm-ddThh:mm" local value from the parent's due picker
  dueLocal: string;
  remindAt: string | null;
  onChange: (remindAt: string | null) => void;
  id?: string;
};

const PRESET_LABELS: Record<ReminderPreset, string> = {
  none: T_REMIND.presetNone,
  at: T_REMIND.presetAt,
  '15m': T_REMIND.preset15m,
  '1h': T_REMIND.preset1h,
  '1d': T_REMIND.preset1d,
  custom: T_REMIND.presetCustom,
};

const localToIso = (local: string): string | null => {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

// "When should I be told?" as an offset from the due time. The offset is
// derived from the stored absolute remindAt on every render, so a parent
// that shifts remindAt along with dueAt (see shiftRemindAt) keeps the same
// option selected. "Custom" is sticky: the picker it opens starts at the due
// time, which would otherwise read back as "at the same time" and vanish.
export const ReminderField = ({ dueLocal, remindAt, onChange, id }: ReminderFieldProps) => {
  const dueIso = localToIso(dueLocal);
  const derived = presetFromRemindAt(remindAt, dueIso);
  const [customMode, setCustomMode] = useState(derived === 'custom');
  const preset: ReminderPreset = customMode && remindAt !== null ? 'custom' : derived;

  const choose = (next: ReminderPreset) => {
    setCustomMode(next === 'custom');
    if (next === 'custom') {
      onChange(remindAt ?? dueIso ?? new Date().toISOString());
      return;
    }
    onChange(offsetToRemindAt(next, dueIso));
  };

  const customLocal = remindAt
    ? toLocalInputValue(new Date(remindAt))
    : dueLocal || toLocalInputValue(new Date());

  return (
    <div>
      <select id={id} value={preset} onChange={(e) => choose(e.target.value as ReminderPreset)}>
        {REMINDER_PRESETS.map((option) => (
          <option key={option} value={option} disabled={option !== 'none' && option !== 'custom' && dueIso === null}>
            {PRESET_LABELS[option]}
          </option>
        ))}
      </select>
      {preset === 'custom' && (
        <div style={{ marginTop: 8 }}>
          <JalaliDatePicker
            withTime
            value={customLocal}
            onChange={(local) => onChange(localToIso(local))}
          />
        </div>
      )}
    </div>
  );
};

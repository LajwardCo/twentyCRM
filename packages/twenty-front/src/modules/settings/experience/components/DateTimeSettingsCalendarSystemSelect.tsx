import { CalendarSystem } from '@/localization/constants/CalendarSystem';
import { Select } from '@/ui/input/components/Select';
import { useLingui } from '@lingui/react/macro';

type DateTimeSettingsCalendarSystemSelectProps = {
  value: CalendarSystem;
  onChange: (nextValue: CalendarSystem) => void;
};

export const DateTimeSettingsCalendarSystemSelect = ({
  onChange,
  value,
}: DateTimeSettingsCalendarSystemSelectProps) => {
  const { t } = useLingui();

  return (
    <Select
      dropdownId="datetime-settings-calendar-system"
      dropdownWidth={320}
      label={t`Calendar`}
      fullWidth
      value={value}
      pinnedOption={{
        label: t`System settings`,
        value: CalendarSystem.SYSTEM,
        contextualText: t`Gregorian`,
      }}
      options={[
        {
          label: t`Gregorian`,
          value: CalendarSystem.GREGORIAN,
        },
        {
          label: t`Jalali (Shamsi)`,
          value: CalendarSystem.JALALI,
        },
      ]}
      onChange={onChange}
    />
  );
};

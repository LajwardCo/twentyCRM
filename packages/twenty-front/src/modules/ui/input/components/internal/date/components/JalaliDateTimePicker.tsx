import { useDateTimeFormat } from '@/localization/hooks/useDateTimeFormat';
import { JalaliCalendar } from '@/ui/input/components/internal/date/components/JalaliCalendar';
import { useTimeInput } from '@/ui/input/components/internal/date/hooks/useTimeInput';
import { getTimeBlocks } from '@/ui/input/components/internal/date/utils/getTimeBlocks';
import { getTimeMask } from '@/ui/input/components/internal/date/utils/getTimeMask';
import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type Ref, useEffect } from 'react';
import { useIMask } from 'react-imask';
import { type Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { IconCalendarX, IconClock } from 'twenty-ui/icon';
import { MenuItemLeftContent } from 'twenty-ui/navigation';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledContainer = styled.div`
  width: 100%;
`;

const StyledTimeRow = styled.div`
  direction: ltr;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledTimeInputContainer = styled.div`
  align-items: center;
  background-color: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  height: ${themeCssVariables.spacing[8]};
  padding: 0 ${themeCssVariables.spacing[2]};

  &:hover {
    border-color: ${themeCssVariables.border.color.strong};
  }
`;

const StyledClockIcon = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-shrink: 0;
`;

const StyledTimeInput = styled.input`
  background: transparent;
  border: none;
  color: ${themeCssVariables.font.color.primary};
  flex: 1;
  font-family: ${themeCssVariables.font.family};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.regular};
  letter-spacing: 0.05em;
  outline: none;
  width: 100%;

  &::placeholder {
    color: ${themeCssVariables.font.color.light};
    font-weight: ${themeCssVariables.font.weight.medium};
  }
`;

const StyledSeparator = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  height: 1px;
  width: 100%;
`;

const StyledButtonContainer = styled.div`
  align-items: center;
  border-radius: ${themeCssVariables.border.radius.sm};
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  height: 32px;
  margin: ${themeCssVariables.spacing[1]};
  padding: ${themeCssVariables.spacing[1]};
  width: auto;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledButtonContent = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: start;
`;

type JalaliDateTimePickerProps = {
  date: Temporal.ZonedDateTime;
  timeZone: string;
  // JS getDay() index (0 = Sunday .. 6 = Saturday) of the first day of the week.
  calendarStartDay: number;
  clearable?: boolean;
  onChange?: (date: Temporal.ZonedDateTime) => void;
  onClose: (date: Temporal.ZonedDateTime) => void;
  onClear?: () => void;
};

export const JalaliDateTimePicker = ({
  date,
  timeZone,
  calendarStartDay,
  clearable = true,
  onChange,
  onClose,
  onClear,
}: JalaliDateTimePickerProps) => {
  const { timeFormat } = useDateTimeFormat();
  const { formatTime, parseTime, isHour12 } = useTimeInput(timeFormat);

  // Time is calendar-independent (hour/minute), so we reuse the same masked
  // time input the Gregorian picker uses; only the date grid becomes Jalali.
  const { ref: iMaskRef, setValue } = useIMask(
    {
      mask: getTimeMask(timeFormat),
      blocks: getTimeBlocks(timeFormat),
      lazy: false,
      autofix: true,
    },
    {
      defaultValue: formatTime(date.hour, date.minute),
      onComplete: (value) => {
        const parsedTime = parseTime(value);
        if (!isDefined(parsedTime)) {
          return;
        }
        onChange?.(
          date.with({ hour: parsedTime.hour, minute: parsedTime.minute }),
        );
      },
    },
  );

  useEffect(() => {
    setValue(formatTime(date.hour, date.minute));
  }, [date, formatTime, setValue]);

  const handleSelectDay = (pickedPlainDate: Temporal.PlainDate) => {
    const zonedDateTime = pickedPlainDate.toZonedDateTime(timeZone).with({
      hour: date.hour,
      minute: date.minute,
    });
    onClose(zonedDateTime);
  };

  return (
    <StyledContainer>
      <StyledTimeRow>
        <StyledTimeInputContainer>
          <StyledClockIcon>
            <IconClock size={16} />
          </StyledClockIcon>
          <StyledTimeInput
            type="text"
            ref={iMaskRef as Ref<HTMLInputElement>}
            placeholder={isHour12 ? 'HH:mm AA' : 'HH:mm'}
          />
        </StyledTimeInputContainer>
      </StyledTimeRow>
      <StyledSeparator />
      <JalaliCalendar
        selectedPlainDate={date.toPlainDate()}
        onSelect={handleSelectDay}
        calendarStartDay={calendarStartDay}
      />
      {clearable && (
        <>
          <StyledSeparator />
          <StyledButtonContainer onClick={() => onClear?.()}>
            <StyledButtonContent>
              <MenuItemLeftContent LeftIcon={IconCalendarX} text={t`Clear`} />
            </StyledButtonContent>
          </StyledButtonContainer>
        </>
      )}
    </StyledContainer>
  );
};

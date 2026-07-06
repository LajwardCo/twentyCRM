import {
  DARI_MONTH_NAMES,
  PERSIAN_WEEKDAY_SHORT_NAMES,
  toPersianDigits,
} from '@/localization/utils/jalali/jalaliCalendarLabels';
import { Select } from '@/ui/input/components/Select';
import { ClickOutsideListenerContext } from '@/ui/utilities/pointer-event/contexts/ClickOutsideListenerContext';
import { styled } from '@linaria/react';
import {
  addMonths,
  getDate,
  getDay,
  getDaysInMonth,
  getMonth,
  getYear,
  newDate,
  setMonth,
  setYear,
} from 'date-fns-jalali';
import { useState } from 'react';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';
import { IconChevronLeft, IconChevronRight } from 'twenty-ui/icon';
import { LightIconButton } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const JALALI_CALENDAR_MONTH_SELECT_ID = 'jalali-calendar-month-select';
const JALALI_CALENDAR_YEAR_SELECT_ID = 'jalali-calendar-year-select';

const MONTH_OPTIONS = DARI_MONTH_NAMES.map((label, index) => ({
  label,
  value: index,
}));

const StyledContainer = styled.div`
  direction: rtl;
  padding: ${themeCssVariables.spacing[2]};
  width: 100%;
`;

const StyledHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
  justify-content: flex-end;
  margin-bottom: ${themeCssVariables.spacing[2]};
`;

const StyledSelectContainer = styled.div`
  width: 96px;
`;

const StyledYearSelectContainer = styled.div`
  width: 72px;
`;

const StyledGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
`;

const StyledWeekdayName = styled.div`
  align-items: center;
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  height: 34px;
  justify-content: center;
`;

const StyledDayCell = styled.div`
  align-items: center;
  display: flex;
  height: 34px;
  justify-content: center;
`;

const StyledDayButton = styled.button<{ isSelected: boolean }>`
  align-items: center;
  background-color: ${({ isSelected }) =>
    isSelected ? themeCssVariables.color.blue : 'transparent'};
  border: none;
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ isSelected }) =>
    isSelected
      ? themeCssVariables.background.primary
      : themeCssVariables.font.color.primary};
  cursor: pointer;
  display: flex;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.md};
  height: 34px;
  justify-content: center;
  padding: 0;
  width: 34px;

  &:hover {
    background-color: ${({ isSelected }) =>
      isSelected
        ? themeCssVariables.color.blue
        : themeCssVariables.background.transparent.light};
  }
`;

type JalaliCalendarProps = {
  selectedPlainDate: Temporal.PlainDate | null;
  onSelect: (plainDate: Temporal.PlainDate) => void;
  // JS getDay() index (0 = Sunday .. 6 = Saturday) of the first day of the week.
  calendarStartDay: number;
};

const plainDateToLocalDate = (plainDate: Temporal.PlainDate): Date =>
  new Date(plainDate.year, plainDate.month - 1, plainDate.day);

const localDateToPlainDate = (date: Date): Temporal.PlainDate =>
  Temporal.PlainDate.from({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });

export const JalaliCalendar = ({
  selectedPlainDate,
  onSelect,
  calendarStartDay,
}: JalaliCalendarProps) => {
  const initialViewDate = isDefined(selectedPlainDate)
    ? plainDateToLocalDate(selectedPlainDate)
    : new Date();

  const [viewDate, setViewDate] = useState<Date>(initialViewDate);

  const viewJalaliYear = getYear(viewDate);
  const viewJalaliMonth = getMonth(viewDate);

  const firstOfMonth = newDate(viewJalaliYear, viewJalaliMonth, 1);
  const daysInMonth = getDaysInMonth(firstOfMonth);
  const leadingBlankCount = (getDay(firstOfMonth) - calendarStartDay + 7) % 7;

  const selectedLocalDate = isDefined(selectedPlainDate)
    ? plainDateToLocalDate(selectedPlainDate)
    : null;
  const isSelectedInView =
    isDefined(selectedLocalDate) &&
    getYear(selectedLocalDate) === viewJalaliYear &&
    getMonth(selectedLocalDate) === viewJalaliMonth;
  const selectedDay = isSelectedInView ? getDate(selectedLocalDate) : null;

  const weekdayOrder = Array.from(
    { length: 7 },
    (_, index) => (calendarStartDay + index) % 7,
  );

  const currentJalaliYear = getYear(new Date());
  const yearOptions = Array.from({ length: 200 }, (_, index) => {
    const year = currentJalaliYear + 50 - index;
    return { label: toPersianDigits(year), value: year };
  });

  const handleChangeMonth = (month: number) =>
    setViewDate(setMonth(viewDate, month));

  const handleChangeYear = (year: number) =>
    setViewDate(setYear(viewDate, year));

  const handlePreviousMonth = () => setViewDate(addMonths(viewDate, -1));

  const handleNextMonth = () => setViewDate(addMonths(viewDate, 1));

  const handleSelectDay = (day: number) => {
    const pickedLocalDate = newDate(viewJalaliYear, viewJalaliMonth, day);
    onSelect(localDateToPlainDate(pickedLocalDate));
  };

  return (
    <StyledContainer>
      <StyledHeader>
        <StyledSelectContainer>
          <ClickOutsideListenerContext.Provider
            value={{ excludedClickOutsideId: JALALI_CALENDAR_MONTH_SELECT_ID }}
          >
            <Select
              dropdownId={JALALI_CALENDAR_MONTH_SELECT_ID}
              options={MONTH_OPTIONS}
              onChange={handleChangeMonth}
              value={viewJalaliMonth}
              fullWidth
            />
          </ClickOutsideListenerContext.Provider>
        </StyledSelectContainer>
        <StyledYearSelectContainer>
          <ClickOutsideListenerContext.Provider
            value={{ excludedClickOutsideId: JALALI_CALENDAR_YEAR_SELECT_ID }}
          >
            <Select
              dropdownId={JALALI_CALENDAR_YEAR_SELECT_ID}
              options={yearOptions}
              onChange={handleChangeYear}
              value={viewJalaliYear}
              fullWidth
            />
          </ClickOutsideListenerContext.Provider>
        </StyledYearSelectContainer>
        <LightIconButton
          Icon={IconChevronRight}
          onClick={handlePreviousMonth}
          size="medium"
        />
        <LightIconButton
          Icon={IconChevronLeft}
          onClick={handleNextMonth}
          size="medium"
        />
      </StyledHeader>
      <StyledGrid>
        {weekdayOrder.map((weekdayIndex) => (
          <StyledWeekdayName key={`weekday-${weekdayIndex}`}>
            {PERSIAN_WEEKDAY_SHORT_NAMES[weekdayIndex]}
          </StyledWeekdayName>
        ))}
        {Array.from({ length: leadingBlankCount }, (_, index) => (
          <StyledDayCell key={`blank-${index}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          return (
            <StyledDayCell key={`day-${day}`}>
              <StyledDayButton
                type="button"
                isSelected={day === selectedDay}
                onClick={() => handleSelectDay(day)}
              >
                {toPersianDigits(day)}
              </StyledDayButton>
            </StyledDayCell>
          );
        })}
      </StyledGrid>
    </StyledContainer>
  );
};

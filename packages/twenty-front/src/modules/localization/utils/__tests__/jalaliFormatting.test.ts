import { CalendarSystem } from '@/localization/constants/CalendarSystem';
import { DateFormat } from '@/localization/constants/DateFormat';
import { formatDateISOStringToDate } from '@/localization/utils/formatDateISOStringToDate';
import { enUS } from 'date-fns/locale';

// Gregorian 2024-03-20 is the first day of Jalali year 1403 (Hamal 1). We use
// the Afghan Solar Hijri (Dari) month names, so month 1 is "حمل".
describe('Jalali calendar formatting', () => {
  describe('date-only ISO strings', () => {
    it('should render a plain date in the Jalali calendar with Dari month names', () => {
      const result = formatDateISOStringToDate({
        date: '2024-03-20',
        timeZone: 'UTC',
        dateFormat: DateFormat.MONTH_FIRST,
        localeCatalog: enUS,
        calendarSystem: CalendarSystem.JALALI,
      });

      expect(result).toBe('حمل 1, 1403');
    });

    it('should honor the DAY_FIRST format in the Jalali calendar', () => {
      const result = formatDateISOStringToDate({
        date: '2024-03-20',
        timeZone: 'UTC',
        dateFormat: DateFormat.DAY_FIRST,
        localeCatalog: enUS,
        calendarSystem: CalendarSystem.JALALI,
      });

      expect(result).toBe('1 حمل, 1403');
    });

    it('should map the last day of a leap Esfand (1402/12/29) correctly', () => {
      const result = formatDateISOStringToDate({
        date: '2024-03-19',
        timeZone: 'UTC',
        dateFormat: DateFormat.DAY_FIRST,
        localeCatalog: enUS,
        calendarSystem: CalendarSystem.JALALI,
      });

      expect(result).toBe('29 حوت, 1402');
    });
  });

  describe('datetime ISO strings with timezone shifting', () => {
    it('should shift the Jalali day when the timezone rolls the date over', () => {
      // 2024-03-19 20:00 UTC = 2024-03-20 05:00 in Asia/Tokyo (UTC+9),
      // which is Hamal 1, 1403.
      const result = formatDateISOStringToDate({
        date: '2024-03-19T20:00:00Z',
        timeZone: 'Asia/Tokyo',
        dateFormat: DateFormat.DAY_FIRST,
        localeCatalog: enUS,
        calendarSystem: CalendarSystem.JALALI,
      });

      expect(result).toBe('1 حمل, 1403');
    });

    it('should keep the UTC day in the Jalali calendar when timezone is UTC', () => {
      const result = formatDateISOStringToDate({
        date: '2024-03-19T20:00:00Z',
        timeZone: 'UTC',
        dateFormat: DateFormat.DAY_FIRST,
        localeCatalog: enUS,
        calendarSystem: CalendarSystem.JALALI,
      });

      expect(result).toBe('29 حوت, 1402');
    });
  });

  describe('Gregorian calendar remains unchanged', () => {
    it('should render the Gregorian calendar when calendarSystem is GREGORIAN', () => {
      const result = formatDateISOStringToDate({
        date: '2024-03-20',
        timeZone: 'UTC',
        dateFormat: DateFormat.MONTH_FIRST,
        localeCatalog: enUS,
        calendarSystem: CalendarSystem.GREGORIAN,
      });

      expect(result).toBe('Mar 20, 2024');
    });

    it('should default to the Gregorian calendar when calendarSystem is omitted', () => {
      const result = formatDateISOStringToDate({
        date: '2024-03-20',
        timeZone: 'UTC',
        dateFormat: DateFormat.MONTH_FIRST,
        localeCatalog: enUS,
      });

      expect(result).toBe('Mar 20, 2024');
    });
  });
});

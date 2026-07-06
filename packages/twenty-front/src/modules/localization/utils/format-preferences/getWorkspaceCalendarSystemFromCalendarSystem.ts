import { CalendarSystem } from '@/localization/constants/CalendarSystem';
import { WorkspaceMemberCalendarSystemEnum } from '~/generated-metadata/graphql';

export const getWorkspaceCalendarSystemFromCalendarSystem = (
  calendarSystem: CalendarSystem,
) => {
  switch (calendarSystem) {
    case CalendarSystem.SYSTEM:
      return WorkspaceMemberCalendarSystemEnum.SYSTEM;
    case CalendarSystem.JALALI:
      return WorkspaceMemberCalendarSystemEnum.JALALI;
    case CalendarSystem.GREGORIAN:
      return WorkspaceMemberCalendarSystemEnum.GREGORIAN;
    default:
      return WorkspaceMemberCalendarSystemEnum.GREGORIAN;
  }
};

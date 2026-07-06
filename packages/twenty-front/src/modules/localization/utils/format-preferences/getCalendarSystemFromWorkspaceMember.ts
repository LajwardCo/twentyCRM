import { type CurrentWorkspaceMember } from '@/auth/states/currentWorkspaceMemberState';
import { CalendarSystem } from '@/localization/constants/CalendarSystem';
import { type WorkspaceMember } from '@/workspace-member/types/WorkspaceMember';
import { WorkspaceMemberCalendarSystemEnum } from '~/generated-metadata/graphql';

// SYSTEM resolves to Gregorian: the calendar is opt-in and not coupled to the
// UI language, so existing members keep the Gregorian calendar by default.
export const getCalendarSystemFromWorkspaceMember = (
  workspaceMember: WorkspaceMember | CurrentWorkspaceMember,
): CalendarSystem => {
  switch (workspaceMember.calendarSystem) {
    case WorkspaceMemberCalendarSystemEnum.JALALI:
      return CalendarSystem.JALALI;
    case WorkspaceMemberCalendarSystemEnum.GREGORIAN:
    case WorkspaceMemberCalendarSystemEnum.SYSTEM:
      return CalendarSystem.GREGORIAN;
    default:
      return CalendarSystem.GREGORIAN;
  }
};

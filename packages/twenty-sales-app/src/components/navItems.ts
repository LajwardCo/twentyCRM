import { T, T2, T3, T4, T7 } from '../lib/strings';
import {
  IconCalendar,
  IconChart,
  IconContacts,
  IconDailyReport,
  IconDashboard,
  IconFlame,
  IconLeads,
  IconPackage,
  IconTasks,
} from './icons';

export type NavItem = {
  key: string;
  label: string;
  icon: ({ size }: { size?: number }) => React.JSX.Element;
};

// Every destination in the app. The desktop sidebar lists all of them; on
// mobile only MOBILE_TAB_KEYS stay on the bottom bar and the rest live in the
// full-screen menu sheet.
export const NAV: readonly NavItem[] = [
  { key: 'today', label: T.tabToday, icon: IconDashboard },
  { key: 'calendar', label: T2.calendar, icon: IconCalendar },
  { key: 'tasks', label: 'کارها', icon: IconTasks },
  { key: 'leads', label: T.tabLeads, icon: IconLeads },
  { key: 'contacts', label: T7.contacts, icon: IconContacts },
  { key: 'reports', label: T2.reports, icon: IconChart },
  { key: 'daily-report', label: T3.dailyReport, icon: IconDailyReport },
  { key: 'competitors', label: 'بازیگران بازار', icon: IconFlame },
  { key: 'catalog', label: T4.catalog, icon: IconPackage },
  { key: 'admin', label: 'کاربران', icon: IconLeads },
];

// The three screens a seller touches all day long.
export const MOBILE_TAB_KEYS = ['today', 'leads', 'tasks'] as const;

export const MOBILE_TABS: readonly NavItem[] = MOBILE_TAB_KEYS.map(
  (key) => NAV.find((item) => item.key === key) as NavItem,
);

// Detail routes highlight the list tab they belong to.
const ROUTE_TO_NAV_KEY: Record<string, string> = {
  lead: 'leads',
  task: 'tasks',
  new: 'leads',
  company: 'leads',
  person: 'contacts',
  search: 'leads',
};

export const activeNavKey = (parts: string[]): string => {
  const section = parts[0] ?? 'today';
  return ROUTE_TO_NAV_KEY[section] ?? section;
};

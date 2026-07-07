import { type ReactNode } from 'react';

import { type CurrentUser } from '../api/auth';
import logoSquare from '../assets/usystems-square.png';
import { jalaliToday } from '../lib/jalali';
import { navigate, useRoute } from '../lib/router';
import { T, T2 } from '../lib/strings';
import {
  dockAdd,
  getDockablePage,
  useDock,
  type DockKind,
} from '../lib/workbench';
import { Dock } from './Dock';
import {
  IconChart,
  IconChevronDown,
  IconDashboard,
  IconFlame,
  IconLeads,
  IconLogout,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
  IconTasks,
} from './icons';

// fallback dock labels when a view hasn't announced one yet
const routeDockDefaults = (
  parts: string[],
): { label: string; kind: DockKind } => {
  const [section] = parts;
  if (section === 'lead') return { label: T.lead, kind: 'lead' };
  if (section === 'task') return { label: T.task, kind: 'task' };
  if (section === 'new') return { label: T.newLead, kind: 'new' };
  if (section === 'reports') return { label: T2.reports, kind: 'page' };
  if (section === 'leads') return { label: T.leads, kind: 'page' };
  if (section === 'tasks') return { label: 'کارها', kind: 'page' };
  return { label: T.tabToday, kind: 'page' };
};

type AppShellProps = {
  user: CurrentUser;
  onLogout: () => void;
  children: ReactNode;
  // rendered inside the sticky command bar (e.g. search box or back button)
  bar?: ReactNode;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenPalette: () => void;
};

const NAV = [
  { key: 'today', label: T.tabToday, icon: IconDashboard },
  { key: 'tasks', label: 'کارها', icon: IconTasks },
  { key: 'leads', label: T.tabLeads, icon: IconLeads },
  { key: 'reports', label: T2.reports, icon: IconChart },
  { key: 'competitors', label: 'رقبا', icon: IconFlame },
  { key: 'admin', label: 'کاربران', icon: IconLeads },
] as const;

export const AppShell = ({
  user,
  onLogout,
  children,
  bar,
  theme,
  onToggleTheme,
  onOpenPalette,
}: AppShellProps) => {
  const route = useRoute();
  const dockItems = useDock();
  const active =
    route.parts[0] === 'lead' ? 'leads' : (route.parts[0] ?? 'today');

  // pages worth minimizing: anything that isn't the dashboard itself
  const minimizable = route.parts.length > 0 && route.parts[0] !== 'today';

  const minimizePage = () => {
    const announced = getDockablePage();
    const fallback = routeDockDefaults(route.parts);
    dockAdd({
      route: `/${route.path}`,
      label: announced?.label ?? fallback.label,
      kind: announced?.kind ?? fallback.kind,
    });
    navigate('/today');
  };

  return (
    <div className={`shell ${dockItems.length > 0 ? 'has-dock' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <img className="mark" src={logoSquare} alt="Usystems" />
          <div>
            <b>{T.brand}</b>
            <small>{T.brandSub}</small>
          </div>
        </div>
        <div className="side-cta">
          <button onClick={() => navigate('/new')}>
            <IconPlus size={15} />
            {T.newLead}
          </button>
        </div>
        <nav className="nav">
          <div className="nav-lbl">منو</div>
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`nav-item ${active === key ? 'on' : ''}`}
              onClick={() => navigate(`/${key}`)}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
          <button
            className="nav-item m-cta only-mobile"
            onClick={() => navigate('/new')}
          >
            <IconPlus size={18} />
            {T.tabNew}
          </button>
        </nav>
        <div className="side-user">
          <span className="avatar">{user.firstName.charAt(0) || 'ک'}</span>
          <div className="u-info">
            {user.firstName}
            <small>{user.userEmail}</small>
          </div>
          <button className="out" onClick={onLogout} aria-label={T.signOut}>
            <IconLogout size={16} />
          </button>
        </div>
      </aside>

      <div className="content">
        <div className="cmd-bar">
          {bar}
          <div className="cmd-right">
            <span className="cmd-date">{jalaliToday()}</span>
            {minimizable && (
              <button
                className="icon-btn"
                onClick={minimizePage}
                title="کوچک‌سازی این صفحه (به نوار پایین)"
                aria-label="کوچک‌سازی صفحه"
              >
                <IconChevronDown size={16} />
              </button>
            )}
            <button
              className="icon-btn"
              onClick={onOpenPalette}
              title="جستجو و فرمان‌ها (Ctrl+K)"
              aria-label="جستجو"
            >
              <IconSearch size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'حالت روشن' : 'حالت تاریک'}
              aria-label="تغییر حالت نمایش"
            >
              {theme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
          </div>
        </div>
        {children}
        <Dock />
      </div>
    </div>
  );
};

type CmdSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export const CmdSearch = ({ value, onChange, placeholder }: CmdSearchProps) => (
  <div className="cmd-search">
    <span className="s-ico">
      <IconSearch size={16} />
    </span>
    <input
      type="search"
      placeholder={placeholder ?? T.searchLeads}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  </div>
);

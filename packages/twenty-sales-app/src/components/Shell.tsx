import { type ReactNode } from 'react';

import { type CurrentUser } from '../api/auth';
import logoSquare from '../assets/usystems-square.png';
import { jalaliToday } from '../lib/jalali';
import { navigate, useRoute } from '../lib/router';
import { T, T2 } from '../lib/strings';
import {
  IconChart,
  IconDashboard,
  IconLeads,
  IconLogout,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
} from './icons';

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
  { key: 'leads', label: T.tabLeads, icon: IconLeads },
  { key: 'reports', label: T2.reports, icon: IconChart },
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
  const active =
    route.parts[0] === 'lead' ? 'leads' : (route.parts[0] ?? 'today');

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img className="mark" src={logoSquare} alt="Usystems" />
          <div>
            <b>{T.appName}</b>
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

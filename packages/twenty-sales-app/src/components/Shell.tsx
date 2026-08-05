import { useEffect, useState, type ReactNode } from 'react';

import { type CurrentUser } from '../api/auth';
import logoSquare from '../assets/usystems-square.png';
import { jalaliToday } from '../lib/jalali';
import { goBackOr, navigate, useRoute } from '../lib/router';
import { T, T2, T3, T4 } from '../lib/strings';
import {
  dockAdd,
  getDockablePage,
  useDock,
  type DockKind,
} from '../lib/workbench';
import { Dock } from './Dock';
import {
  IconChevronDown,
  IconLogout,
  IconMoon,
  IconPlus,
  IconSearch,
  IconSun,
} from './icons';
import { MobileMenu } from './MobileMenu';
import { MobileNav } from './MobileNav';
import { activeNavKey, NAV } from './navItems';

// fallback dock labels when a view hasn't announced one yet
const routeDockDefaults = (
  parts: string[],
): { label: string; kind: DockKind } => {
  const [section] = parts;
  if (section === 'lead') return { label: T.lead, kind: 'lead' };
  if (section === 'task') return { label: T.task, kind: 'task' };
  if (section === 'new') return { label: T.newLead, kind: 'new' };
  if (section === 'reports') return { label: T2.reports, kind: 'page' };
  if (section === 'daily-report') return { label: T3.dailyReport, kind: 'page' };
  if (section === 'leads') return { label: T.leads, kind: 'page' };
  if (section === 'tasks') return { label: 'کارها', kind: 'page' };
  if (section === 'calendar') return { label: T2.calendar, kind: 'page' };
  if (section === 'catalog') return { label: T4.catalog, kind: 'page' };
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
  const active = activeNavKey(route.parts);
  const [menuOpen, setMenuOpen] = useState(false);

  // a back/forward navigation should never leave the sheet covering the page
  useEffect(() => {
    setMenuOpen(false);
  }, [route.path]);

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
    // Minimizing puts the page away; it should reveal whatever was underneath
    // -- the list the seller came from -- not jump to the dashboard.
    goBackOr('/today');
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

      <MobileNav menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
      {menuOpen && (
        <MobileMenu
          user={user}
          theme={theme}
          onClose={() => setMenuOpen(false)}
          onLogout={onLogout}
          onToggleTheme={onToggleTheme}
          onOpenPalette={onOpenPalette}
        />
      )}
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

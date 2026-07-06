import { useCallback, useEffect, useState } from 'react';

import { fetchCurrentUser, logout, type CurrentUser } from './api/auth';
import { loadTokens, setSessionExpiredHandler } from './api/client';
import { CommandPalette } from './components/CommandPalette';
import { IconBack } from './components/icons';
import { AppShell, CmdSearch } from './components/Shell';
import { invalidateCache } from './lib/cache';
import { applyTheme, loadPrefs, resolveTheme, savePref } from './lib/prefs';
import { navigate, useRoute } from './lib/router';
import { T } from './lib/strings';
import { LeadChatView } from './views/LeadChatView';
import { LeadDetailView } from './views/LeadDetailView';
import { LeadsView } from './views/LeadsView';
import { AdminView } from './views/AdminView';
import { CompetitorsView } from './views/CompetitorsView';
import { LoginView } from './views/LoginView';
import { NewLeadView } from './views/NewLeadView';
import { ReportsView } from './views/ReportsView';
import { TasksView } from './views/TasksView';
import { TaskView } from './views/TaskView';
import { TodayView } from './views/TodayView';

type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'ready'; user: CurrentUser };

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
};

export const App = () => {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    resolveTheme(loadPrefs().theme),
  );
  const route = useRoute();

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    savePref('theme', next);
  };

  const bootstrap = useCallback(async () => {
    if (loadTokens() === null) {
      setSession({ status: 'anonymous' });
      return;
    }
    try {
      const user = await fetchCurrentUser();
      setSession({ status: 'ready', user });
    } catch {
      setSession({ status: 'anonymous' });
    }
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      invalidateCache();
      setSession({ status: 'anonymous' });
    });
    void bootstrap();
  }, [bootstrap]);

  // global shortcuts: Ctrl/Cmd+K palette, N new lead (outside inputs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        navigate('/new');
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (session.status === 'loading') {
    return (
      <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="skeleton" style={{ height: 44, maxWidth: 440 }} />
        <div className="skeleton" style={{ height: 120 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  if (session.status === 'anonymous') {
    return <LoginView onLoggedIn={() => void bootstrap()} />;
  }

  const { user } = session;
  const [section, param, sub] = route.parts;

  const handleLogout = () => {
    logout();
    invalidateCache();
    setSession({ status: 'anonymous' });
  };

  const backButton = (
    <button className="btn line sm" onClick={() => window.history.back()}>
      <IconBack size={15} />
      {T.leads}
    </button>
  );

  let view: React.ReactNode;
  let bar: React.ReactNode = null;

  if (section === 'task' && param) {
    view = <TaskView taskId={param} user={user} />;
    bar = (
      <button className="btn line sm" onClick={() => window.history.back()}>
        <IconBack size={15} />
        {T.tabToday}
      </button>
    );
  } else if (section === 'lead' && param && sub === 'chat') {
    view = <LeadChatView leadId={param} />;
    bar = backButton;
  } else if (section === 'lead' && param) {
    view = <LeadDetailView leadId={param} user={user} />;
    bar = backButton;
  } else if (section === 'leads') {
    view = <LeadsView user={user} search={search} />;
    bar = <CmdSearch value={search} onChange={setSearch} />;
  } else if (section === 'new') {
    view = <NewLeadView user={user} />;
  } else if (section === 'tasks') {
    view = <TasksView user={user} />;
  } else if (section === 'reports') {
    view = <ReportsView user={user} />;
  } else if (section === 'competitors') {
    view = <CompetitorsView />;
  } else if (section === 'admin') {
    view = <AdminView />;
  } else {
    view = <TodayView user={user} />;
  }

  return (
    <AppShell
      user={user}
      onLogout={handleLogout}
      bar={bar}
      theme={theme}
      onToggleTheme={toggleTheme}
      onOpenPalette={() => setPaletteOpen(true)}
    >
      {view}
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </AppShell>
  );
};

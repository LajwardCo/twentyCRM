import { useCallback, useEffect, useState } from 'react';

import { fetchCurrentUser, logout, type CurrentUser } from './api/auth';
import { loadTokens, setSessionExpiredHandler } from './api/client';
import { IconBack } from './components/icons';
import { AppShell, CmdSearch } from './components/Shell';
import { useRoute } from './lib/router';
import { T } from './lib/strings';
import { LeadChatView } from './views/LeadChatView';
import { LeadDetailView } from './views/LeadDetailView';
import { LeadsView } from './views/LeadsView';
import { LoginView } from './views/LoginView';
import { NewLeadView } from './views/NewLeadView';
import { TodayView } from './views/TodayView';

type Session =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'ready'; user: CurrentUser };

export const App = () => {
  const [session, setSession] = useState<Session>({ status: 'loading' });
  const [search, setSearch] = useState('');
  const route = useRoute();

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
    setSessionExpiredHandler(() => setSession({ status: 'anonymous' }));
    void bootstrap();
  }, [bootstrap]);

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

  if (section === 'lead' && param && sub === 'chat') {
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
  } else {
    view = <TodayView user={user} />;
  }

  return (
    <AppShell user={user} onLogout={handleLogout} bar={bar}>
      {view}
    </AppShell>
  );
};

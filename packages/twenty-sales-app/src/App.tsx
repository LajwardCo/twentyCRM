import { useCallback, useEffect, useState } from 'react';

import { fetchCurrentUser, logout, type CurrentUser } from './api/auth';
import { loadTokens, setSessionExpiredHandler } from './api/client';
import { TabBar } from './components/Shell';
import { useRoute } from './lib/router';
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
    return <div className="spinner" />;
  }

  if (session.status === 'anonymous') {
    return <LoginView onLoggedIn={() => void bootstrap()} />;
  }

  const { user } = session;
  const [section, param, sub] = route.parts;

  let view: React.ReactNode;
  let showTabs = true;

  if (section === 'lead' && param && sub === 'chat') {
    view = <LeadChatView leadId={param} />;
    showTabs = false;
  } else if (section === 'lead' && param) {
    view = <LeadDetailView leadId={param} user={user} />;
  } else if (section === 'leads') {
    view = <LeadsView user={user} />;
  } else if (section === 'new') {
    view = <NewLeadView user={user} />;
  } else {
    view = <TodayView user={user} onLogout={() => {
      logout();
      setSession({ status: 'anonymous' });
    }} />;
  }

  return (
    <div className="app-shell">
      {view}
      {showTabs && <TabBar />}
    </div>
  );
};

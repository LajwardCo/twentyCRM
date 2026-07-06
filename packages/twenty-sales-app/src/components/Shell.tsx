import { type ReactNode } from 'react';

import { navigate, useRoute } from '../lib/router';
import { IconBack, IconLeads, IconPlus, IconToday } from './icons';

type TopBarProps = {
  title: string;
  showBack?: boolean;
  right?: ReactNode;
};

export const TopBar = ({ title, showBack, right }: TopBarProps) => (
  <header className="top-bar">
    {showBack === true && (
      <button
        className="btn ghost small"
        style={{ padding: '6px 8px' }}
        onClick={() => window.history.back()}
        aria-label="Back"
      >
        <IconBack size={20} />
      </button>
    )}
    <h1>{title}</h1>
    {right}
  </header>
);

const TABS = [
  { key: 'today', label: 'Today', icon: IconToday },
  { key: 'leads', label: 'Leads', icon: IconLeads },
  { key: 'new', label: 'New Lead', icon: IconPlus },
] as const;

export const TabBar = () => {
  const route = useRoute();
  const active = route.parts[0] ?? 'today';

  return (
    <nav className="tab-bar">
      <div className="tab-bar-inner">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`tab-item ${active === key ? 'active' : ''}`}
            onClick={() => navigate(`/${key}`)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
};

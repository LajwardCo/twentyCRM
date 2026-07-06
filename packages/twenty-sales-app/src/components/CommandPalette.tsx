import { useEffect, useRef, useState } from 'react';

import { fetchLeads, type LeadSummary } from '../api/records';
import { navigate } from '../lib/router';
import { STAGE_LABELS, T } from '../lib/strings';
import { IconDashboard, IconLeads, IconPlus, IconSearch } from './icons';

type CommandPaletteProps = {
  onClose: () => void;
};

type Item = {
  key: string;
  label: string;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
};

export const CommandPalette = ({ onClose }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number>(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (query.trim() === '') {
      setLeads([]);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        setLeads(await fetchLeads({ search: query.trim(), limit: 6 }));
      } catch {
        setLeads([]);
      }
    }, 200);
    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const actions: Item[] = [
    {
      key: 'new',
      label: T.newLead,
      hint: 'N',
      icon: <IconPlus size={16} />,
      run: () => go('/new'),
    },
    {
      key: 'today',
      label: T.tabToday,
      icon: <IconDashboard size={16} />,
      run: () => go('/today'),
    },
    {
      key: 'tasks',
      label: 'کارها',
      icon: <IconLeads size={16} />,
      run: () => go('/tasks'),
    },
    {
      key: 'leads',
      label: T.tabLeads,
      icon: <IconLeads size={16} />,
      run: () => go('/leads'),
    },
  ].filter(
    (a) => query.trim() === '' || a.label.includes(query.trim()),
  );

  const items: Item[] = [
    ...leads.map((lead) => ({
      key: lead.id,
      label: lead.name,
      hint: STAGE_LABELS[lead.stage ?? ''] ?? undefined,
      icon: <span className="deal-logo" style={{ width: 24, height: 24, fontSize: 11, borderRadius: 7 }}>{lead.name.charAt(0)}</span>,
      run: () => go(`/lead/${lead.id}`),
    })),
    ...actions,
  ];

  const clampedActive = Math.min(active, Math.max(0, items.length - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[clampedActive]?.run();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-box" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="cp-input">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            placeholder="جستجوی لید یا فرمان…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <span className="cp-kbd">Esc</span>
        </div>
        <div className="cp-list">
          {items.length === 0 && (
            <div className="empty-state" style={{ padding: '22px 0' }}>
              {T.noLeadsFound}
            </div>
          )}
          {items.map((item, index) => (
            <button
              key={item.key}
              className={`cp-item ${index === clampedActive ? 'on' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={item.run}
            >
              {item.icon}
              <span className="cp-label">{item.label}</span>
              {item.hint && <span className="cp-hint">{item.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

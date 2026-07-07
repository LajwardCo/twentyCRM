import { useEffect, useRef, useState } from 'react';

import { enrichedGlobalSearch, type EnrichedHit } from '../api/deepSearch';
import {
  fetchLeads,
  searchHitRoute,
  type LeadSummary,
} from '../api/records';
import { startBackgroundSearch } from '../lib/backgroundSearch';
import { Highlight } from './Highlight';
import { navigate } from '../lib/router';
import { loadPrefs, savePref } from '../lib/prefs';
import { STAGE_LABELS, T } from '../lib/strings';
import {
  IconBuilding,
  IconDashboard,
  IconLeads,
  IconNote,
  IconPlus,
  IconSearch,
  IconTasks,
} from './icons';

type CommandPaletteProps = {
  onClose: () => void;
};

type Item = {
  key: string;
  label: string;
  desc?: string | null;
  hint?: string;
  icon?: React.ReactNode;
  run: () => void;
};

const HIT_TYPE_FA: Record<string, string> = {
  opportunity: 'لید',
  person: 'شخص',
  company: 'شرکت',
  task: 'وظیفه',
  note: 'یادداشت',
};

const hitIcon = (type: string) => {
  if (type === 'company') return <IconBuilding size={16} />;
  if (type === 'task') return <IconTasks size={16} />;
  if (type === 'note') return <IconNote size={16} />;
  if (type === 'person') return <IconLeads size={16} />;
  return (
    <span
      className="deal-logo"
      style={{ width: 24, height: 24, fontSize: 11, borderRadius: 7 }}
    >
      ل
    </span>
  );
};

export const CommandPalette = ({ onClose }: CommandPaletteProps) => {
  const [query, setQuery] = useState('');
  const [deep, setDeepState] = useState(() => loadPrefs().deepSearch ?? false);
  const [leads, setLeads] = useState<LeadSummary[]>([]);
  const [hits, setHits] = useState<EnrichedHit[]>([]);
  const [searching, setSearching] = useState(false);
  const resolving: string | null = null;
  const notice: string | null = null;
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number>(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const setDeep = (value: boolean) => {
    setDeepState(value);
    savePref('deepSearch', value);
    setHits([]);
    setLeads([]);
    setActive(0);
    inputRef.current?.focus();
  };

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (query.trim() === '') {
      setLeads([]);
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++requestSeq.current;
    debounceRef.current = window.setTimeout(
      async () => {
        try {
          if (deep) {
            const found = await enrichedGlobalSearch(query.trim(), 16);
            if (seq === requestSeq.current) setHits(found);
          } else {
            const found = await fetchLeads({ search: query.trim(), limit: 6 });
            if (seq === requestSeq.current) setLeads(found);
          }
        } catch {
          if (seq === requestSeq.current) {
            setHits([]);
            setLeads([]);
          }
        } finally {
          if (seq === requestSeq.current) setSearching(false);
        }
      },
      deep ? 300 : 200,
    );
    return () => window.clearTimeout(debounceRef.current);
  }, [query, deep]);

  const go = (to: string) => {
    navigate(to);
    onClose();
  };

  const openHit = (hit: EnrichedHit) => {
    go(searchHitRoute(hit));
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
      icon: <IconTasks size={16} />,
      run: () => go('/tasks'),
    },
    {
      key: 'leads',
      label: T.tabLeads,
      icon: <IconLeads size={16} />,
      run: () => go('/leads'),
    },
  ].filter((a) => query.trim() === '' || a.label.includes(query.trim()));

  const resultItems: Item[] = deep
    ? hits.map((hit) => ({
        key: hit.recordId,
        label: hit.label || '—',
        desc: hit.description,
        hint: HIT_TYPE_FA[hit.objectNameSingular] ?? hit.objectNameSingular,
        icon: hitIcon(hit.objectNameSingular),
        run: () => openHit(hit),
      }))
    : leads.map((lead) => ({
        key: lead.id,
        label: lead.name,
        hint: STAGE_LABELS[lead.stage ?? ''] ?? undefined,
        icon: (
          <span
            className="deal-logo"
            style={{ width: 24, height: 24, fontSize: 11, borderRadius: 7 }}
          >
            {lead.name.charAt(0)}
          </span>
        ),
        run: () => go(`/lead/${lead.id}`),
      }));

  const items: Item[] = [...resultItems, ...actions];
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
    } else if (e.key === 'Tab') {
      // Tab flips between fast and deep search
      e.preventDefault();
      setDeep(!deep);
    }
  };

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-box" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="cp-input">
          <IconSearch size={16} />
          <input
            ref={inputRef}
            placeholder={
              deep
                ? 'جستجو در همه‌چیز — یادداشت‌ها، وظایف، متن‌ها…'
                : 'جستجوی لید یا فرمان…'
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <span className="cp-kbd">Esc</span>
        </div>

        <div className="cp-modes">
          <button className={!deep ? 'on' : ''} onClick={() => setDeep(false)}>
            سریع
          </button>
          <button className={deep ? 'on' : ''} onClick={() => setDeep(true)}>
            🔎 عمیق — داخل یادداشت‌ها و وظایف
          </button>
          {deep && query.trim() !== '' && (
            <button
              className="cp-bg-btn"
              onClick={() => {
                startBackgroundSearch(query.trim());
                onClose();
              }}
              title="جستجو در پس‌زمینه ادامه می‌یابد و به تب‌ها اضافه می‌شود"
            >
              🕐 در پس‌زمینه
            </button>
          )}
          <span className="cp-kbd" style={{ marginRight: 'auto' }}>
            Tab
          </span>
        </div>

        <div className="cp-list">
          {searching && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 6 }}>
              <div className="skeleton" style={{ height: 34 }} />
              <div className="skeleton" style={{ height: 34 }} />
            </div>
          )}
          {notice !== null && (
            <div className="empty-state" style={{ padding: '10px 0' }}>
              {notice}
            </div>
          )}
          {!searching && items.length === 0 && (
            <div className="empty-state" style={{ padding: '22px 0' }}>
              {T.noLeadsFound}
            </div>
          )}
          {!searching &&
            items.map((item, index) => (
              <button
                key={item.key}
                className={`cp-item ${index === clampedActive ? 'on' : ''}`}
                onMouseEnter={() => setActive(index)}
                onClick={item.run}
                disabled={resolving !== null}
              >
                {item.icon}
                <span className="cp-main">
                  <span className="cp-label">
                    {resolving === item.key ? (
                      '…'
                    ) : deep ? (
                      <Highlight text={item.label} query={query} />
                    ) : (
                      item.label
                    )}
                  </span>
                  {item.desc && (
                    <span className="cp-desc">
                      <Highlight text={item.desc} query={query} />
                    </span>
                  )}
                </span>
                {item.hint && <span className="cp-hint">{item.hint}</span>}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
};

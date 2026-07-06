import { useEffect, useRef, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchLeads,
  stageLabel,
  type LeadSummary,
} from '../api/records';
import { TopBar } from '../components/Shell';
import { formatDate, personName } from '../lib/format';
import { navigate } from '../lib/router';

type LeadsViewProps = {
  user: CurrentUser;
};

const temperatureBadge = (temperature: string | null) => {
  if (!temperature) return null;
  const cls = temperature.toLowerCase();
  return <span className={`badge ${cls}`}>{temperature}</span>;
};

export const LeadsView = ({ user }: LeadsViewProps) => {
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number>(0);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        setLeads(
          await fetchLeads({
            search: search.trim() || undefined,
            ownerId: mineOnly ? user.workspaceMemberId : undefined,
          }),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leads');
      }
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [search, mineOnly, user.workspaceMemberId]);

  return (
    <>
      <TopBar title="Leads" />
      <main className="app-main">
        <div className="field" style={{ marginBottom: 10 }}>
          <input
            type="search"
            placeholder="Search leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="segmented" style={{ marginBottom: 14 }}>
          <button
            className={mineOnly ? 'selected' : ''}
            onClick={() => setMineOnly(true)}
          >
            My Leads
          </button>
          <button
            className={!mineOnly ? 'selected' : ''}
            onClick={() => setMineOnly(false)}
          >
            All Leads
          </button>
        </div>

        {error !== null && <div className="error-banner">{error}</div>}
        {leads === null && error === null && <div className="spinner" />}

        {leads !== null && leads.length === 0 && (
          <div className="empty-state">No leads found</div>
        )}

        {leads?.map((lead) => (
          <button
            key={lead.id}
            className="list-row"
            onClick={() => navigate(`/lead/${lead.id}`)}
          >
            <div className="list-row-main">
              <div className="list-row-title">{lead.name}</div>
              <div className="list-row-sub">
                {lead.pointOfContact
                  ? personName(lead.pointOfContact)
                  : 'No contact'}{' '}
                · {formatDate(lead.createdAt)}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span className="badge stage">{stageLabel(lead.stage)}</span>
                {temperatureBadge(lead.temperature)}
              </div>
            </div>
          </button>
        ))}
      </main>
      <button className="fab" aria-label="New lead" onClick={() => navigate('/new')}>
        +
      </button>
    </>
  );
};

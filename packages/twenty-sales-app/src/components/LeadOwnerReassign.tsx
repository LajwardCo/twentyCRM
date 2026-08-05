import { useState } from 'react';

import { type Member } from '../api/admin';
import { fetchLeads, type LeadSummary, updateLead } from '../api/records';
import { personName } from '../lib/format';
import { T10 } from '../lib/strings';

// Admin-only lead reassignment. Leads stay attached to sellers who have left
// or been reassigned, and nothing else in the app can move them -- a seller
// can only see their own. Uses the existing opportunity.owner relation, so no
// provisioning is involved; the server enforces the permission either way.

type Props = {
  members: Member[];
  onDone: (message: string) => void;
};

export const LeadOwnerReassign = ({ members, onDone }: Props) => {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LeadSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<LeadSummary | null>(null);
  const [ownerId, setOwnerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async () => {
    if (search.trim() === '') return;
    setSearching(true);
    setError(null);
    try {
      setResults(await fetchLeads({ search: search.trim(), limit: 20 }));
    } catch {
      setError(T10.reassignFailed);
    } finally {
      setSearching(false);
    }
  };

  const apply = async () => {
    if (selected === null || ownerId === '') return;
    setBusy(true);
    setError(null);
    try {
      await updateLead(selected.id, { ownerId });
      setSelected(null);
      setOwnerId('');
      setResults([]);
      setSearch('');
      onDone(T10.reassignDone);
    } catch {
      setError(T10.reassignFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card card-pad anim d3">
      <h3>{T10.reassignSection}</h3>
      <div className="sub">{T10.reassignHint}</div>

      {error !== null && <div className="err">{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <div className="fld" style={{ flex: 1, minWidth: 160 }}>
          <input
            value={search}
            placeholder={T10.reassignSearchPlaceholder}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void runSearch();
            }}
          />
        </div>
        <button
          type="button"
          className="btn soft sm"
          disabled={searching || search.trim() === ''}
          onClick={() => void runSearch()}
        >
          {T10.reassignPickLead}
        </button>
      </div>

      {results.length > 0 && selected === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {results.map((lead) => (
            <button
              key={lead.id}
              type="button"
              className="btn line sm"
              style={{ justifyContent: 'space-between' }}
              onClick={() => setSelected(lead)}
            >
              <span>{lead.name}</span>
              <span className="t-sub">
                {lead.owner === null ? '—' : personName(lead.owner)}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <div className="c-row">
            <span>{selected.name}</span>
            <b>{selected.owner === null ? '—' : personName(selected.owner)}</b>
          </div>
          <div className="fld">
            <label>{T10.reassignPickOwner}</label>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">{T10.reassignPickOwner}</option>
              {members
                // Reassigning to the current owner is a no-op that reads like
                // it worked, so it isn't offered.
                .filter((member) => member.id !== selected.owner?.id)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {personName(member)}
                  </option>
                ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn gold sm"
              disabled={busy || ownerId === ''}
              onClick={() => void apply()}
            >
              {T10.reassignApply}
            </button>
            <button
              type="button"
              className="btn line sm"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              {T10.reassignPickLead}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

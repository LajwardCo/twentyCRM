import { useEffect, useMemo, useRef, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchLeads,
  OPEN_STAGES,
  type LeadSummary,
} from '../api/records';
import { IconKanban, IconPlus, IconTable } from '../components/icons';
import { formatAfn, fullPhone, personName, sumAmountMicros } from '../lib/format';
import { relativeDueLabel, toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { SOURCE_LABELS, STAGE_LABELS, T, TEMP_LABELS } from '../lib/strings';

type LeadsViewProps = {
  user: CurrentUser;
  search: string;
};

const TempDot = ({ temperature }: { temperature: string | null }) =>
  temperature ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span className={`tdot ${temperature.toLowerCase()}`} />
      {TEMP_LABELS[temperature]?.replace(/^\S+\s/, '') ?? temperature}
    </span>
  ) : (
    <span style={{ color: 'var(--ink-3)' }}>—</span>
  );

export const LeadsView = ({ user, search }: LeadsViewProps) => {
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [mineOnly, setMineOnly] = useState(true);
  const [openOnly, setOpenOnly] = useState(true);
  const [view, setView] = useState<'table' | 'kanban'>('table');
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
            openOnly,
            limit: 100,
          }),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : T.loadFailed);
      }
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [search, mineOnly, openOnly, user.workspaceMemberId]);

  const openValue = useMemo(
    () =>
      sumAmountMicros(
        (leads ?? []).filter((l) => l.stage && OPEN_STAGES.includes(l.stage)),
      ),
    [leads],
  );

  const kanbanCols = useMemo(() => {
    const stages = openOnly
      ? OPEN_STAGES
      : [...OPEN_STAGES, 'ACTIVE_CUSTOMER', 'LOST_MISSED'];
    return stages
      .map((stage) => {
        const items = (leads ?? []).filter((l) => l.stage === stage);
        return { stage, items, value: sumAmountMicros(items) };
      })
      .filter((col) => col.items.length > 0);
  }, [leads, openOnly]);

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T.leads}</h1>
          <div className="sub">
            {leads !== null &&
              `${toPersianDigits(leads.length)} لید${
                openValue > 0 ? ` · ارزش باز ${formatAfn(openValue)}` : ''
              }`}
          </div>
        </div>
        <button className="btn gold" onClick={() => navigate('/new')}>
          <IconPlus size={15} />
          {T.newLead}
        </button>
      </div>

      <div className="toolbar anim d1">
        <div className="seg">
          <button className={mineOnly ? 'on' : ''} onClick={() => setMineOnly(true)}>
            {T.myLeads}
          </button>
          <button className={!mineOnly ? 'on' : ''} onClick={() => setMineOnly(false)}>
            {T.allLeads}
          </button>
        </div>
        <div className="seg">
          <button className={openOnly ? 'on' : ''} onClick={() => setOpenOnly(true)}>
            باز
          </button>
          <button className={!openOnly ? 'on' : ''} onClick={() => setOpenOnly(false)}>
            همه مراحل
          </button>
        </div>
        <div className="grow" />
        <div className="seg only-desktop">
          <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>
            <IconTable size={14} />
            جدول
          </button>
          <button className={view === 'kanban' ? 'on' : ''} onClick={() => setView('kanban')}>
            <IconKanban size={14} />
            کانبان
          </button>
        </div>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {leads === null && error === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 58 }} />
          ))}
        </div>
      )}

      {leads !== null && leads.length === 0 && (
        <div className="empty-state">{T.noLeadsFound}</div>
      )}

      {/* desktop: table or kanban */}
      {leads !== null && leads.length > 0 && view === 'table' && (
        <div className="card anim d2 only-desktop" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="leads">
              <thead>
                <tr>
                  <th>شرکت</th>
                  <th>{T.stage}</th>
                  <th>{T.temperature}</th>
                  <th>ارزش</th>
                  <th>{T.leadSource}</th>
                  <th>{T.owner}</th>
                  <th>ثبت</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} onClick={() => navigate(`/lead/${lead.id}`)}>
                    <td>
                      <div className="lead-cell">
                        <span className="deal-logo">{lead.name.charAt(0)}</span>
                        <span className="lead-name">
                          {lead.name}
                          <small>
                            {lead.pointOfContact
                              ? `${personName(lead.pointOfContact)}${
                                  fullPhone(lead.pointOfContact.phones)
                                    ? ` · ${toPersianDigits(fullPhone(lead.pointOfContact.phones) ?? '')}`
                                    : ''
                                }`
                              : T.noContact}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="pill stage">
                        {STAGE_LABELS[lead.stage ?? ''] ?? lead.stage ?? '—'}
                      </span>
                    </td>
                    <td>
                      <TempDot temperature={lead.temperature} />
                    </td>
                    <td className="num">{formatAfn(lead.amount?.amountMicros)}</td>
                    <td>{SOURCE_LABELS[lead.leadSource ?? ''] ?? '—'}</td>
                    <td>
                      <div className="owner">
                        <span className="avatar av-26">
                          {lead.owner?.name.firstName.charAt(0) ?? '؟'}
                        </span>
                        {lead.owner?.name.firstName ?? '—'}
                      </div>
                    </td>
                    <td className="num" style={{ color: 'var(--ink-3)' }}>
                      {relativeDueLabel(lead.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {leads !== null && leads.length > 0 && view === 'kanban' && (
        <div className="kanban anim d2 only-desktop">
          {kanbanCols.map((col) => (
            <div className="kcol" key={col.stage}>
              <div className="kcol-h">
                <span>{STAGE_LABELS[col.stage] ?? col.stage}</span>
                <span className="cnt num">{toPersianDigits(col.items.length)}</span>
                {col.value > 0 && <span className="sum num">{formatAfn(col.value)}</span>}
              </div>
              {col.items.map((lead) => (
                <div
                  className="kcard"
                  key={lead.id}
                  onClick={() => navigate(`/lead/${lead.id}`)}
                >
                  <div className="kn">
                    {lead.temperature && (
                      <span className={`tdot ${lead.temperature.toLowerCase()}`} />
                    )}
                    {lead.name}
                  </div>
                  <div className="kc">
                    {lead.pointOfContact ? personName(lead.pointOfContact) : T.noContact}
                    {(lead.amount?.amountMicros ?? 0) > 0 && (
                      <>
                        {' · '}
                        <b className="num" style={{ color: 'var(--ink)' }}>
                          {formatAfn(lead.amount?.amountMicros)}
                        </b>
                      </>
                    )}
                  </div>
                  <div className="kf">
                    <span className="owner">
                      <span className="avatar av-26">
                        {lead.owner?.name.firstName.charAt(0) ?? '؟'}
                      </span>
                    </span>
                    <span className="num">{relativeDueLabel(lead.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* mobile: card list */}
      {leads !== null && leads.length > 0 && (
        <div className="only-mobile" style={{ flexDirection: 'column' }}>
          {leads.map((lead) => (
            <button
              key={lead.id}
              className="mlead"
              onClick={() => navigate(`/lead/${lead.id}`)}
            >
              <span className="deal-logo">{lead.name.charAt(0)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="lead-name" style={{ display: 'block' }}>
                  {lead.name}
                </span>
                <span
                  style={{
                    display: 'flex',
                    gap: 6,
                    marginTop: 5,
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="pill stage">
                    {STAGE_LABELS[lead.stage ?? ''] ?? '—'}
                  </span>
                  {lead.temperature && (
                    <span className={`pill ${lead.temperature.toLowerCase()}`}>
                      {TEMP_LABELS[lead.temperature]}
                    </span>
                  )}
                </span>
              </span>
              {(lead.amount?.amountMicros ?? 0) > 0 && (
                <span className="deal-val num">
                  {formatAfn(lead.amount?.amountMicros)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </main>
  );
};

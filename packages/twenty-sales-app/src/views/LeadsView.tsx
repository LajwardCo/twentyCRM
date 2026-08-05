import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchMembers } from '../api/admin';
import { type CurrentUser } from '../api/auth';
import {
  fetchLeads,
  fetchReferrers,
  OPEN_STAGES,
} from '../api/records';
import { FilterBar } from '../components/FilterBar';
import { IconKanban, IconPlus, IconTable } from '../components/icons';
import { useCached } from '../lib/cache';
import { buildGraphQLFilter } from '../lib/filters';
import { leadFilterFields } from '../lib/screenFilters';
import { useFilters } from '../lib/useFilters';
import {
  formatMoney,
  formatMoneyTotals,
  fullPhone,
  personName,
  sumByCurrency,
  totalsAreEmpty,
} from '../lib/format';
import { loadPrefs, savePref } from '../lib/prefs';
import { relativeDueLabel, toPersianDigits } from '../lib/jalali';
import { navigate, useRoute } from '../lib/router';
import { SOURCE_LABELS, STAGE_LABELS, T, T7, TEMP_LABELS } from '../lib/strings';

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

type SortKey = 'created' | 'value' | 'name';

export const LeadsView = ({ user, search }: LeadsViewProps) => {
  const prefs = useMemo(loadPrefs, []);
  const [mineOnly, setMineOnlyState] = useState(prefs.mineOnly);
  const [openOnly, setOpenOnlyState] = useState(prefs.openOnly);
  const [view, setViewState] = useState<'table' | 'kanban'>(prefs.leadsView);
  const [sortBy, setSortByState] = useState<SortKey>(prefs.leadsSort);
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());
  const debounceRef = useRef<number>(0);

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(debounceRef.current);
  }, [search]);

  const setMineOnly = (v: boolean) => {
    setMineOnlyState(v);
    savePref('mineOnly', v);
  };
  const setOpenOnly = (v: boolean) => {
    setOpenOnlyState(v);
    savePref('openOnly', v);
  };
  const setView = (v: 'table' | 'kanban') => {
    setViewState(v);
    savePref('leadsView', v);
  };
  const setSortBy = (v: SortKey) => {
    setSortByState(v);
    savePref('leadsSort', v);
  };

  // Option lists for the filter sheet. Both are small, cached, and shared with
  // other screens; a failure here must not take the leads list down with it.
  const { data: filterOptions } = useCached('lead-filter-options', async () => {
    const [members, referrers] = await Promise.all([
      fetchMembers().catch(() => []),
      fetchReferrers().catch(() => []),
    ]);
    return { members, referrers };
  });

  const fields = useMemo(
    () =>
      leadFilterFields(filterOptions?.members ?? [], filterOptions?.referrers ?? []),
    [filterOptions],
  );

  const route = useRoute();
  const filters = useFilters('leads', fields, route.query);

  // Leads are server-paged, so the filter has to run in the query: filtering
  // one page in the browser would quietly filter a truncated pipeline.
  const serverFilter = useMemo(
    () => buildGraphQLFilter(fields, filters.state),
    [fields, filters.state],
  );

  const { data, error } = useCached(
    `leads:${user.workspaceMemberId}:${mineOnly}:${openOnly}:${debouncedSearch}:${JSON.stringify(
      serverFilter ?? null,
    )}`,
    () =>
      fetchLeads({
        search: debouncedSearch || undefined,
        ownerId: mineOnly ? user.workspaceMemberId : undefined,
        openOnly,
        limit: 200,
        extraFilter: serverFilter,
      }),
  );

  const leads = useMemo(() => {
    if (!data) return null;
    const sorted = [...data];
    if (sortBy === 'value') {
      sorted.sort(
        (a, b) => (b.amount?.amountMicros ?? 0) - (a.amount?.amountMicros ?? 0),
      );
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'fa'));
    }
    // 'created' keeps the server order (newest first)
    return sorted;
  }, [data, sortBy]);

  const openValue = useMemo(
    () =>
      sumByCurrency(
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
        return { stage, items, value: sumByCurrency(items) };
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
                !totalsAreEmpty(openValue)
                  ? ` · ارزش باز ${formatMoneyTotals(openValue, { compact: true })}`
                  : ''
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
        <FilterBar
          fields={fields}
          filters={filters}
          resultCount={leads?.length ?? null}
        />
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
        <div className="empty-state">
          {filters.count > 0 ? (
            <>
              {T7.noMatches}
              <div style={{ marginTop: 10 }}>
                <button className="btn line sm" onClick={filters.clearAll}>
                  {T7.clearAll}
                </button>
              </div>
            </>
          ) : (
            T.noLeadsFound
          )}
        </div>
      )}

      {/* desktop: table or kanban */}
      {leads !== null && leads.length > 0 && view === 'table' && (
        <div className="card anim d2 only-desktop" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="leads">
              <thead>
                <tr>
                  <th onClick={() => setSortBy('name')}>
                    شرکت{sortBy === 'name' ? ' ▾' : ''}
                  </th>
                  <th>{T.stage}</th>
                  <th>{T.temperature}</th>
                  <th onClick={() => setSortBy('value')}>
                    ارزش{sortBy === 'value' ? ' ▾' : ''}
                  </th>
                  <th>{T.leadSource}</th>
                  <th>{T.owner}</th>
                  <th onClick={() => setSortBy('created')}>
                    ثبت{sortBy === 'created' ? ' ▾' : ''}
                  </th>
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
                    <td className="num">{formatMoney(lead.amount?.amountMicros, lead.amount?.currencyCode)}</td>
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
                {!totalsAreEmpty(col.value) && (
                  <span className="sum num">
                    {formatMoneyTotals(col.value, { compact: true })}
                  </span>
                )}
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
                          {formatMoney(lead.amount?.amountMicros, lead.amount?.currencyCode)}
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
                  {formatMoney(lead.amount?.amountMicros, lead.amount?.currencyCode)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </main>
  );
};

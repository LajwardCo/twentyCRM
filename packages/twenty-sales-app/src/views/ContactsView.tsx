import { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchAllPeople,
  fetchCompanyOptions,
  type PersonSummary,
} from '../api/records';
import { FilterBar } from '../components/FilterBar';
import { IconBuilding, IconMail, IconPhone } from '../components/icons';
import { useCached } from '../lib/cache';
import { buildGraphQLFilter } from '../lib/filters';
import { fullPhone, personName } from '../lib/format';
import { toPersianDigits } from '../lib/jalali';
import { navigate, useRoute } from '../lib/router';
import { contactFilterFields, type ContactRow } from '../lib/screenFilters';
import { T, T7 } from '../lib/strings';
import { useFilters } from '../lib/useFilters';

type ContactsViewProps = {
  search: string;
};

export const ContactsView = ({ search }: ContactsViewProps) => {
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

  const { data: companies } = useCached('company-options', () =>
    fetchCompanyOptions().catch(() => []),
  );

  const fields = useMemo(
    () => contactFilterFields(companies ?? []),
    [companies],
  );

  const route = useRoute();
  const filters = useFilters('contacts', fields, route.query);

  const serverFilter = useMemo(
    () => buildGraphQLFilter(fields, filters.state),
    [fields, filters.state],
  );

  const { data, error } = useCached(
    `contacts:${debouncedSearch}:${JSON.stringify(serverFilter ?? null)}`,
    () =>
      fetchAllPeople({
        search: debouncedSearch || undefined,
        extraFilter: serverFilter,
      }),
  );

  const people: PersonSummary[] | null = data?.items ?? null;

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T7.contacts}</h1>
          <div className="sub">
            {people !== null &&
              `${toPersianDigits(people.length)} ${T7.contactsCount}${
                data?.truncated ? '+' : ''
              }`}
          </div>
        </div>
      </div>

      <div className="toolbar anim d1">
        <FilterBar
          fields={fields}
          filters={filters}
          resultCount={people?.length ?? null}
        />
        <div className="grow" />
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {people === null && error === null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 58 }} />
          ))}
        </div>
      )}

      {people !== null && people.length === 0 && (
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
            T7.noContactsFound
          )}
        </div>
      )}

      {/* desktop: table */}
      {people !== null && people.length > 0 && (
        <div className="card anim d2 only-desktop" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="leads">
              <thead>
                <tr>
                  <th>{T7.fName}</th>
                  <th>{T7.fJobTitle}</th>
                  <th>{T7.fCompany}</th>
                  <th>{T.phone}</th>
                  <th>{T.email}</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const phone = fullPhone(person.phones);
                  return (
                    <tr
                      key={person.id}
                      onClick={() => navigate(`/person/${person.id}`)}
                    >
                      <td>
                        <div className="lead-cell">
                          <span className="deal-logo">
                            {person.name.firstName.charAt(0) || '؟'}
                          </span>
                          <span className="lead-name">{personName(person)}</span>
                        </div>
                      </td>
                      <td>{person.jobTitle || '—'}</td>
                      <td>
                        {person.company ? (
                          <button
                            type="button"
                            className="lead-chip"
                            style={{
                              background: 'none',
                              border: 0,
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/company/${person.company?.id}`);
                            }}
                          >
                            <IconBuilding size={12} />
                            {person.company.name}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="num" dir="ltr">
                        {phone ? toPersianDigits(phone) : '—'}
                      </td>
                      <td dir="ltr" style={{ fontSize: 12 }}>
                        {person.emails?.primaryEmail || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* mobile: card list with tap-to-call */}
      {people !== null && people.length > 0 && (
        <div className="only-mobile" style={{ flexDirection: 'column' }}>
          {people.map((person) => {
            const phone = fullPhone(person.phones);
            const email = person.emails?.primaryEmail ?? null;
            return (
              <div key={person.id} className="mlead">
                <button
                  className="deal-logo"
                  style={{ border: 0, cursor: 'pointer' }}
                  onClick={() => navigate(`/person/${person.id}`)}
                >
                  {person.name.firstName.charAt(0) || '؟'}
                </button>
                <button
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'none',
                    border: 0,
                    textAlign: 'start',
                    cursor: 'pointer',
                  }}
                  onClick={() => navigate(`/person/${person.id}`)}
                >
                  <span className="lead-name" style={{ display: 'block' }}>
                    {personName(person)}
                  </span>
                  <small style={{ color: 'var(--ink-3)' }}>
                    {[person.jobTitle, person.company?.name]
                      .filter(Boolean)
                      .join(' · ') || T7.noCompany}
                  </small>
                </button>
                <span style={{ display: 'flex', gap: 6 }}>
                  {phone && (
                    <a className="a-btn sm" href={`tel:${phone}`} aria-label={T.call}>
                      <IconPhone size={16} />
                    </a>
                  )}
                  {email && (
                    <a
                      className="a-btn sm"
                      href={`mailto:${email}`}
                      aria-label={T.emailAction}
                    >
                      <IconMail size={16} />
                    </a>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
};

// The contacts table renders PersonSummary rows; ContactRow is the filter-side
// view of the same shape, so a mismatch shows up here at compile time.
const _rowShapeMatches: (person: PersonSummary) => ContactRow = (person) => person;
void _rowShapeMatches;

import { useMemo, useState } from 'react';

import { IconChart, IconDashboard, IconSearch } from '../components/icons';
import { toPersianDigits } from '../lib/jalali';
import {
  CATEGORY_LABELS,
  REPORTS,
  RT,
  searchReports,
} from '../lib/reports';
import { CATEGORY_ORDER } from '../lib/reports/index';
import { navigate } from '../lib/router';
import { type ReportCategory } from '../lib/reports/types';

// The sub-menu of the Reports section: every report in the catalog, grouped by
// what it answers. The dashboard keeps its own card at the top -- it is a
// summary screen, not a report, and pretending otherwise is what sent people
// looking for numbers it never had.
export const ReportsCatalogView = () => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ReportCategory | 'all'>('all');

  const results = useMemo(() => {
    const matched = searchReports(query);
    return category === 'all'
      ? matched
      : matched.filter((report) => report.category === category);
  }, [query, category]);

  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((key) => ({
        key,
        label: CATEGORY_LABELS[key],
        reports: results.filter((report) => report.category === key),
      })).filter((group) => group.reports.length > 0),
    [results],
  );

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{RT.library}</h1>
          <div className="sub">
            {RT.librarySub} · {toPersianDigits(REPORTS.length)} {RT.reportCount}
          </div>
        </div>
      </div>

      <button
        className="card card-pad rpt-dash-card anim d1"
        onClick={() => navigate('/reports/dashboard')}
      >
        <span className="rpt-dash-ico">
          <IconDashboard size={20} />
        </span>
        <span className="rpt-dash-text">
          <b>{RT.dashboard}</b>
          <small>{RT.dashboardSub}</small>
        </span>
      </button>

      <div className="toolbar anim d1">
        <div className="cmd-search rpt-search">
          <span className="s-ico">
            <IconSearch size={16} />
          </span>
          <input
            type="search"
            value={query}
            placeholder={RT.searchReports}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="seg">
          <button
            className={category === 'all' ? 'on' : ''}
            onClick={() => setCategory('all')}
          >
            {RT.periodAll}
          </button>
          {CATEGORY_ORDER.map((key) => (
            <button
              key={key}
              className={category === key ? 'on' : ''}
              onClick={() => setCategory(key)}
            >
              {CATEGORY_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="empty-state">{RT.noReportFound}</div>
      )}

      {groups.map((group, index) => (
        <section key={group.key} className={`anim d${Math.min(index + 2, 4)}`}>
          <div className="rpt-group-head">
            <h3>{group.label}</h3>
            <span className="num">
              {toPersianDigits(group.reports.length)} {RT.reportCount}
            </span>
          </div>
          <div className="rpt-grid">
            {group.reports.map((report) => (
              <button
                key={report.id}
                className="card card-pad rpt-card"
                onClick={() => navigate(`/reports/${report.id}`)}
              >
                <span className="rpt-card-ico">
                  <IconChart size={17} />
                </span>
                <span className="rpt-card-body">
                  <b>{report.title}</b>
                  <small>{report.description}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
};

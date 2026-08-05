import { useEffect } from 'react';

import { type AdvancedHit } from '../api/advancedSearch';
import { searchHitRoute } from '../api/records';
import { Highlight } from '../components/Highlight';
import {
  IconBuilding,
  IconLeads,
  IconNote,
  IconSearch,
  IconTasks,
} from '../components/icons';
import { useBackgroundSearch } from '../lib/backgroundSearch';
import { toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { announceDockablePage, clearDockablePage } from '../lib/workbench';

type SearchResultsViewProps = {
  searchId: string;
};

const HIT_TYPE_FA: Record<string, string> = {
  opportunity: 'لید',
  person: 'شخص',
  company: 'شرکت',
  task: 'وظیفه',
  note: 'یادداشت',
};

const hitIcon = (type: string) => {
  if (type === 'company') return <IconBuilding size={17} />;
  if (type === 'task') return <IconTasks size={17} />;
  if (type === 'note') return <IconNote size={17} />;
  if (type === 'person') return <IconLeads size={17} />;
  return <IconSearch size={17} />;
};

export const SearchResultsView = ({ searchId }: SearchResultsViewProps) => {
  const search = useBackgroundSearch(searchId);
  const resolving: string | null = null;
  const notice: string | null = null;

  useEffect(() => {
    announceDockablePage(
      search ? `جستجو: ${search.query}` : 'جستجو',
      'search',
    );
    return clearDockablePage;
  }, [search]);

  const openHit = (hit: AdvancedHit) => {
    navigate(searchHitRoute(hit));
  };

  if (!search) {
    return (
      <main className="page">
        <div className="empty-state" style={{ paddingTop: 60 }}>
          این جستجو دیگر موجود نیست — جستجوهای پس‌زمینه با بستن مرورگر پاک
          می‌شوند.
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>جستجو: «{search.query}»</h1>
          <div className="sub">
            {search.status === 'running' && 'در حال جستجوی عمیق در همه داده‌ها…'}
            {search.status === 'done' &&
              `${toPersianDigits(search.results.length)} نتیجه یافت شد`}
            {search.status === 'error' && 'جستجو ناموفق بود'}
          </div>
        </div>
      </div>

      {search.status === 'running' && (
        <>
          <div className="card card-pad anim d1" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                className="skeleton"
                style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }}
              />
              <div style={{ fontSize: 13 }}>
                این جستجو در پس‌زمینه ادامه دارد — می‌توانید به کارتان برسید؛
                نتیجه در همین تب و با اعلان خبر داده می‌شود.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 62 }} />
            ))}
          </div>
        </>
      )}

      {notice !== null && <div className="error-banner">{notice}</div>}

      {search.status === 'done' && search.results.length === 0 && (
        <div className="empty-state">نتیجه‌ای یافت نشد</div>
      )}

      {search.status === 'done' &&
        search.results.map((hit, index) => (
          <button
            key={hit.recordId}
            className={`sr-item anim d${Math.min(index + 1, 5)}`}
            disabled={resolving !== null}
            onClick={() => void openHit(hit)}
          >
            <span className="sr-ico">{hitIcon(hit.objectNameSingular)}</span>
            <span className="sr-main">
              <span className="sr-title">
                <Highlight text={hit.label || '—'} query={search.query} />
              </span>
              {hit.description && (
                <span className="sr-desc">
                  <Highlight text={hit.description} query={search.query} />
                </span>
              )}
            </span>
            <span className="sr-type">
              {resolving === hit.recordId
                ? '…'
                : (HIT_TYPE_FA[hit.objectNameSingular] ?? hit.objectNameSingular)}
            </span>
          </button>
        ))}
    </main>
  );
};

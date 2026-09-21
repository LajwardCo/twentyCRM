import { useEffect, useState } from 'react';

import { listDemos, type DemoStatus } from '../api/demoSystems';
import { IconPlus, IconPresentation } from '../components/icons';
import { toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { TDEMO } from '../lib/strings';

const STATUS_LABEL: Record<DemoStatus['status'], string> = {
  queued: TDEMO.statusQueued,
  provisioning: TDEMO.statusProvisioning,
  ready: TDEMO.statusReady,
  failed: TDEMO.statusFailed,
  expired: TDEMO.statusExpired,
  stopped: TDEMO.statusStopped,
  deleted: TDEMO.statusDeleted,
};

const BIZ_LABEL: Record<string, string> = {
  mobile_store: TDEMO.bizMobile,
  home_appliances: TDEMO.bizAppliances,
  snooker_club: TDEMO.bizSnooker,
  car_rental: TDEMO.bizCarRental,
  other: TDEMO.bizOther,
};

const daysLeft = (expiresAt: string | null): number | null => {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
};

export const DemoSystemsView = () => {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [demos, setDemos] = useState<DemoStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDemos(null);
    setError(null);
    listDemos(scope)
      .then((rows) => {
        if (!cancelled) setDemos(rows);
      })
      .catch(() => {
        if (!cancelled) setError(TDEMO.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{TDEMO.pageTitle}</h1>
          <div className="sub">{TDEMO.pageSub}</div>
        </div>
        <button className="btn gold" onClick={() => navigate('/demos/new')}>
          <IconPlus size={16} /> {TDEMO.newDemo}
        </button>
      </div>

      <div className="seg anim" style={{ marginBottom: 14 }}>
        <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>
          {TDEMO.myDemos}
        </button>
        <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
          {TDEMO.allDemos}
        </button>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {demos === null && error === null && (
        <div style={{ display: 'grid', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72 }} />
          ))}
        </div>
      )}

      {demos !== null && demos.length === 0 && (
        <div className="empty-state">
          <IconPresentation size={40} />
          <div style={{ fontWeight: 600, marginTop: 8 }}>{TDEMO.empty}</div>
          <div className="sub" style={{ marginTop: 4 }}>{TDEMO.emptyHint}</div>
          <button className="btn gold" style={{ marginTop: 14 }} onClick={() => navigate('/demos/new')}>
            <IconPlus size={16} /> {TDEMO.newDemo}
          </button>
        </div>
      )}

      {demos !== null && demos.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {demos.map((demo) => {
            const left = daysLeft(demo.expires_at);
            return (
              <div
                key={demo.id}
                className="card card-pad anim hoverable"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/demo/${demo.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <b style={{ fontSize: 15 }}>{demo.business_name}</b>
                      <span className={`demo-status-badge s-${demo.status}`}>
                        {STATUS_LABEL[demo.status]}
                      </span>
                    </div>
                    <div className="sub" style={{ marginTop: 3 }}>
                      {BIZ_LABEL[demo.business_type] ?? demo.business_type}
                      {' · '}
                      <code dir="ltr">{demo.subdomain}</code>
                    </div>
                  </div>
                  {left !== null && demo.status === 'ready' && (
                    <div className="demo-days-pill">
                      {toPersianDigits(String(left))} {TDEMO.daysLeft}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
};

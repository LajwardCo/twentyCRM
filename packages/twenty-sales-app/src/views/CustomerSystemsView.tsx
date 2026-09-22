import { useEffect, useState } from 'react';

import { listSystems, type SystemStatus } from '../api/customerSystems';
import { IconPresentation } from '../components/icons';
import { navigate } from '../lib/router';
import { TSYS } from '../lib/strings';

const STATUS_LABEL: Record<SystemStatus['status'], string> = {
  queued: TSYS.statusQueued,
  provisioning: TSYS.statusProvisioning,
  ready: TSYS.statusReady,
  failed: TSYS.statusFailed,
};

const BIZ_LABEL: Record<string, string> = {
  retail: TSYS.typeRetail,
  services: TSYS.typeServices,
  booking: TSYS.typeBooking,
  general: TSYS.typeGeneral,
};

export const CustomerSystemsView = () => {
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [systems, setSystems] = useState<SystemStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSystems(null);
    setError(null);
    listSystems(scope)
      .then((rows) => {
        if (!cancelled) setSystems(rows);
      })
      .catch(() => {
        if (!cancelled) setError(TSYS.loadError);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{TSYS.pageTitle}</h1>
          <div className="sub">{TSYS.pageSub}</div>
        </div>
      </div>

      <div className="seg anim" style={{ marginBottom: 14 }}>
        <button className={scope === 'mine' ? 'on' : ''} onClick={() => setScope('mine')}>
          {TSYS.mySystems}
        </button>
        <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')}>
          {TSYS.allSystems}
        </button>
      </div>

      {error !== null && <div className="error-banner">{error}</div>}

      {systems === null && error === null && (
        <div style={{ display: 'grid', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72 }} />
          ))}
        </div>
      )}

      {systems !== null && systems.length === 0 && (
        <div className="empty-state">
          <IconPresentation size={40} />
          <div style={{ fontWeight: 600, marginTop: 8 }}>{TSYS.empty}</div>
          <div className="sub" style={{ marginTop: 4 }}>{TSYS.emptyHint}</div>
        </div>
      )}

      {systems !== null && systems.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {systems.map((system) => (
            <div
              key={system.id}
              className="card card-pad anim hoverable"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/system/${system.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontSize: 15 }}>{system.business_name}</b>
                    <span className={`demo-status-badge s-${system.status}`}>
                      {STATUS_LABEL[system.status]}
                    </span>
                  </div>
                  <div className="sub" style={{ marginTop: 3 }}>
                    {BIZ_LABEL[system.business_type] ?? system.business_type}
                    {' · '}
                    <code dir="ltr">{system.subdomain}</code>
                    {system.crm_lead_name && (
                      <>
                        {' · '}
                        {system.crm_lead_name}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};

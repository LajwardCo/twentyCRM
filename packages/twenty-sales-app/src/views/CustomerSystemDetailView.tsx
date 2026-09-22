import { useEffect, useRef, useState } from 'react';

import {
  getSystem,
  getSystemDetails,
  regenerateSystemCredentials,
  type SystemDetails,
  type SystemStatus,
} from '../api/customerSystems';
import { IconPresentation } from '../components/icons';
import { toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { TSYS } from '../lib/strings';

const BIZ_LABEL: Record<string, string> = {
  retail: TSYS.typeRetail,
  services: TSYS.typeServices,
  booking: TSYS.typeBooking,
  general: TSYS.typeGeneral,
};

const STATUS_LABEL: Record<SystemStatus['status'], string> = {
  queued: TSYS.statusQueued,
  provisioning: TSYS.statusProvisioning,
  ready: TSYS.statusReady,
  failed: TSYS.statusFailed,
};

const ROLE_LABEL: Record<string, string> = {
  admin: TSYS.roleAdmin,
  manager: TSYS.roleManager,
  accountant: TSYS.roleAccountant,
  seller: TSYS.roleSeller,
  cashier: TSYS.roleCashier,
  inventory: TSYS.roleInventory,
  inventory_manager: TSYS.roleInventoryManager,
};

const CopyRow = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context / permissions); leave the value visible.
    }
  };
  return (
    <div className="demo-cred-row">
      <span className="demo-cred-label">{label}</span>
      <code className="demo-cred-value" dir="ltr">{value}</code>
      <button type="button" className="btn line sm" onClick={copy}>
        {copied ? TSYS.copied : TSYS.copy}
      </button>
    </div>
  );
};

export const CustomerSystemDetailView = ({ systemId }: { systemId: string }) => {
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [details, setDetails] = useState<SystemDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const pollTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const row = await getSystem(systemId);
        if (cancelled) return;
        setSystem(row);
        if (row.status === 'queued' || row.status === 'provisioning') {
          pollTimer.current = window.setTimeout(load, 4000);
        }
      } catch {
        if (!cancelled) setError(TSYS.loadError);
      }
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer.current);
    };
  }, [systemId]);

  useEffect(() => {
    if (system?.status !== 'ready') return;
    let cancelled = false;
    getSystemDetails(systemId)
      .then((snapshot) => {
        if (!cancelled) setDetails(snapshot);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [system?.status, systemId]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateSystemCredentials(systemId);
      window.setTimeout(async () => {
        try {
          setSystem(await getSystem(systemId));
        } catch {
          /* keep the current view */
        }
        setRegenerating(false);
      }, 2500);
    } catch {
      setRegenerating(false);
    }
  };

  if (error !== null) {
    return (
      <main className="page">
        <div className="error-banner">{error}</div>
        <button className="btn line" onClick={() => navigate('/systems')}>{TSYS.backToList}</button>
      </main>
    );
  }

  if (system === null) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 120, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </main>
    );
  }

  const isBuilding = system.status === 'queued' || system.status === 'provisioning';

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{system.business_name}</h1>
          <div className="sub">
            {BIZ_LABEL[system.business_type] ?? system.business_type}
            {' · '}
            <span className={`demo-status-badge s-${system.status}`}>{STATUS_LABEL[system.status]}</span>
            {system.crm_lead_name && (
              <>
                {' · '}
                {TSYS.forLeadLabel}: {system.crm_lead_name}
              </>
            )}
          </div>
        </div>
      </div>

      {isBuilding && (
        <div className="card card-pad anim" style={{ textAlign: 'center', padding: 32 }}>
          <div className="demo-spinner" />
          <div style={{ marginTop: 14, fontWeight: 600 }}>{TSYS.statusProvisioning}</div>
          <div className="sub" style={{ marginTop: 6 }}>{TSYS.preparing}</div>
        </div>
      )}

      {system.status === 'failed' && (
        <div className="card card-pad anim">
          <div className="error-banner" style={{ margin: 0 }}>{TSYS.failedHint}</div>
        </div>
      )}

      {system.status === 'ready' && (
        <>
          <div className="demo-ready-banner anim">
            <IconPresentation size={20} />
            <div style={{ flex: 1 }}>
              <b>{TSYS.readyTitle}</b>
            </div>
          </div>

          <div className="card card-pad fieldset anim d1" style={{ marginTop: 12 }}>
            <legend>{TSYS.readyTitle}</legend>
            <CopyRow label={TSYS.loginUrl} value={system.login_url} />
            <CopyRow label={TSYS.username} value={system.admin_username} />
            {system.admin_password ? <CopyRow label={TSYS.password} value={system.admin_password} /> : null}

            <div className="demo-detail-actions">
              <a className="btn gold" href={system.login_url} target="_blank" rel="noreferrer">
                {TSYS.openSystem}
              </a>
              <button className="btn line" onClick={handleRegenerate} disabled={regenerating}>
                {regenerating ? TSYS.regenerating : TSYS.regenerate}
              </button>
            </div>
          </div>

          {system.provisioned_users && system.provisioned_users.length > 0 && (
            <div className="card card-pad fieldset anim d2" style={{ marginTop: 12 }}>
              <legend>{TSYS.provisionedUsersTitle}</legend>
              {system.provisioned_users.map((user) => (
                <div key={user.login_username} className="card card-pad" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b>{user.name}</b>
                    <span className="demo-status-badge s-ready">{ROLE_LABEL[user.role] ?? user.role}</span>
                  </div>
                  <CopyRow label={TSYS.username} value={user.login_username} />
                  <CopyRow label={TSYS.password} value={user.password} />
                </div>
              ))}
            </div>
          )}

          <div className="card card-pad anim d3" style={{ marginTop: 12 }}>
            <div className="demo-meta-grid">
              <div>
                <span>{TSYS.createdBy}</span>
                <b>{system.agent_name || system.agent_email}</b>
              </div>
              {system.max_users != null && (
                <div>
                  <span>{TSYS.maxUsers}</span>
                  <b>{toPersianDigits(String(system.max_users))}</b>
                </div>
              )}
              {details?.users?.count != null && (
                <div>
                  <span>{TSYS.usersCount}</span>
                  <b>{toPersianDigits(String(details.users.count))}</b>
                </div>
              )}
            </div>
          </div>

          {details && details.provisioned && details.catalog && (
            <div className="card card-pad fieldset anim d3" style={{ marginTop: 12 }}>
              <legend>{TSYS.snapshotTitle}</legend>
              <div className="demo-meta-grid">
                <div>
                  <span>{TSYS.products}</span>
                  <b>{details.catalog.products != null ? toPersianDigits(String(details.catalog.products)) : '—'}</b>
                </div>
                <div>
                  <span>{TSYS.services}</span>
                  <b>{details.catalog.services != null ? toPersianDigits(String(details.catalog.services)) : '—'}</b>
                </div>
                {details.workspace?.currency && (
                  <div>
                    <span>{TSYS.currency}</span>
                    <b>{details.workspace.currency}</b>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
};

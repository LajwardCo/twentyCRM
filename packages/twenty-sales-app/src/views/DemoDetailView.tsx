import { useEffect, useRef, useState } from 'react';

import {
  getDemo,
  getDemoDetails,
  regenerateDemoCredentials,
  removeDemo,
  stopDemo,
  type DemoDetails,
  type DemoStatus,
} from '../api/demoSystems';
import { IconPresentation } from '../components/icons';
import { formatJalaliDate, toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { TDEMO } from '../lib/strings';

const BIZ_LABEL: Record<string, string> = {
  mobile_store: TDEMO.bizMobile,
  home_appliances: TDEMO.bizAppliances,
  snooker_club: TDEMO.bizSnooker,
  car_rental: TDEMO.bizCarRental,
  booking: TDEMO.bizBooking,
  opd: TDEMO.bizOpd,
  other: TDEMO.bizOther,
};

// Core seeds an OPD demo's doctor under this login, sharing the admin password.
const OPD_DOCTOR_USERNAME = 'doctor';

const STATUS_LABEL: Record<DemoStatus['status'], string> = {
  queued: TDEMO.statusQueued,
  provisioning: TDEMO.statusProvisioning,
  ready: TDEMO.statusReady,
  failed: TDEMO.statusFailed,
  expired: TDEMO.statusExpired,
  stopped: TDEMO.statusStopped,
  deleted: TDEMO.statusDeleted,
};

const daysLeft = (expiresAt: string | null): number | null => {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
};

const CopyRow = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => {
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
      <code className="demo-cred-value" dir="ltr" style={mono ? undefined : { direction: 'ltr' }}>
        {value}
      </code>
      <button type="button" className="btn line sm" onClick={copy}>
        {copied ? TDEMO.copied : TDEMO.copy}
      </button>
    </div>
  );
};

export const DemoDetailView = ({ demoId }: { demoId: string }) => {
  const [demo, setDemo] = useState<DemoStatus | null>(null);
  const [details, setDetails] = useState<DemoDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [removing, setRemoving] = useState(false);
  const pollTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const row = await getDemo(demoId);
        if (cancelled) return;
        setDemo(row);
        // Keep polling while the tenant is still being built.
        if (row.status === 'queued' || row.status === 'provisioning') {
          pollTimer.current = window.setTimeout(load, 4000);
        }
      } catch {
        if (!cancelled) setError(TDEMO.loadError);
      }
    };
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(pollTimer.current);
    };
  }, [demoId]);

  // Once the tenant is provisioned, pull a live snapshot from the fleet (Core):
  // real status, expiry, and how much catalog was seeded.
  useEffect(() => {
    if (demo?.status !== 'ready') return;
    let cancelled = false;
    getDemoDetails(demoId)
      .then((snapshot) => {
        if (!cancelled) setDetails(snapshot);
      })
      .catch(() => {
        // Snapshot is supplementary; the rest of the page still renders.
      });
    return () => {
      cancelled = true;
    };
  }, [demo?.status, demoId]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateDemoCredentials(demoId);
      // The new password is set asynchronously; re-fetch shortly after.
      window.setTimeout(async () => {
        try {
          setDemo(await getDemo(demoId));
        } catch {
          /* keep the current view */
        }
        setRegenerating(false);
      }, 2500);
    } catch {
      setRegenerating(false);
    }
  };

  const handleStop = async () => {
    if (!window.confirm(TDEMO.stopConfirm)) return;
    setStopping(true);
    try {
      setDemo(await stopDemo(demoId));
    } catch {
      /* keep the current view */
    }
    setStopping(false);
  };

  const handleRemove = async () => {
    if (!window.confirm(TDEMO.removeConfirm)) return;
    setRemoving(true);
    try {
      await removeDemo(demoId);
      navigate('/demos');
    } catch {
      setRemoving(false);
    }
  };

  if (error !== null) {
    return (
      <main className="page">
        <div className="error-banner">{error}</div>
        <button className="btn line" onClick={() => navigate('/demos')}>{TDEMO.backToList}</button>
      </main>
    );
  }

  if (demo === null) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: 120, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 200 }} />
      </main>
    );
  }

  const left = daysLeft(demo.expires_at);
  const isBuilding = demo.status === 'queued' || demo.status === 'provisioning';

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {demo.business_name}
            <span className="demo-status-badge s-demo">{TDEMO.demoBadge}</span>
          </h1>
          <div className="sub">
            {BIZ_LABEL[demo.business_type] ?? demo.business_type}
            {' · '}
            <span className={`demo-status-badge s-${demo.status}`}>
              {STATUS_LABEL[demo.status]}
            </span>
          </div>
        </div>
      </div>

      {isBuilding && (
        <div className="card card-pad anim" style={{ textAlign: 'center', padding: 32 }}>
          <div className="demo-spinner" />
          <div style={{ marginTop: 14, fontWeight: 600 }}>{TDEMO.statusProvisioning}</div>
          <div className="sub" style={{ marginTop: 6 }}>{TDEMO.preparing}</div>
        </div>
      )}

      {demo.status === 'failed' && (
        <div className="card card-pad anim">
          <div className="error-banner" style={{ margin: 0 }}>{TDEMO.failedHint}</div>
        </div>
      )}

      {demo.status === 'ready' && (
        <>
          <div className="demo-ready-banner anim">
            <IconPresentation size={20} />
            <div style={{ flex: 1 }}>
              <b>{TDEMO.readyTitle}</b>
              <div className="demo-presentation-note">🔒 {TDEMO.agreementBody}</div>
            </div>
            <span className="demo-presentation-badge">{TDEMO.presentationOnlyBadge}</span>
          </div>

          <div className="card card-pad fieldset anim d1" style={{ marginTop: 12 }}>
            <legend>{TDEMO.readyTitle}</legend>
            <CopyRow label={TDEMO.loginUrl} value={demo.login_url} />
            <CopyRow label={TDEMO.username} value={demo.admin_username} />
            {demo.admin_password ? <CopyRow label={TDEMO.password} value={demo.admin_password} /> : null}
            {demo.business_type === 'opd' && (
              <>
                <CopyRow label={TDEMO.doctorUsername} value={OPD_DOCTOR_USERNAME} />
                <div className="demo-presentation-note">{TDEMO.doctorLoginNote}</div>
              </>
            )}

            <div className="demo-detail-actions">
              <a className="btn gold" href={demo.login_url} target="_blank" rel="noreferrer">
                {TDEMO.openDemo}
              </a>
              <button className="btn line" onClick={handleRegenerate} disabled={regenerating}>
                {regenerating ? TDEMO.regenerating : TDEMO.regenerate}
              </button>
              <button className="btn line" onClick={handleStop} disabled={stopping || removing}>
                {stopping ? TDEMO.stopping : TDEMO.stopDemo}
              </button>
              <button className="btn line danger" onClick={handleRemove} disabled={removing || stopping}>
                {removing ? TDEMO.removing : TDEMO.removeDemo}
              </button>
            </div>
          </div>

          <div className="card card-pad anim d2" style={{ marginTop: 12 }}>
            <div className="demo-meta-grid">
              <div>
                <span>{TDEMO.expiresOn}</span>
                <b>{formatJalaliDate(demo.expires_at)}</b>
              </div>
              {left !== null && (
                <div>
                  <span>{TDEMO.daysLeft}</span>
                  <b>{toPersianDigits(String(left))}</b>
                </div>
              )}
              <div>
                <span>{TDEMO.createdBy}</span>
                <b>{demo.agent_name || demo.agent_email}</b>
              </div>
            </div>
          </div>

          {details && details.provisioned && (
            <div className="card card-pad fieldset anim d3" style={{ marginTop: 12 }}>
              <legend>{TDEMO.snapshotTitle}</legend>
              <div className="demo-meta-grid">
                {details.live && (
                  <div>
                    <span>{TDEMO.liveStatus}</span>
                    <b>
                      <span
                        className={`demo-status-badge ${
                          details.live.expired ? 's-expired' : details.live.active ? 's-ready' : 's-queued'
                        }`}
                      >
                        {details.live.expired
                          ? TDEMO.statusExpired
                          : details.live.active
                            ? TDEMO.liveActive
                            : TDEMO.liveLocked}
                      </span>
                    </b>
                  </div>
                )}
                {details.catalog && (
                  <>
                    <div>
                      <span>{TDEMO.products}</span>
                      <b>
                        {details.catalog.products != null
                          ? toPersianDigits(String(details.catalog.products))
                          : '—'}
                      </b>
                    </div>
                    <div>
                      <span>{TDEMO.services}</span>
                      <b>
                        {details.catalog.services != null
                          ? toPersianDigits(String(details.catalog.services))
                          : '—'}
                      </b>
                    </div>
                    {details.catalog.doctors != null && (
                      <div>
                        <span>{TDEMO.doctors}</span>
                        <b>{toPersianDigits(String(details.catalog.doctors))}</b>
                      </div>
                    )}
                    {details.catalog.patients != null && (
                      <div>
                        <span>{TDEMO.patients}</span>
                        <b>{toPersianDigits(String(details.catalog.patients))}</b>
                      </div>
                    )}
                  </>
                )}
                {details.workspace?.currency && (
                  <div>
                    <span>{TDEMO.currency}</span>
                    <b>{details.workspace.currency}</b>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {(demo.status === 'stopped' || demo.status === 'expired') && (
        <div className="card card-pad anim">
          <div className="demo-presentation-note" style={{ marginBottom: 12 }}>
            🔒 {TDEMO.stoppedNote}
          </div>
          <div className="demo-detail-actions">
            <button className="btn line danger" onClick={handleRemove} disabled={removing}>
              {removing ? TDEMO.removing : TDEMO.removeDemo}
            </button>
            <button className="btn line" onClick={() => navigate('/demos')}>
              {TDEMO.backToList}
            </button>
          </div>
        </div>
      )}

      {demo.status === 'deleted' && (
        <div className="card card-pad anim">
          <div className="sub">{TDEMO.stoppedNote}</div>
          <button className="btn line" style={{ marginTop: 12 }} onClick={() => navigate('/demos')}>
            {TDEMO.backToList}
          </button>
        </div>
      )}
    </main>
  );
};

import { useEffect, useState } from 'react';

import { listSystems, SystemApiError, type SystemStatus } from '../api/customerSystems';
import { navigate } from '../lib/router';
import { TSYS } from '../lib/strings';

// The real customer systems issued for this lead, plus the button that opens the
// issuance wizard pre-linked to the lead. Only rendered for contracted leads
// (see CONVERTIBLE_STAGES in LeadDetailView). Hides itself when the server has no
// Usystems connection configured.

type Props = {
  leadId: string;
  leadName: string;
  companyId: string | null;
  companyName: string | null;
};

const STATUS_LABEL: Record<SystemStatus['status'], string> = {
  queued: TSYS.statusQueued,
  provisioning: TSYS.statusProvisioning,
  ready: TSYS.statusReady,
  failed: TSYS.statusFailed,
};

export const LeadCustomerSystemCard = ({ leadId, leadName, companyId, companyName }: Props) => {
  const [systems, setSystems] = useState<SystemStatus[] | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // scope=all so a system issued by another agent for this lead still shows.
    listSystems('all', leadId)
      .then((rows) => {
        if (!cancelled) setSystems(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        // 503 => the server has no Usystems connection: hide the whole card.
        if (err instanceof SystemApiError && err.status === 503) {
          setSupported(false);
          return;
        }
        setSystems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const openWizard = () => {
    const params = new URLSearchParams();
    params.set('leadId', leadId);
    if (leadName) params.set('leadName', leadName);
    if (companyId) params.set('companyId', companyId);
    if (companyName) params.set('companyName', companyName);
    navigate(`/systems/new?${params.toString()}`);
  };

  if (!supported) return null;

  return (
    <div className="card card-pad anim">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <b>{TSYS.cardTitle}</b>
        <button className="btn gold sm" onClick={openWizard}>{TSYS.cardIssue}</button>
      </div>

      {systems !== null && systems.length === 0 && (
        <div className="sub" style={{ marginTop: 10 }}>{TSYS.cardNone}</div>
      )}

      {systems !== null && systems.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {systems.map((system) => (
            <div
              key={system.id}
              className="card card-pad hoverable"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate(`/system/${system.id}`)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b style={{ flex: 1, minWidth: 0 }}>{system.business_name}</b>
                <span className={`demo-status-badge s-${system.status}`}>
                  {STATUS_LABEL[system.status]}
                </span>
              </div>
              <div className="sub" style={{ marginTop: 3 }}>
                <code dir="ltr">{system.subdomain}</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

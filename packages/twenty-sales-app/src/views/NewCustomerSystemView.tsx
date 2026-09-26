import { useEffect, useMemo, useRef, useState } from 'react';

import {
  checkSystemSubdomain,
  createSystem,
  SystemApiError,
  type CreateSystemInput,
  type RequestedUser,
  type SystemBusinessType,
  type SystemUserRole,
} from '../api/customerSystems';
import { fetchCompanyUsystemsContactId } from '../api/usystems';
import {
  CUSTOMER_SYSTEM_MODULES,
  initialModuleFlags,
  moduleFlagsPayload,
} from '../lib/customerSystemModules';
import { announceDockablePage, clearDockablePage } from '../lib/workbench';
import { navigate, useRoute } from '../lib/router';
import { TSYS } from '../lib/strings';

type TypeOption = { key: SystemBusinessType; label: string; desc: string; emoji: string };

const TYPE_OPTIONS: TypeOption[] = [
  { key: 'retail', label: TSYS.typeRetail, desc: TSYS.typeRetailDesc, emoji: '🏬' },
  { key: 'services', label: TSYS.typeServices, desc: TSYS.typeServicesDesc, emoji: '🧾' },
  { key: 'booking', label: TSYS.typeBooking, desc: TSYS.typeBookingDesc, emoji: '📅' },
  { key: 'general', label: TSYS.typeGeneral, desc: TSYS.typeGeneralDesc, emoji: '🏢' },
];

const CURRENCIES = ['AFN', 'USD'];
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'fa', label: TSYS.langFa },
  { code: 'en', label: TSYS.langEn },
  { code: 'ps', label: TSYS.langPs },
];

const ROLE_OPTIONS: { value: SystemUserRole; label: string }[] = [
  { value: 'seller', label: TSYS.roleSeller },
  { value: 'cashier', label: TSYS.roleCashier },
  { value: 'accountant', label: TSYS.roleAccountant },
  { value: 'manager', label: TSYS.roleManager },
  { value: 'inventory', label: TSYS.roleInventory },
  { value: 'inventory_manager', label: TSYS.roleInventoryManager },
  { value: 'admin', label: TSYS.roleAdmin },
];


const STEPS = [TSYS.step1, TSYS.step2, TSYS.step3, TSYS.step4, TSYS.step5];

// A real system carries the customer's clean subdomain (no demo afterfix).
const previewSubdomain = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');

const toIntOrNull = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(/[^\d]/g, ''));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
};

type CheckState = 'idle' | 'checking' | 'available' | 'taken';

const readParam = (query: string, key: string): string => {
  try {
    return new URLSearchParams(query).get(key) ?? '';
  } catch {
    return '';
  }
};

export const NewCustomerSystemView = () => {
  const route = useRoute();
  const leadId = useMemo(() => readParam(route.query, 'leadId'), [route.query]);
  const leadName = useMemo(() => readParam(route.query, 'leadName'), [route.query]);
  const companyId = useMemo(() => readParam(route.query, 'companyId'), [route.query]);
  const companyName = useMemo(() => readParam(route.query, 'companyName'), [route.query]);

  const [step, setStep] = useState(1);

  const [businessType, setBusinessType] = useState<SystemBusinessType>('retail');
  const [businessName, setBusinessName] = useState(companyName || leadName || '');
  const [subdomain, setSubdomain] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [language, setLanguage] = useState('fa');
  const [currency, setCurrency] = useState('AFN');
  const [inventoryEnabled, setInventoryEnabled] = useState(true);
  const [multiInventory, setMultiInventory] = useState(true);
  const [multiCurrency, setMultiCurrency] = useState(true);
  const [multiLot, setMultiLot] = useState(true);
  const [aiAssistant, setAiAssistant] = useState(false);
  const [dynamicReporting, setDynamicReporting] = useState(false);
  const [multiLanguage, setMultiLanguage] = useState(false);
  const [customLogo, setCustomLogo] = useState('');
  const [customBackground, setCustomBackground] = useState('');

  const [moduleFlags, setModuleFlags] = useState<Record<string, boolean>>(initialModuleFlags);
  const [maxUsers, setMaxUsers] = useState('');
  const [maxInventories, setMaxInventories] = useState('');
  const [maxEmployees, setMaxEmployees] = useState('');
  const [maxResources, setMaxResources] = useState('');
  const [maxCurrencies, setMaxCurrencies] = useState('');

  const [adminUsername, setAdminUsername] = useState('admin');
  const [users, setUsers] = useState<RequestedUser[]>([]);
  const [notes, setNotes] = useState('');

  const [usystemsContactId, setUsystemsContactId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    announceDockablePage(TSYS.newSystem, 'new');
    return clearDockablePage;
  }, []);

  // A booking-led system always ships with the booking module on.
  useEffect(() => {
    if (businessType === 'booking') {
      setModuleFlags((prev) => ({ ...prev, booking: true }));
    }
  }, [businessType]);

  // Resolve the lead's company link to a Core contact id, if one exists.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetchCompanyUsystemsContactId(companyId)
      .then((id) => {
        if (!cancelled && id) setUsystemsContactId(id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const preview = useMemo(() => previewSubdomain(subdomain), [subdomain]);

  const pickImage = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(TSYS.imageTooLarge);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setter(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    window.clearTimeout(checkTimer.current);
    if (!preview) {
      setCheckState('idle');
      return;
    }
    setCheckState('checking');
    checkTimer.current = window.setTimeout(async () => {
      try {
        const result = await checkSystemSubdomain(subdomain);
        setCheckState(result.available ? 'available' : 'taken');
      } catch {
        setCheckState('idle');
      }
    }, 500);
    return () => window.clearTimeout(checkTimer.current);
  }, [subdomain, preview]);

  const addUser = () =>
    setUsers((prev) => [...prev, { name: '', phone: '', login_username: '', role: 'seller' }]);
  const updateUser = (index: number, patch: Partial<RequestedUser>) =>
    setUsers((prev) => prev.map((u, i) => (i === index ? { ...u, ...patch } : u)));
  const removeUser = (index: number) =>
    setUsers((prev) => prev.filter((_, i) => i !== index));

  const canNext = (): boolean => {
    if (step === 1) return businessName.trim().length > 0 && preview.length > 0 && checkState !== 'taken';
    if (step === 4) return users.every((u) => u.name.trim().length > 0);
    return true;
  };

  const goNext = () => {
    setError(null);
    if (canNext()) setStep((s) => Math.min(5, s + 1));
  };
  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    const cleanUsers = users
      .map((u) => ({ ...u, name: u.name.trim() }))
      .filter((u) => u.name.length > 0);
    const input: CreateSystemInput = {
      business_name: businessName.trim(),
      business_type: businessType,
      subdomain: subdomain.trim(),
      crm_lead_id: leadId,
      crm_lead_name: leadName,
      crm_company_id: companyId,
      ...(usystemsContactId ? { usystems_contact_id: usystemsContactId } : {}),
      language,
      currency,
      inventory_enabled: inventoryEnabled,
      notes: notes.trim(),
      admin_username: adminUsername.trim() || 'admin',
      multi_inventory: multiInventory,
      multi_currency: multiCurrency,
      multi_lot: multiLot,
      ai_assistant_enabled: aiAssistant,
      dynamic_reporting_enabled: dynamicReporting,
      multi_language_enabled: multiLanguage,
      module_flags: moduleFlagsPayload(moduleFlags),
      max_users: toIntOrNull(maxUsers),
      max_main_inventories: toIntOrNull(maxInventories),
      max_employees: toIntOrNull(maxEmployees),
      max_bookable_resources: toIntOrNull(maxResources),
      max_currencies: toIntOrNull(maxCurrencies),
      requested_users: cleanUsers,
      ...(customLogo ? { custom_logo: customLogo } : {}),
      ...(customBackground ? { custom_background: customBackground } : {}),
    };
    try {
      const system = await createSystem(input);
      clearDockablePage();
      navigate(`/system/${system.id}`);
    } catch (err) {
      setError(err instanceof SystemApiError ? err.message : TSYS.createError);
      setBusy(false);
    }
  };

  if (!leadId) {
    return (
      <main className="page">
        <div className="page-head anim">
          <h1>{TSYS.newSystem}</h1>
        </div>
        <div className="error-banner" style={{ marginTop: 12 }}>{TSYS.leadRequired}</div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{TSYS.newSystem}</h1>
          <div className="sub">{TSYS.pageSub}</div>
        </div>
      </div>

      <div className="demo-steps anim" role="list">
        {STEPS.map((label, index) => {
          const n = index + 1;
          const cls = n === step ? 'active' : n < step ? 'done' : '';
          return (
            <div key={label} className={`demo-step ${cls}`} role="listitem">
              <span className="demo-step-num">{n < step ? '✓' : n}</span>
              <span className="demo-step-label">{label}</span>
            </div>
          );
        })}
      </div>

      <div style={{ maxWidth: 560 }}>
        {step === 1 && (
          <div className="card card-pad fieldset anim d1">
            <legend>{TSYS.step1}</legend>
            <div className="demo-note-banner" style={{ marginBottom: 12 }}>
              {TSYS.forLead} <b>{leadName || companyName || '—'}</b>
            </div>
            <div className="demo-biz-grid">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.key}
                  className={`demo-biz-card ${businessType === opt.key ? 'selected' : ''}`}
                  onClick={() => setBusinessType(opt.key)}
                >
                  <span className="demo-biz-emoji">{opt.emoji}</span>
                  <span className="demo-biz-label">{opt.label}</span>
                  <span className="demo-biz-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
            <div className="fld" style={{ marginTop: 14 }}>
              <label htmlFor="sys-name">{TSYS.businessName} *</label>
              <input
                id="sys-name"
                value={businessName}
                placeholder={TSYS.businessNamePh}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label htmlFor="sys-sub">{TSYS.subdomain} *</label>
              <input
                id="sys-sub"
                dir="ltr"
                value={subdomain}
                placeholder={TSYS.subdomainPh}
                onChange={(e) => setSubdomain(e.target.value)}
              />
              {preview && (
                <div className="demo-sub-hint">
                  <span>{TSYS.subdomainHint}</span>{' '}
                  <code dir="ltr">{preview}.platform.usystems.af</code>
                  {checkState === 'checking' && <span className="demo-sub-checking"> · {TSYS.subdomainChecking}</span>}
                  {checkState === 'available' && <span className="demo-sub-ok"> · {TSYS.subdomainAvailable}</span>}
                  {checkState === 'taken' && <span className="demo-sub-bad"> · {TSYS.subdomainTaken}</span>}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card card-pad fieldset anim d1">
            <legend>{TSYS.step2}</legend>
            <div className="f2">
              <div className="fld">
                <label htmlFor="sys-lang">{TSYS.language}</label>
                <select id="sys-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="sys-cur">{TSYS.currency}</label>
                <select id="sys-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="demo-check-row">
              <input type="checkbox" checked={inventoryEnabled} onChange={(e) => setInventoryEnabled(e.target.checked)} />
              <span>
                {TSYS.inventory}
                <span className="demo-check-hint">{TSYS.inventoryHint}</span>
              </span>
            </label>

            <div className="demo-content-toggles">
              <div className="demo-toggles-title">{TSYS.capabilitiesTitle}</div>
              <label className="demo-check-row demo-toggle">
                <input type="checkbox" checked={multiInventory} onChange={(e) => setMultiInventory(e.target.checked)} />
                <span>{TSYS.optMultiInventory}</span>
              </label>
              <label className="demo-check-row demo-toggle">
                <input type="checkbox" checked={multiCurrency} onChange={(e) => setMultiCurrency(e.target.checked)} />
                <span>{TSYS.optMultiCurrency}</span>
              </label>
              <label className="demo-check-row demo-toggle" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={multiLot} onChange={(e) => setMultiLot(e.target.checked)} />
                <span>{TSYS.optMultiLot}</span>
              </label>
            </div>

            <div className="demo-content-toggles">
              <div className="demo-toggles-title">{TSYS.entitlementsTitle}</div>
              <label className="demo-check-row demo-toggle">
                <input type="checkbox" checked={aiAssistant} onChange={(e) => setAiAssistant(e.target.checked)} />
                <span>{TSYS.optAiAssistant}</span>
              </label>
              <label className="demo-check-row demo-toggle">
                <input type="checkbox" checked={dynamicReporting} onChange={(e) => setDynamicReporting(e.target.checked)} />
                <span>{TSYS.optDynamicReporting}</span>
              </label>
              <label className="demo-check-row demo-toggle" style={{ marginBottom: 0 }}>
                <input type="checkbox" checked={multiLanguage} onChange={(e) => setMultiLanguage(e.target.checked)} />
                <span>{TSYS.optMultiLanguage}</span>
              </label>
            </div>

            <div className="demo-content-toggles">
              <div className="demo-toggles-title">{TSYS.brandingTitle}</div>
              <div className="f2">
                <div className="fld" style={{ marginBottom: 0 }}>
                  <label>{TSYS.optCustomLogo}</label>
                  <input type="file" accept="image/*" onChange={(e) => pickImage(e, setCustomLogo)} />
                  {customLogo && <img src={customLogo} className="demo-brand-preview" alt="logo" />}
                </div>
                <div className="fld" style={{ marginBottom: 0 }}>
                  <label>{TSYS.optCustomBackground}</label>
                  <input type="file" accept="image/*" onChange={(e) => pickImage(e, setCustomBackground)} />
                  {customBackground && <img src={customBackground} className="demo-brand-preview" alt="background" />}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="card card-pad fieldset anim d1">
            <legend>{TSYS.step3}</legend>
            <div className="demo-content-toggles" style={{ marginTop: 0 }}>
              <div className="demo-toggles-title">{TSYS.modulesTitle}</div>
              {CUSTOMER_SYSTEM_MODULES.map((mod) => (
                <label key={mod.key} className="demo-check-row demo-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(moduleFlags[mod.key])}
                    onChange={(e) => setModuleFlags((prev) => ({ ...prev, [mod.key]: e.target.checked }))}
                  />
                  <span>{mod.label}</span>
                </label>
              ))}
            </div>
            <div className="demo-content-toggles">
              <div className="demo-toggles-title">
                {TSYS.limitsTitle} <span className="demo-check-hint">· {TSYS.limitsHint}</span>
              </div>
              <div className="f2">
                <div className="fld">
                  <label>{TSYS.limMaxUsers}</label>
                  <input inputMode="numeric" dir="ltr" value={maxUsers} placeholder={TSYS.unlimited} onChange={(e) => setMaxUsers(e.target.value)} />
                </div>
                <div className="fld">
                  <label>{TSYS.limMaxInventories}</label>
                  <input inputMode="numeric" dir="ltr" value={maxInventories} placeholder={TSYS.unlimited} onChange={(e) => setMaxInventories(e.target.value)} />
                </div>
              </div>
              <div className="f2">
                <div className="fld">
                  <label>{TSYS.limMaxEmployees}</label>
                  <input inputMode="numeric" dir="ltr" value={maxEmployees} placeholder={TSYS.unlimited} onChange={(e) => setMaxEmployees(e.target.value)} />
                </div>
                <div className="fld">
                  <label>{TSYS.limMaxResources}</label>
                  <input inputMode="numeric" dir="ltr" value={maxResources} placeholder={TSYS.unlimited} onChange={(e) => setMaxResources(e.target.value)} />
                </div>
              </div>
              <div className="fld" style={{ marginBottom: 0 }}>
                <label>{TSYS.limMaxCurrencies}</label>
                <input inputMode="numeric" dir="ltr" value={maxCurrencies} placeholder={TSYS.unlimited} onChange={(e) => setMaxCurrencies(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="card card-pad fieldset anim d1">
            <legend>{TSYS.step4}</legend>
            <div className="fld">
              <label htmlFor="sys-admin">{TSYS.adminUsername}</label>
              <input id="sys-admin" dir="ltr" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} />
              <div className="demo-sub-hint">{TSYS.adminUsernameHint}</div>
            </div>
            <div className="demo-toggles-title">{TSYS.usersTitle}</div>
            <div className="demo-sub-hint" style={{ marginBottom: 8 }}>{TSYS.usersHint}</div>
            {users.length === 0 && <div className="demo-note-banner">{TSYS.noUsers}</div>}
            {users.map((user, index) => (
              <div key={index} className="card card-pad" style={{ marginBottom: 8 }}>
                <div className="f2">
                  <div className="fld">
                    <label>{TSYS.userName} *</label>
                    <input value={user.name} placeholder={TSYS.userNamePh} onChange={(e) => updateUser(index, { name: e.target.value })} />
                  </div>
                  <div className="fld">
                    <label>{TSYS.userRole}</label>
                    <select value={user.role} onChange={(e) => updateUser(index, { role: e.target.value as SystemUserRole })}>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="f2">
                  <div className="fld" style={{ marginBottom: 0 }}>
                    <label>{TSYS.userPhone}</label>
                    <input dir="ltr" value={user.phone ?? ''} onChange={(e) => updateUser(index, { phone: e.target.value })} />
                  </div>
                  <div className="fld" style={{ marginBottom: 0 }}>
                    <label>{TSYS.userUsername}</label>
                    <input dir="ltr" value={user.login_username ?? ''} placeholder={TSYS.userUsernamePh} onChange={(e) => updateUser(index, { login_username: e.target.value })} />
                  </div>
                </div>
                <button type="button" className="btn line sm" style={{ marginTop: 8 }} onClick={() => removeUser(index)}>
                  {TSYS.removeUser}
                </button>
              </div>
            ))}
            <button type="button" className="btn line" onClick={addUser}>+ {TSYS.addUser}</button>
          </div>
        )}

        {step === 5 && (
          <div className="card card-pad fieldset anim d1">
            <legend>{TSYS.step5}</legend>
            <div className="demo-review">
              <div><span>{TSYS.forLeadLabel}</span><b>{leadName || companyName || '—'}</b></div>
              <div><span>{TSYS.customerType}</span><b>{TYPE_OPTIONS.find((o) => o.key === businessType)?.label}</b></div>
              <div><span>{TSYS.businessName}</span><b>{businessName}</b></div>
              <div><span>{TSYS.subdomain}</span><b dir="ltr">{preview}</b></div>
              <div><span>{TSYS.currency}</span><b>{currency}</b></div>
              <div><span>{TSYS.adminUsername}</span><b dir="ltr">{adminUsername || 'admin'}</b></div>
              <div><span>{TSYS.usersTitle}</span><b>{users.filter((u) => u.name.trim()).length}</b></div>
            </div>
            <div className="fld" style={{ marginTop: 12, marginBottom: 0 }}>
              <label htmlFor="sys-notes">{TSYS.forLeadLabel}</label>
              <textarea id="sys-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        {error !== null && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}

        <div className="demo-wizard-actions">
          {step > 1 && (
            <button type="button" className="btn line" onClick={goBack} disabled={busy}>{TSYS.back}</button>
          )}
          {step < 5 ? (
            <button type="button" className="btn gold block" onClick={goNext} disabled={!canNext()}>{TSYS.next}</button>
          ) : (
            <button type="button" className="btn gold block" onClick={handleCreate} disabled={busy}>
              {busy ? TSYS.creating : TSYS.create}
            </button>
          )}
        </div>
      </div>
    </main>
  );
};

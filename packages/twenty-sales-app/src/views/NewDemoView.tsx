import { useEffect, useMemo, useRef, useState } from 'react';

import {
  checkDemoSubdomain,
  createDemo,
  DemoApiError,
  type CreateDemoInput,
  type DemoBusinessType,
} from '../api/demoSystems';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import { announceDockablePage, clearDockablePage } from '../lib/workbench';
import { toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { TDEMO } from '../lib/strings';

type BusinessOption = {
  key: DemoBusinessType;
  label: string;
  desc: string;
  emoji: string;
};

const BUSINESS_OPTIONS: BusinessOption[] = [
  { key: 'mobile_store', label: TDEMO.bizMobile, desc: TDEMO.bizMobileDesc, emoji: '📱' },
  { key: 'home_appliances', label: TDEMO.bizAppliances, desc: TDEMO.bizAppliancesDesc, emoji: '🧺' },
  { key: 'other', label: TDEMO.bizOther, desc: TDEMO.bizOtherDesc, emoji: '🏪' },
];

const CURRENCIES = ['AFN', 'USD'];

// Business types that ship a rich demo dataset (custom fields, images,
// storefront, branding, documents) whose pieces the agent can toggle.
const RICH_DEMO_TYPES: DemoBusinessType[] = ['mobile_store'];
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'fa', label: TDEMO.langFa },
  { code: 'en', label: TDEMO.langEn },
  { code: 'ps', label: TDEMO.langPs },
];

const STEPS = [TDEMO.step1, TDEMO.step2, TDEMO.step3, TDEMO.step4];

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const addDaysKey = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

const daysFromKey = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return 14;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil((target.getTime() - now.getTime()) / 86400000));
};

// The agent types a base name; the -demo afterfix is what the platform enforces.
const previewSubdomain = (raw: string): string => {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  if (!base) return '';
  return base.endsWith('-crmdemo') ? base : `${base}-crmdemo`;
};

type CheckState = 'idle' | 'checking' | 'available' | 'taken';

export const NewDemoView = () => {
  const [step, setStep] = useState(1);

  const [businessType, setBusinessType] = useState<DemoBusinessType>('mobile_store');
  const [businessName, setBusinessName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [language, setLanguage] = useState('fa');
  const [currency, setCurrency] = useState('AFN');
  const [inventoryEnabled, setInventoryEnabled] = useState(true);
  const [enableStorefront, setEnableStorefront] = useState(true);
  const [enableLogo, setEnableLogo] = useState(true);
  const [enableBackground, setEnableBackground] = useState(true);
  const [seedDocuments, setSeedDocuments] = useState(true);
  const [multiInventory, setMultiInventory] = useState(true);
  const [multiCurrency, setMultiCurrency] = useState(true);
  const [multiLot, setMultiLot] = useState(true);
  const [customLogo, setCustomLogo] = useState<string>('');
  const [customBackground, setCustomBackground] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState(addDaysKey(14));
  const [notes, setNotes] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    announceDockablePage(TDEMO.newDemo, 'new');
    return clearDockablePage;
  }, []);

  const preview = useMemo(() => previewSubdomain(subdomain), [subdomain]);
  const durationDays = useMemo(() => daysFromKey(expiryDate), [expiryDate]);

  // Read a chosen image as a data URL for the custom login logo/background.
  const pickImage = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError(TDEMO.imageTooLarge);
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setter(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  };

  // Debounced availability check while typing the subdomain (step 2).
  useEffect(() => {
    window.clearTimeout(checkTimer.current);
    if (!preview) {
      setCheckState('idle');
      return;
    }
    setCheckState('checking');
    checkTimer.current = window.setTimeout(async () => {
      try {
        const result = await checkDemoSubdomain(subdomain);
        setCheckState(result.available ? 'available' : 'taken');
      } catch {
        setCheckState('idle');
      }
    }, 500);
    return () => window.clearTimeout(checkTimer.current);
  }, [subdomain, preview]);

  const canNext = (): boolean => {
    if (step === 1) return businessName.trim().length > 0;
    if (step === 2) return preview.length > 0 && checkState !== 'taken';
    if (step === 3) return durationDays >= 1;
    if (step === 4) return agreementAccepted;
    return true;
  };

  const goNext = () => {
    setError(null);
    if (!canNext()) {
      if (step === 4 && !agreementAccepted) setError(TDEMO.agreementRequired);
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };
  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const handleCreate = async () => {
    if (!agreementAccepted) {
      setError(TDEMO.agreementRequired);
      return;
    }
    setBusy(true);
    setError(null);
    const input: CreateDemoInput = {
      business_name: businessName.trim(),
      business_type: businessType,
      subdomain: subdomain.trim(),
      language,
      currency,
      inventory_enabled: inventoryEnabled,
      notes: notes.trim(),
      duration_days: durationDays,
      agreement_accepted: agreementAccepted,
      enable_storefront: enableStorefront,
      enable_logo: enableLogo,
      enable_background: enableBackground,
      seed_documents: seedDocuments,
      multi_inventory: multiInventory,
      multi_currency: multiCurrency,
      multi_lot: multiLot,
      ...(customLogo ? { custom_logo: customLogo } : {}),
      ...(customBackground ? { custom_background: customBackground } : {}),
    };
    try {
      const demo = await createDemo(input);
      clearDockablePage();
      navigate(`/demo/${demo.id}`);
    } catch (err) {
      const message =
        err instanceof DemoApiError ? err.message : TDEMO.createError;
      setError(message);
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{TDEMO.newDemo}</h1>
          <div className="sub">{TDEMO.pageSub}</div>
        </div>
      </div>

      <div className="demo-steps anim" role="list">
        {STEPS.map((label, index) => {
          const n = index + 1;
          const cls = n === step ? 'active' : n < step ? 'done' : '';
          return (
            <div key={label} className={`demo-step ${cls}`} role="listitem">
              <span className="demo-step-num">{n < step ? '✓' : toPersianDigits(String(n))}</span>
              <span className="demo-step-label">{label}</span>
            </div>
          );
        })}
      </div>

      <div style={{ maxWidth: 560 }}>
        {step === 1 && (
          <div className="card card-pad fieldset anim d1">
            <legend>
              <i>۱</i> {TDEMO.step1}
            </legend>
            <div className="demo-biz-grid">
              {BUSINESS_OPTIONS.map((opt) => (
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
            <div className="fld" style={{ marginTop: 14, marginBottom: 0 }}>
              <label htmlFor="demo-name">{TDEMO.businessName} *</label>
              <input
                id="demo-name"
                autoFocus
                value={businessName}
                placeholder={TDEMO.businessNamePh}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card card-pad fieldset anim d1">
            <legend>
              <i>۲</i> {TDEMO.step2}
            </legend>
            <div className="fld">
              <label htmlFor="demo-sub">{TDEMO.subdomain} *</label>
              <input
                id="demo-sub"
                dir="ltr"
                value={subdomain}
                placeholder={TDEMO.subdomainPh}
                onChange={(e) => setSubdomain(e.target.value)}
              />
              {preview && (
                <div className="demo-sub-hint">
                  <span>{TDEMO.subdomainHint}</span>{' '}
                  <code dir="ltr">{preview}.platform.usystems.af</code>
                  {checkState === 'checking' && <span className="demo-sub-checking"> · {TDEMO.subdomainChecking}</span>}
                  {checkState === 'available' && <span className="demo-sub-ok"> · {TDEMO.subdomainAvailable}</span>}
                  {checkState === 'taken' && <span className="demo-sub-bad"> · {TDEMO.subdomainTaken}</span>}
                </div>
              )}
            </div>
            <div className="f2">
              <div className="fld">
                <label htmlFor="demo-lang">{TDEMO.language}</label>
                <select id="demo-lang" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="demo-cur">{TDEMO.currency}</label>
                <select id="demo-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="demo-check-row" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={inventoryEnabled}
                onChange={(e) => setInventoryEnabled(e.target.checked)}
              />
              <span>
                {TDEMO.inventory}
                <span className="demo-check-hint">{TDEMO.inventoryHint}</span>
              </span>
            </label>

            <div className="demo-content-toggles">
              <div className="demo-toggles-title">{TDEMO.settingsTitle}</div>
              <label className="demo-check-row demo-toggle">
                <input type="checkbox" checked={multiInventory} onChange={(e) => setMultiInventory(e.target.checked)} />
                <span>{TDEMO.optMultiInventory}</span>
              </label>
              <label className="demo-check-row demo-toggle">
                <input type="checkbox" checked={multiCurrency} onChange={(e) => setMultiCurrency(e.target.checked)} />
                <span>{TDEMO.optMultiCurrency}</span>
              </label>
              <label className="demo-check-row demo-toggle">
                <input type="checkbox" checked={multiLot} onChange={(e) => setMultiLot(e.target.checked)} />
                <span>{TDEMO.optMultiLot}</span>
              </label>
              <div className="f2" style={{ marginTop: 8 }}>
                <div className="fld" style={{ marginBottom: 0 }}>
                  <label>{TDEMO.optCustomLogo}</label>
                  <input type="file" accept="image/*" onChange={(e) => pickImage(e, setCustomLogo)} />
                  {customLogo && <img src={customLogo} className="demo-brand-preview" alt="logo" />}
                </div>
                <div className="fld" style={{ marginBottom: 0 }}>
                  <label>{TDEMO.optCustomBackground}</label>
                  <input type="file" accept="image/*" onChange={(e) => pickImage(e, setCustomBackground)} />
                  {customBackground && <img src={customBackground} className="demo-brand-preview" alt="background" />}
                </div>
              </div>
            </div>

            {RICH_DEMO_TYPES.includes(businessType) && (
              <div className="demo-content-toggles">
                <div className="demo-toggles-title">{TDEMO.demoContentTitle}</div>
                <label className="demo-check-row demo-toggle">
                  <input type="checkbox" checked={enableStorefront} onChange={(e) => setEnableStorefront(e.target.checked)} />
                  <span>{TDEMO.optStorefront}</span>
                </label>
                <label className="demo-check-row demo-toggle">
                  <input type="checkbox" checked={enableLogo} onChange={(e) => setEnableLogo(e.target.checked)} />
                  <span>{TDEMO.optLogo}</span>
                </label>
                <label className="demo-check-row demo-toggle">
                  <input type="checkbox" checked={enableBackground} onChange={(e) => setEnableBackground(e.target.checked)} />
                  <span>{TDEMO.optBackground}</span>
                </label>
                <label className="demo-check-row demo-toggle" style={{ marginBottom: 0 }}>
                  <input type="checkbox" checked={seedDocuments} onChange={(e) => setSeedDocuments(e.target.checked)} />
                  <span>{TDEMO.optDocuments}</span>
                </label>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="card card-pad fieldset anim d1">
            <legend>
              <i>۳</i> {TDEMO.step3}
            </legend>
            <div className="fld">
              <label>{TDEMO.duration}</label>
              <div className="demo-chip-row">
                {[
                  { d: 7, label: TDEMO.days7 },
                  { d: 14, label: TDEMO.days14 },
                  { d: 30, label: TDEMO.days30 },
                ].map((opt) => (
                  <button
                    type="button"
                    key={opt.d}
                    className={`demo-chip ${durationDays === opt.d ? 'selected' : ''}`}
                    onClick={() => setExpiryDate(addDaysKey(opt.d))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="fld">
              <label htmlFor="demo-exp">{TDEMO.expiresOn}</label>
              <JalaliDatePicker id="demo-exp" value={expiryDate} onChange={setExpiryDate} withTime={false} />
              <div className="demo-sub-hint">
                {toPersianDigits(String(durationDays))} {TDEMO.daysLeft}
              </div>
            </div>
            <div className="demo-note-banner">{TDEMO.expiryNote}</div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label htmlFor="demo-notes">{TDEMO.notes}</label>
              <textarea
                id="demo-notes"
                rows={2}
                value={notes}
                placeholder={TDEMO.notesPh}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="card card-pad fieldset anim d1">
            <legend>
              <i>۴</i> {TDEMO.step4}
            </legend>
            <div className="demo-agreement">{TDEMO.agreementBody}</div>
            <label className="demo-check-row demo-agree-check">
              <input
                type="checkbox"
                checked={agreementAccepted}
                onChange={(e) => setAgreementAccepted(e.target.checked)}
              />
              <span>{TDEMO.agreementAccept}</span>
            </label>

            <div className="demo-review">
              <div><span>{TDEMO.businessType}</span><b>{BUSINESS_OPTIONS.find((o) => o.key === businessType)?.label}</b></div>
              <div><span>{TDEMO.businessName}</span><b>{businessName}</b></div>
              <div><span>{TDEMO.subdomain}</span><b dir="ltr">{preview}</b></div>
              <div><span>{TDEMO.duration}</span><b>{toPersianDigits(String(durationDays))} {TDEMO.daysLeft}</b></div>
              <div><span>{TDEMO.currency}</span><b>{currency}</b></div>
            </div>
          </div>
        )}

        {error !== null && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}

        <div className="demo-wizard-actions">
          {step > 1 && (
            <button type="button" className="btn line" onClick={goBack} disabled={busy}>
              {TDEMO.back}
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="btn gold block" onClick={goNext} disabled={!canNext()}>
              {TDEMO.next}
            </button>
          ) : (
            <button
              type="button"
              className="btn gold block"
              onClick={handleCreate}
              disabled={busy || !agreementAccepted}
            >
              {busy ? TDEMO.creating : TDEMO.create}
            </button>
          )}
        </div>
      </div>
    </main>
  );
};

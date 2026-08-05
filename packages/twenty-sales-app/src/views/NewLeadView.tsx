import { useEffect, useRef, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  addProductToLead,
  fetchProducts,
  fetchReferrers,
  LEAD_SOURCES,
  registerLead,
  type NewLeadInput,
  type ProductOption,
  type Referrer,
} from '../api/records';
import { findLeadDuplicates } from '../api/duplicates';
import {
  DealLinePricingEditor,
  lineMetricNames,
} from '../components/DealLinePricingEditor';
import {
  DuplicateConfirmDialog,
  DuplicateWarning,
} from '../components/DuplicateWarning';
import { JalaliDatePicker } from '../components/JalaliDatePicker';
import { MoneyInput } from '../components/MoneyInput';
import { invalidateCache } from '../lib/cache';
import {
  blockingMatches,
  type DuplicateMatch,
  normalizeName,
  phoneKey,
} from '../lib/duplicates';
import {
  buildFactorQuantities,
  buildPriceOverrides,
  type DealLineDraft,
  emptyDealLineDraft,
  productPrimaryCurrency,
} from '../lib/dealLinePricing';
import { type CurrencyCode, toLocalInputValue } from '../lib/format';
import { clearDraft, loadDraft, saveDraft } from '../lib/prefs';
import { formatJalaliDateTime } from '../lib/jalali';
import { navigate } from '../lib/router';
import { announceDockablePage, clearDockablePage } from '../lib/workbench';
import {
  MARKETER_LABELS,
  PARTNER_TYPE_LABELS,
  SOURCE_LABELS,
  T,
  TEMP_LABELS,
} from '../lib/strings';

type NewLeadViewProps = {
  user: CurrentUser;
};

type FollowUpPreset = 'tomorrow' | 'threeDays' | 'nextWeek' | 'custom';

const presetDate = (preset: FollowUpPreset): Date => {
  const d = new Date();
  if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
  if (preset === 'threeDays') d.setDate(d.getDate() + 3);
  if (preset === 'nextWeek') d.setDate(d.getDate() + 7);
  d.setHours(9, 0, 0, 0);
  return d;
};

type Draft = {
  companyName: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  temperature: 'HOT' | 'WARM' | 'COLD' | null;
  leadSource: string;
  marketer: string;
  referrerId: string;
  estimatedValue: string;
  currency: CurrencyCode;
  firstContactNote: string;
  followUpNote: string;
  // The product the seller is quoting, if any. Older drafts predate this and
  // restore without it.
  dealLine?: DealLineDraft;
};

export const NewLeadView = ({ user }: NewLeadViewProps) => {
  // Field sellers lose connections and close tabs — never lose a half-typed lead.
  const draft = useRef(loadDraft<Draft>()).current;
  const [draftRestored, setDraftRestored] = useState(
    draft !== null && draft.companyName.trim() !== '',
  );

  const [companyName, setCompanyName] = useState(draft?.companyName ?? '');
  const [firstName, setFirstName] = useState(draft?.firstName ?? '');
  const [lastName, setLastName] = useState(draft?.lastName ?? '');
  const [phone, setPhone] = useState(draft?.phone ?? '');
  const [email, setEmail] = useState(draft?.email ?? '');
  const [temperature, setTemperature] = useState<'HOT' | 'WARM' | 'COLD' | null>(
    draft?.temperature ?? 'WARM',
  );
  const [leadSource, setLeadSource] = useState(draft?.leadSource ?? 'FIELD');
  const [marketer, setMarketer] = useState(draft?.marketer ?? '');
  const [referrerId, setReferrerId] = useState(draft?.referrerId ?? '');
  const [referrers, setReferrers] = useState<Referrer[]>([]);
  const [estimatedValue, setEstimatedValue] = useState(draft?.estimatedValue ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(draft?.currency ?? 'AFN');
  const [firstContactNote, setFirstContactNote] = useState(
    draft?.firstContactNote ?? '',
  );
  const [firstContactDate, setFirstContactDate] = useState(toLocalInputValue(new Date()));
  const [scheduleFollowUp, setScheduleFollowUp] = useState(true);
  const [followUpNote, setFollowUpNote] = useState(draft?.followUpNote ?? '');
  const [followUpPreset, setFollowUpPreset] = useState<FollowUpPreset>('tomorrow');
  const [followUpDate, setFollowUpDate] = useState(
    toLocalInputValue(presetDate('tomorrow')),
  );
  const [dealLine, setDealLine] = useState<DealLineDraft>(
    draft?.dealLine ?? emptyDealLineDraft(),
  );
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedOpportunityId, setSavedOpportunityId] = useState<string | null>(null);

  // Duplicate prevention. `acknowledged` is a fingerprint of the identifying
  // fields, so confirming once doesn't re-prompt — but editing the company name
  // or phone afterwards asks again, because it is a different lead now.
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<DuplicateMatch[] | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState<string | null>(null);

  const identityFingerprint = `${normalizeName(companyName)}|${phoneKey(phone) ?? ''}|${email.trim().toLowerCase()}`;

  const selectedProduct = products.find((p) => p.id === dealLine.productId);

  // Same reset rules as the lead-detail editor: a new product means new
  // metrics, a new currency means the typed rates no longer apply.
  const changeDealLine = (patch: Partial<DealLineDraft>) =>
    setDealLine((prev) => {
      const next = { ...prev, ...patch };

      if (patch.productId !== undefined && patch.productId !== prev.productId) {
        return {
          ...emptyDealLineDraft(),
          productId: patch.productId,
          quantity: prev.quantity,
          currencyCode: productPrimaryCurrency(
            products.find((p) => p.id === patch.productId),
          ),
        };
      }

      if (patch.currencyCode !== undefined && patch.currencyCode !== prev.currencyCode) {
        return { ...next, fixedInstall: '', fixedAnnual: '', metricRates: {} };
      }

      return next;
    });

  const saveTimer = useRef<number>(0);
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveDraft({
        companyName,
        firstName,
        lastName,
        phone,
        email,
        temperature,
        leadSource,
        marketer,
        referrerId,
        estimatedValue,
        currency,
        firstContactNote,
        followUpNote,
        dealLine,
      } satisfies Draft);
    }, 400);
    return () => window.clearTimeout(saveTimer.current);
  }, [
    dealLine,
    companyName,
    firstName,
    lastName,
    phone,
    email,
    temperature,
    leadSource,
    marketer,
    referrerId,
    estimatedValue,
    currency,
    firstContactNote,
    followUpNote,
  ]);

  // Load selectable referrers/partners once (empty list if the object is
  // absent on this environment).
  useEffect(() => {
    let active = true;
    void fetchReferrers().then((list) => {
      if (active) setReferrers(list);
    });
    // The catalog is optional here -- a seller registering a lead with no
    // product in mind shouldn't be blocked by a catalog that failed to load.
    void fetchProducts()
      .then((list) => {
        if (active) setProducts(list);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    announceDockablePage(
      companyName.trim() !== '' ? `ثبت: ${companyName.trim()}` : T.newLead,
      'new',
    );
    return clearDockablePage;
  }, [companyName]);

  // Look for duplicates while the seller types, so a company already in the CRM
  // is visible before they fill in the rest of the form.
  //
  // Keyed on the normalized fingerprint rather than the raw fields: a trailing
  // space or a switch between ی and ي describes the same lead and must not cost
  // another round of queries. Sellers are on mobile data against a 100 req/60s
  // limit, and registering the lead itself needs several of those requests.
  useEffect(() => {
    const hasName = normalizeName(companyName).length >= 3;
    const hasContact = phoneKey(phone) !== null || email.trim() !== '';
    if (!hasName && !hasContact) {
      setDuplicates([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setCheckingDuplicates(true);
      void findLeadDuplicates({ companyName, phone, email })
        .then((matches) => {
          if (active) setDuplicates(matches);
        })
        .finally(() => {
          if (active) setCheckingDuplicates(false);
        });
    }, 600);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityFingerprint]);

  const pickPreset = (preset: FollowUpPreset) => {
    setFollowUpPreset(preset);
    if (preset !== 'custom') {
      setFollowUpDate(toLocalInputValue(presetDate(preset)));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // A confirmed exact or strong match is asked about once per set of
    // identifying values. The seller can always proceed -- they are the one
    // standing in front of the customer.
    if (acknowledged !== identityFingerprint) {
      const blocking = blockingMatches(duplicates);
      if (blocking.length > 0) {
        setPendingDuplicates(blocking);
        return;
      }
    }

    await registerNow();
  };

  const registerNow = async () => {
    setPendingDuplicates(null);
    setError(null);
    setBusy(T.saving);

    const parsedValue = Number(
      estimatedValue.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[,\s]/g, ''),
    );

    const input: NewLeadInput = {
      companyName,
      contactFirstName: firstName,
      contactLastName: lastName,
      contactPhone: phone,
      contactEmail: email,
      temperature,
      leadSource,
      marketer: marketer || null,
      referrerId: referrerId || null,
      firstContactNote,
      firstContactDate: new Date(firstContactDate).toISOString(),
      followUpNote,
      followUpDate: scheduleFollowUp ? new Date(followUpDate).toISOString() : null,
      estimatedAmount:
        Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null,
      estimatedCurrency: currency,
      workspaceMemberId: user.workspaceMemberId,
    };

    try {
      const result = await registerLead(input, setBusy);

      // The lead exists from here on. A product line that fails to attach is
      // reported without discarding the registration -- the seller can add it
      // from the lead page instead of retyping everything.
      if (selectedProduct) {
        setBusy(T.savingProduct);
        const metricNames = lineMetricNames(selectedProduct, []);
        const factorQuantities = buildFactorQuantities(dealLine, metricNames);
        const priceOverrides = buildPriceOverrides(
          selectedProduct,
          dealLine,
          metricNames,
        );

        try {
          await addProductToLead({
            opportunityId: result.opportunityId,
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            quantity: Math.max(1, Number(dealLine.quantity) || 1),
            ...(Object.keys(factorQuantities).length > 0 ? { factorQuantities } : {}),
            ...(dealLine.discountRuleId
              ? { discountRuleId: dealLine.discountRuleId }
              : {}),
            ...(priceOverrides ? { priceOverrides } : {}),
          });
        } catch (productError) {
          clearDraft();
          invalidateCache('leads:');
          invalidateCache('today:');
          // Resubmitting from here would create a second lead, so the form
          // closes itself and points at the one that was saved.
          setSavedOpportunityId(result.opportunityId);
          setError(
            `${T.leadSavedProductFailed}: ${productError instanceof Error ? productError.message : ''}`,
          );
          setBusy(null);
          return;
        }
      }

      clearDraft();
      invalidateCache('leads:');
      invalidateCache('today:');
      navigate(`/lead/${result.opportunityId}`);
    } catch (err) {
      setError(
        `${busy ?? T.saving} ${T.stepFailed}: ${err instanceof Error ? err.message : ''}`,
      );
      setBusy(null);
    }
  };

  const summaryReady = companyName.trim() !== '';
  const hasContact = firstName.trim() !== '' || lastName.trim() !== '';

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{T.newLead}</h1>
          <div className="sub">همه چیز در یک صفحه — شرکت، شخص تماس، تماس اول و پیگیری</div>
        </div>
      </div>

      {draftRestored && (
        <div
          className="card card-pad anim"
          style={{
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderColor: 'var(--lapis-500)',
          }}
        >
          <span style={{ flex: 1, fontSize: 13 }}>
            📝 پیش‌نویس قبلی بازیابی شد — می‌توانید ادامه بدهید.
          </span>
          <button
            type="button"
            className="btn line sm"
            onClick={() => {
              clearDraft();
              setCompanyName('');
              setFirstName('');
              setLastName('');
              setPhone('');
              setEmail('');
              setMarketer('');
              setReferrerId('');
              setEstimatedValue('');
              setFirstContactNote('');
              setFollowUpNote('');
              setDraftRestored(false);
            }}
          >
            شروع از نو
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div>
            <div className="card card-pad fieldset anim d1">
              <legend>
                <i>۱</i> {T.company}
              </legend>
              <div className="fld" style={{ marginBottom: 0 }}>
                <label htmlFor="nl-company">{T.companyName} *</label>
                <input
                  id="nl-company"
                  required
                  autoFocus
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <DuplicateWarning
                matches={duplicates}
                checking={checkingDuplicates && duplicates.length === 0}
              />
            </div>

            <div className="card card-pad fieldset anim d2">
              <legend>
                <i>۲</i> {T.contactPerson}
              </legend>
              <div className="f2">
                <div className="fld">
                  <label htmlFor="nl-first">{T.firstName}</label>
                  <input
                    id="nl-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="fld">
                  <label htmlFor="nl-last">{T.lastName}</label>
                  <input
                    id="nl-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="f2">
                <div className="fld" style={{ marginBottom: 0 }}>
                  <label htmlFor="nl-phone">{T.phone}</label>
                  <input
                    id="nl-phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    placeholder="07…"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="fld" style={{ marginBottom: 0 }}>
                  <label htmlFor="nl-email">{T.emailOptional}</label>
                  <input
                    id="nl-email"
                    type="email"
                    inputMode="email"
                    dir="ltr"
                    placeholder="example@company.af"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="card card-pad fieldset anim d3">
              <legend>
                <i>۳</i> {T.qualification}
              </legend>
              <div className="f2">
                <div className="fld">
                  <label>{T.temperature}</label>
                  <div className="temp-seg">
                    {(['HOT', 'WARM', 'COLD'] as const).map((t) => (
                      <button
                        type="button"
                        key={t}
                        className={`t-${t.toLowerCase()} ${temperature === t ? 'on' : ''}`}
                        onClick={() => setTemperature(temperature === t ? null : t)}
                      >
                        {TEMP_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="fld">
                  <label htmlFor="nl-source">{T.leadSource}</label>
                  <select
                    id="nl-source"
                    value={leadSource}
                    onChange={(e) => setLeadSource(e.target.value)}
                  >
                    {LEAD_SOURCES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {SOURCE_LABELS[s.value] ?? s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="f2">
                <div className="fld">
                  <label htmlFor="nl-marketer">بازاریاب</label>
                  <select
                    id="nl-marketer"
                    value={marketer}
                    onChange={(e) => setMarketer(e.target.value)}
                  >
                    <option value="">—</option>
                    {Object.entries(MARKETER_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fld">
                  <label htmlFor="nl-referrer">معرف</label>
                  <select
                    id="nl-referrer"
                    value={referrerId}
                    onChange={(e) => setReferrerId(e.target.value)}
                    disabled={referrers.length === 0}
                  >
                    <option value="">—</option>
                    {referrers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.partnerType
                          ? ` (${PARTNER_TYPE_LABELS[r.partnerType] ?? r.partnerType})`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="fld" style={{ maxWidth: 360, marginBottom: 0 }}>
                <label htmlFor="nl-value">ارزش تخمینی (اختیاری)</label>
                <MoneyInput
                  id="nl-value"
                  amount={estimatedValue}
                  onAmountChange={setEstimatedValue}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  placeholder="مثلاً 300000"
                />
              </div>
            </div>

            <div className="card card-pad fieldset anim d4">
              <legend>
                <i>۴</i> {T.firstContact}
              </legend>
              <div className="fld">
                <label htmlFor="nl-note">{T.firstContactHint}</label>
                <textarea
                  id="nl-note"
                  placeholder={T.firstContactPlaceholder}
                  value={firstContactNote}
                  onChange={(e) => setFirstContactNote(e.target.value)}
                />
              </div>
              <div className="fld" style={{ maxWidth: 300, marginBottom: 0 }}>
                <label htmlFor="nl-date">{T.when}</label>
                <JalaliDatePicker
                  id="nl-date"
                  value={firstContactDate}
                  onChange={setFirstContactDate}
                />
              </div>
            </div>

            <div className="card card-pad fieldset anim d5">
              <legend>
                <i>۵</i> {T.followUp}
              </legend>
              <div className="fld">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={scheduleFollowUp}
                    onChange={(e) => setScheduleFollowUp(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  {T.scheduleFollowUp}
                </label>
              </div>
              {scheduleFollowUp && (
                <>
                  <div className="fld">
                    <label htmlFor="nl-fu-note">{T.followUpWhat}</label>
                    <input
                      id="nl-fu-note"
                      placeholder={T.followUpPlaceholder}
                      value={followUpNote}
                      onChange={(e) => setFollowUpNote(e.target.value)}
                    />
                  </div>
                  <div className="fld" style={{ marginBottom: 0 }}>
                    <label>{T.when}</label>
                    <div className="quick-chips">
                      <button
                        type="button"
                        className={followUpPreset === 'tomorrow' ? 'on' : ''}
                        onClick={() => pickPreset('tomorrow')}
                      >
                        {T.tomorrowMorning}
                      </button>
                      <button
                        type="button"
                        className={followUpPreset === 'threeDays' ? 'on' : ''}
                        onClick={() => pickPreset('threeDays')}
                      >
                        {T.inThreeDays}
                      </button>
                      <button
                        type="button"
                        className={followUpPreset === 'nextWeek' ? 'on' : ''}
                        onClick={() => pickPreset('nextWeek')}
                      >
                        {T.nextWeek}
                      </button>
                      <button
                        type="button"
                        className={followUpPreset === 'custom' ? 'on' : ''}
                        onClick={() => pickPreset('custom')}
                      >
                        {T.customTime}
                      </button>
                    </div>
                    {followUpPreset === 'custom' && (
                      <div style={{ marginTop: 8, maxWidth: 300 }}>
                        <JalaliDatePicker
                          value={followUpDate}
                          onChange={setFollowUpDate}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {products.length > 0 && (
              <div className="card card-pad fieldset anim d5">
                <legend>
                  <i>۶</i> {T.productSection}
                </legend>
                <div className="sub" style={{ marginBottom: 10 }}>
                  {T.productSectionHint}
                </div>
                <DealLinePricingEditor
                  draft={dealLine}
                  onChange={changeDealLine}
                  products={products}
                  showPackages={false}
                  showDiscountRules={false}
                />
              </div>
            )}
          </div>

          <div className="card card-pad summary-card anim d2">
            <h3>خلاصه ثبت</h3>
            <div className="sub">با یک کلیک، همه این رکوردها ساخته می‌شوند:</div>
            <ul>
              <li>
                <span className={`st ${summaryReady ? '' : 'off'}`}>✓</span>
                <span>
                  {T.company}: <b>{companyName.trim() || '—'}</b>
                </span>
              </li>
              <li>
                <span className={`st ${hasContact ? '' : 'off'}`}>✓</span>
                <span>
                  {T.contactPerson}:{' '}
                  <b>{hasContact ? `${firstName} ${lastName}`.trim() : '—'}</b>
                </span>
              </li>
              <li>
                <span className={`st ${summaryReady ? '' : 'off'}`}>✓</span>
                <span>
                  لید: <b>«لید جدید»{temperature ? ` · ${TEMP_LABELS[temperature]}` : ''}</b>
                </span>
              </li>
              <li>
                <span className={`st ${firstContactNote.trim() !== '' ? '' : 'off'}`}>✓</span>
                <span>گزارش تماس اول + یادداشت</span>
              </li>
              <li>
                <span className={`st ${selectedProduct ? '' : 'off'}`}>✓</span>
                <span>
                  {T.productSection}: <b>{selectedProduct?.name ?? '—'}</b>
                </span>
              </li>
              <li>
                <span className={`st ${scheduleFollowUp ? '' : 'off'}`}>✓</span>
                <span>
                  وظیفه پیگیری:{' '}
                  <b>
                    {scheduleFollowUp
                      ? followUpPreset === 'tomorrow'
                        ? T.tomorrowMorning
                        : followUpPreset === 'threeDays'
                          ? T.inThreeDays
                          : followUpPreset === 'nextWeek'
                            ? T.nextWeek
                            : formatJalaliDateTime(followUpDate)
                      : '—'}
                  </b>
                </span>
              </li>
            </ul>
            {error !== null && <div className="error-banner">{error}</div>}
            {savedOpportunityId !== null ? (
              <button
                className="btn gold block"
                type="button"
                style={{ padding: 12 }}
                onClick={() => navigate(`/lead/${savedOpportunityId}`)}
              >
                {T.openSavedLead}
              </button>
            ) : (
              <button
                className="btn gold block"
                type="submit"
                disabled={busy !== null}
                style={{ padding: 12 }}
              >
                {busy ?? `${T.registerLead} ✓`}
              </button>
            )}
            <div className="sub" style={{ textAlign: 'center', marginTop: 8 }}>
              ثبت کامل در کمتر از ۳۰ ثانیه
            </div>
          </div>
        </div>
      </form>

      {pendingDuplicates !== null && (
        <DuplicateConfirmDialog
          matches={pendingDuplicates}
          onCancel={() => setPendingDuplicates(null)}
          onRegisterAnyway={() => {
            setAcknowledged(identityFingerprint);
            void registerNow();
          }}
        />
      )}
    </main>
  );
};

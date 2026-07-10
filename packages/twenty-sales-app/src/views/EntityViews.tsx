import { useState } from 'react';

import {
  fetchLeads,
  fetchNote,
  fetchPerson,
  type LeadSummary,
} from '../api/records';
import { CompanyCard } from '../components/LeadPanels';
import { WhatsAppModal } from '../components/WhatsAppModal';
import {
  IconBuilding,
  IconMail,
  IconNote,
  IconPhone,
  IconSms,
  IconWhatsApp,
} from '../components/icons';
import { useCached } from '../lib/cache';
import { formatAfn, fullPhone, personName } from '../lib/format';
import { formatJalaliDateTime, toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { STAGE_LABELS, T, TEMP_LABELS } from '../lib/strings';

const ViewSkeleton = () => (
  <main className="page">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="skeleton" style={{ height: 56, maxWidth: 420 }} />
      <div className="skeleton" style={{ height: 200 }} />
    </div>
  </main>
);

const RelatedLeads = ({ leads }: { leads: LeadSummary[] }) => (
  <div className="card anim d2">
    <div className="card-pad" style={{ paddingBottom: 8 }}>
      <h3>
        لیدهای مرتبط{' '}
        <span className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>
          ({toPersianDigits(leads.length)})
        </span>
      </h3>
    </div>
    {leads.length === 0 && <div className="empty-state">{T.noLeadsFound}</div>}
    {leads.map((lead) => (
      <div key={lead.id} className="deal-row" onClick={() => navigate(`/lead/${lead.id}`)}>
        <span className="deal-logo">{lead.name.charAt(0)}</span>
        <div className="deal-main">
          <div className="deal-name">{lead.name}</div>
          <div className="deal-sub">
            {STAGE_LABELS[lead.stage ?? ''] ?? '—'}
            {lead.temperature ? ` · ${TEMP_LABELS[lead.temperature] ?? ''}` : ''}
          </div>
        </div>
        {(lead.amount?.amountMicros ?? 0) > 0 && (
          <span className="deal-val num">{formatAfn(lead.amount?.amountMicros)}</span>
        )}
      </div>
    ))}
  </div>
);

// ---------- note viewer ----------

export const NoteView = ({ noteId }: { noteId: string }) => {
  const { data: note, error } = useCached(`note:${noteId}`, () => fetchNote(noteId));

  if (!note) {
    return error ? (
      <main className="page">
        <div className="error-banner">{error}</div>
      </main>
    ) : (
      <ViewSkeleton />
    );
  }

  const chips = note.targets.flatMap((t) => {
    const out: { label: string; to: string }[] = [];
    if (t.opportunity) out.push({ label: `لید: ${t.opportunity.name}`, to: `/lead/${t.opportunity.id}` });
    if (t.company) out.push({ label: `شرکت: ${t.company.name}`, to: `/company/${t.company.id}` });
    if (t.person) out.push({ label: `شخص: ${personName(t.person)}`, to: `/person/${t.person.id}` });
    return out;
  });

  return (
    <main className="page" style={{ maxWidth: 860 }}>
      <div className="lead-hero anim">
        <div className="hero-logo" style={{ background: 'linear-gradient(140deg, var(--warm), #7a4508)' }}>
          <IconNote size={24} />
        </div>
        <div className="hero-main">
          <h1>{note.title || T.note}</h1>
          <div className="hero-meta">
            <span className="num">{formatJalaliDateTime(note.createdAt)}</span>
            {note.createdBy?.name && <span>نویسنده: {note.createdBy.name}</span>}
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="quick-chips anim d1" style={{ marginBottom: 14 }}>
          {chips.map((chip) => (
            <button key={chip.to} type="button" onClick={() => navigate(chip.to)}>
              {chip.label} ←
            </button>
          ))}
        </div>
      )}

      <div className="card card-pad anim d2">
        <div
          style={{
            whiteSpace: 'pre-wrap',
            overflowWrap: 'break-word',
            fontSize: 14,
            lineHeight: 1.9,
          }}
        >
          {note.bodyV2?.markdown?.trim() || '—'}
        </div>
      </div>
    </main>
  );
};

// ---------- company viewer ----------

export const CompanyView = ({ companyId }: { companyId: string }) => {
  const { data: leads } = useCached(`company-leads:${companyId}`, () =>
    fetchLeads({ companyId, limit: 30 }),
  );
  const name = leads?.[0]?.company?.name;

  return (
    <main className="page" style={{ maxWidth: 980 }}>
      <div className="lead-hero anim">
        <div className="hero-logo">
          <IconBuilding size={24} />
        </div>
        <div className="hero-main">
          <h1>{name ?? '…'}</h1>
          <div className="hero-meta">
            <span>شرکت</span>
          </div>
        </div>
      </div>
      <div className="detail-grid">
        <div className="stack">{leads === null ? <ViewSkeleton /> : <RelatedLeads leads={leads} />}</div>
        <div className="stack">
          <CompanyCard companyId={companyId} />
        </div>
      </div>
    </main>
  );
};

// ---------- person viewer ----------

export const PersonView = ({ personId }: { personId: string }) => {
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const { data, error } = useCached(`person:${personId}`, async () => {
    const person = await fetchPerson(personId);
    const leads = await fetchLeads({ pointOfContactId: personId, limit: 20 });
    return { person, leads };
  });

  if (!data) {
    return error ? (
      <main className="page">
        <div className="error-banner">{error}</div>
      </main>
    ) : (
      <ViewSkeleton />
    );
  }

  const { person, leads } = data;
  const phone = fullPhone(person.phones);
  const email = person.emails?.primaryEmail ?? null;

  return (
    <main className="page" style={{ maxWidth: 980 }}>
      <div className="lead-hero anim">
        <div className="hero-logo">{person.name.firstName.charAt(0) || '؟'}</div>
        <div className="hero-main">
          <h1>{personName(person)}</h1>
          <div className="hero-meta">
            {person.jobTitle && <span>{person.jobTitle}</span>}
            {person.company && (
              <button
                type="button"
                className="lead-chip"
                style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 12 }}
                onClick={() => navigate(`/company/${person.company?.id}`)}
              >
                {person.company.name} ←
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="stack">
          <RelatedLeads leads={leads} />
        </div>
        <div className="stack">
          <div className="card card-pad anim d1">
            <h3>{T.contactPerson}</h3>
            <div className="contact-rows">
              <div className="c-row">
                <span>{T.phone}</span>
                <b className="num" dir="ltr">
                  {phone ?? '—'}
                </b>
              </div>
              {email && (
                <div className="c-row">
                  <span>{T.email}</span>
                  <b dir="ltr" style={{ fontSize: 12 }}>
                    {email}
                  </b>
                </div>
              )}
            </div>
            <div className="actions-grid" style={{ marginTop: 14 }}>
              <button
                className="a-btn"
                disabled={!phone}
                onClick={() => phone && (window.location.href = `tel:${phone}`)}
              >
                <IconPhone size={19} />
                {T.call}
              </button>
              <button
                className="a-btn"
                disabled={!phone}
                onClick={() => phone && (window.location.href = `sms:${phone}`)}
              >
                <IconSms size={19} />
                {T.sms}
              </button>
              <button className="a-btn" onClick={() => setShowWhatsApp(true)}>
                <IconWhatsApp size={19} />
                {T.whatsapp}
              </button>
              <button
                className="a-btn"
                disabled={!email}
                onClick={() => email && (window.location.href = `mailto:${email}`)}
              >
                <IconMail size={19} />
                {T.emailAction}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showWhatsApp && (
        <WhatsAppModal
          personId={person.id}
          opportunityId={leads[0]?.id}
          onClose={() => setShowWhatsApp(false)}
        />
      )}
    </main>
  );
};

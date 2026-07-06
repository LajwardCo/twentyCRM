import { useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  LEAD_SOURCES,
  registerLead,
  type NewLeadInput,
} from '../api/records';
import { TopBar } from '../components/Shell';
import { toLocalInputValue } from '../lib/format';
import { navigate } from '../lib/router';

type NewLeadViewProps = {
  user: CurrentUser;
};

const tomorrowMorning = (): Date => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
};

export const NewLeadView = ({ user }: NewLeadViewProps) => {
  const [companyName, setCompanyName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [temperature, setTemperature] = useState<'HOT' | 'WARM' | 'COLD' | null>('WARM');
  const [leadSource, setLeadSource] = useState('FIELD');
  const [firstContactNote, setFirstContactNote] = useState('');
  const [firstContactDate, setFirstContactDate] = useState(
    toLocalInputValue(new Date()),
  );
  const [scheduleFollowUp, setScheduleFollowUp] = useState(true);
  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpDate, setFollowUpDate] = useState(
    toLocalInputValue(tomorrowMorning()),
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy('Saving…');

    const input: NewLeadInput = {
      companyName,
      contactFirstName: firstName,
      contactLastName: lastName,
      contactPhone: phone,
      contactEmail: email,
      temperature,
      leadSource,
      firstContactNote,
      firstContactDate: new Date(firstContactDate).toISOString(),
      followUpNote,
      followUpDate: scheduleFollowUp
        ? new Date(followUpDate).toISOString()
        : null,
      workspaceMemberId: user.workspaceMemberId,
    };

    try {
      const result = await registerLead(input, setBusy);
      navigate(`/lead/${result.opportunityId}`);
    } catch (err) {
      setError(
        `${busy ?? 'Saving'} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      setBusy(null);
    }
  };

  return (
    <>
      <TopBar title="New Lead" />
      <main className="app-main">
        <form onSubmit={handleSubmit}>
          <div className="card">
            <h3 className="card-title">Company</h3>
            <div className="field">
              <label htmlFor="nl-company">Company name *</label>
              <input
                id="nl-company"
                required
                autoFocus
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Point of contact</h3>
            <div className="field-row">
              <div className="field">
                <label htmlFor="nl-first">First name</label>
                <input
                  id="nl-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="nl-last">Last name</label>
                <input
                  id="nl-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="nl-phone">Phone</label>
              <input
                id="nl-phone"
                type="tel"
                inputMode="tel"
                placeholder="07…"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="nl-email">Email (optional)</label>
              <input
                id="nl-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Qualification</h3>
            <div className="field">
              <label>Temperature</label>
              <div className="segmented">
                {(['HOT', 'WARM', 'COLD'] as const).map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={temperature === t ? 'selected' : ''}
                    onClick={() =>
                      setTemperature(temperature === t ? null : t)
                    }
                  >
                    {t === 'HOT' ? '🔥 Hot' : t === 'WARM' ? '🌤 Warm' : '❄️ Cold'}
                  </button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="nl-source">Lead source</label>
              <select
                id="nl-source"
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value)}
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">First contact</h3>
            <div className="field">
              <label htmlFor="nl-note">
                What happened? (call / visit notes)
              </label>
              <textarea
                id="nl-note"
                placeholder="e.g. Visited the office, spoke with the manager, interested in a demo…"
                value={firstContactNote}
                onChange={(e) => setFirstContactNote(e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="nl-date">When</label>
              <input
                id="nl-date"
                type="datetime-local"
                value={firstContactDate}
                onChange={(e) => setFirstContactDate(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Follow-up</h3>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={scheduleFollowUp}
                  onChange={(e) => setScheduleFollowUp(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Schedule a follow-up task
              </label>
            </div>
            {scheduleFollowUp && (
              <>
                <div className="field">
                  <label htmlFor="nl-fu-note">What to do</label>
                  <input
                    id="nl-fu-note"
                    placeholder="e.g. Call to schedule the demo"
                    value={followUpNote}
                    onChange={(e) => setFollowUpNote(e.target.value)}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor="nl-fu-date">When</label>
                  <input
                    id="nl-fu-date"
                    type="datetime-local"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          {error !== null && <div className="error-banner">{error}</div>}

          <div className="form-actions">
            <button className="btn block" type="submit" disabled={busy !== null}>
              {busy ?? 'Register Lead'}
            </button>
          </div>
        </form>
      </main>
    </>
  );
};

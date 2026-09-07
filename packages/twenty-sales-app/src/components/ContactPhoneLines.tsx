import { toPersianDigits } from '../lib/jalali';
import { type PhoneEntry } from '../lib/phones';
import { PHONE_APP_LABELS, T13 } from '../lib/strings';

type ContactPhoneLinesProps = {
  entries: PhoneEntry[];
};

// Which app reaches which number, at a glance. A seller looking at a contact
// with three numbers needs to know which one is on WhatsApp before deciding
// how to reach them, so the badges sit on the number rather than on the person.
const APP_ICONS: Record<string, string> = {
  WHATSAPP: '🟢',
  TELEGRAM: '🔵',
  IMO: '🟣',
  VIBER: '🟪',
  SIGNAL: '🔷',
  MESSENGER: '🔹',
};

export const ContactPhoneLines = ({ entries }: ContactPhoneLinesProps) => {
  if (entries.length === 0) {
    return <span className="t-sub">—</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {entries.map((entry) => (
        <div
          key={entry.e164}
          style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <a
            className="num"
            dir="ltr"
            href={`tel:${entry.e164}`}
            style={{ fontSize: 12, textDecoration: 'none', color: 'inherit' }}
            title={T13.callAction}
          >
            {toPersianDigits(entry.e164)}
          </a>
          {entry.isPrimary && entries.length > 1 && (
            <span className="pill stage" style={{ fontSize: 10 }}>
              {T13.primaryPhoneBadge}
            </span>
          )}
          {entry.apps.map((app) => (
            <span
              key={app}
              className="pill"
              style={{ fontSize: 10 }}
              title={PHONE_APP_LABELS[app] ?? app}
            >
              {APP_ICONS[app] ?? '•'} {PHONE_APP_LABELS[app] ?? app}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};

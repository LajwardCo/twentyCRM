import { type DuplicateMatch } from '../lib/duplicates';
import { navigate } from '../lib/router';
import { STAGE_LABELS, T, T6 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';

const KIND_LABELS: Record<DuplicateMatch['kind'], string> = {
  lead: T6.duplicateKindLead,
  company: T6.duplicateKindCompany,
  person: T6.duplicateKindPerson,
};

const MatchRow = ({ match }: { match: DuplicateMatch }) => (
  <button
    type="button"
    className="dup-row"
    onClick={() => navigate(match.route)}
    title={T6.duplicateOpenExisting}
  >
    <span className={`pill ${match.level === 'exact' ? 'hot' : 'warm'}`}>
      {KIND_LABELS[match.kind]}
    </span>
    <span className="dup-name">{match.label}</span>
    <span className="dup-sub">
      {match.level === 'exact'
        ? T6.duplicateMatchExactPhone
        : (STAGE_LABELS[match.sub] ?? T6.duplicateMatchName)}
    </span>
    <span aria-hidden>←</span>
  </button>
);

// Shown inline under the company field while the seller types. Never blocks.
export const DuplicateWarning = ({
  matches,
  checking,
}: {
  matches: DuplicateMatch[];
  checking: boolean;
}) => {
  if (checking) {
    return (
      <div className="sub" style={{ marginTop: 8 }}>
        {T6.duplicateChecking}
      </div>
    );
  }
  if (matches.length === 0) return null;

  return (
    <div className="dup-banner" style={{ marginTop: 10 }}>
      <div className="dup-head">⚠️ {T6.duplicateWarningTitle}</div>
      <div className="sub" style={{ marginBottom: 6 }}>
        {T6.duplicateWarningHint}
      </div>
      {matches.map((match) => (
        <MatchRow key={match.route} match={match} />
      ))}
    </div>
  );
};

// Shown on submit when an exact or strong match exists. The seller can open
// what already exists or say this is genuinely a new lead -- registration is
// never blocked outright, because the seller is standing in front of the
// customer and we are not.
export const DuplicateConfirmDialog = ({
  matches,
  onCancel,
  onRegisterAnyway,
}: {
  matches: DuplicateMatch[];
  onCancel: () => void;
  onRegisterAnyway: () => void;
}) => (
  <ModalSheet title={T6.duplicateConfirmTitle} onClose={onCancel}>
    <div className="sub" style={{ marginBottom: 10 }}>
      {T6.duplicateConfirmHint}
    </div>

    {matches.map((match) => (
      <MatchRow key={match.route} match={match} />
    ))}

    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      <button
        className="btn line sm"
        style={{ flex: 1, justifyContent: 'center' }}
        onClick={onCancel}
      >
        {T.close}
      </button>
      <button
        className="btn gold"
        style={{ flex: 2, padding: 12 }}
        onClick={onRegisterAnyway}
      >
        {T6.duplicateRegisterAnyway}
      </button>
    </div>
  </ModalSheet>
);

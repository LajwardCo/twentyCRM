// The change log for one record, rendered on the same timeline rails as the
// rest of the lead page so it reads as part of the history rather than a
// separate report.
//
// Works for any record the server tracks -- pass a different target and the
// same panel serves a person, a company, a task or a competitor.
import { type HistoryTarget, fetchRecordHistory } from '../api/recordHistory';
import { type AuditAction, type AuditEntry } from '../lib/recordHistory';
import { useCached } from '../lib/cache';
import { formatJalaliDateTime } from '../lib/jalali';
import { AUDIT_OBJECT_LABELS, T15 } from '../lib/strings';
import { IconClock, IconEdit, IconNote, IconPlus, IconX } from './icons';

const ACTION_LABELS: Record<AuditAction, string> = {
  created: T15.createdAction,
  updated: T15.updatedAction,
  deleted: T15.deletedAction,
  restored: T15.restoredAction,
};

// Reuses the timeline's existing icon tints: green for something added, amber
// for an edit, plain for a removal.
const ACTION_TINTS: Record<AuditAction, string> = {
  created: 'call',
  updated: 'note',
  deleted: 'todo',
  restored: 'call',
};

const ActionIcon = ({ action }: { action: AuditAction }) => {
  if (action === 'created') return <IconPlus size={16} />;
  if (action === 'deleted') return <IconX size={16} />;
  if (action === 'restored') return <IconNote size={16} />;
  return <IconEdit size={16} />;
};

const entryHeadline = (entry: AuditEntry): string => {
  const object = AUDIT_OBJECT_LABELS[entry.objectName] ?? entry.objectName;
  const subject = entry.subject ? ` «${entry.subject}»` : '';
  return `${object}${subject} ${ACTION_LABELS[entry.action]}`;
};

const ChangeRow = ({ label, before, after }: { label: string; before: string; after: string }) => (
  <div className="audit-change">
    <span className="audit-field">{label}</span>
    {before !== '' && <span className="audit-before">{before}</span>}
    {before !== '' && <span className="audit-arrow">{T15.changeArrow}</span>}
    <span className="audit-after">{after}</span>
  </div>
);

type RecordHistoryProps = {
  target: HistoryTarget;
  // Set when the panel is the only thing on screen; inside the lead's timeline
  // tab the surrounding card already carries the heading.
  showHeading?: boolean;
};

export const RecordHistory = ({ target, showHeading = false }: RecordHistoryProps) => {
  const { data, error } = useCached(`history:${target.kind}:${target.id}`, () =>
    fetchRecordHistory(target),
  );

  if (error) return <div className="empty-state">{T15.changeLogFailed}</div>;
  if (data === null) return <div className="empty-state">…</div>;
  if (data.length === 0) return <div className="empty-state">{T15.noChanges}</div>;

  return (
    <>
      {showHeading && (
        <div className="card-pad" style={{ paddingBottom: 4 }}>
          <h3>{T15.changeLogTitle}</h3>
          <div className="sub">{T15.changeLogHint}</div>
        </div>
      )}
      {data.map((entry) => (
        <div className="tl-item" key={entry.id}>
          <div className={`tl-ico ${ACTION_TINTS[entry.action]}`}>
            <ActionIcon action={entry.action} />
          </div>
          <div className="tl-body">
            <div className="tl-t">{entryHeadline(entry)}</div>
            {entry.changes.length > 0 && (
              <div className="audit-changes">
                {entry.changes.map((change) => (
                  <ChangeRow
                    key={change.field}
                    label={change.label}
                    before={change.before}
                    after={change.after}
                  />
                ))}
              </div>
            )}
            <div className="tl-meta">
              <IconClock size={11} />
              {formatJalaliDateTime(entry.at)} · {T15.byActor} {entry.actor}
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

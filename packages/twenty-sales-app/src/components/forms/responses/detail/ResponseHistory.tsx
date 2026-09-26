import { fetchResponseHistory } from '../../../../api/surveyResponseExtras';
import { useCached } from '../../../../lib/cache';
import { formatJalaliDateTime } from '../../../../lib/jalali';
import { type AuditAction } from '../../../../lib/recordHistory';
import { T15 } from '../../../../lib/strings';
import { TSR } from '../../../../lib/forms/responseStrings';
import { IconClock, IconEdit, IconPlus, IconX } from '../../../icons';

// RecordHistory's target union does not include surveyResponse, so this is
// the same timeline rendering over the response's own timelineActivity rows.

const ACTION_LABELS: Record<AuditAction, string> = {
  created: T15.createdAction,
  updated: T15.updatedAction,
  deleted: T15.deletedAction,
  restored: T15.restoredAction,
};

export const ResponseHistory = ({ responseId, version }: { responseId: string; version: string }) => {
  const { data } = useCached(`svr:history:${responseId}:${version}`, () => fetchResponseHistory(responseId));

  return (
    <section className="card svr-section" aria-labelledby="svr-history-title">
      <h3 id="svr-history-title">{TSR.history}</h3>
      {data === null && <p className="svr-muted">{TSR.loading}</p>}
      {data !== null && data.length === 0 && <p className="svr-muted">{TSR.noHistory}</p>}
      {(data ?? []).map((entry) => (
        <div className="tl-item" key={entry.id}>
          <div className={`tl-ico ${entry.action === 'created' ? 'call' : 'note'}`}>
            {entry.action === 'created' ? <IconPlus size={16} /> : entry.action === 'deleted' ? <IconX size={16} /> : <IconEdit size={16} />}
          </div>
          <div className="tl-body">
            <div className="tl-t">{`${entry.subject ? `«${entry.subject}» ` : ''}${ACTION_LABELS[entry.action]}`}</div>
            {entry.changes.length > 0 && (
              <div className="audit-changes">
                {entry.changes.map((change) => (
                  <div className="audit-change" key={change.field}>
                    <span className="audit-field">{change.label}</span>
                    {change.before !== '' && <span className="audit-before">{change.before}</span>}
                    {change.before !== '' && <span className="audit-arrow">{T15.changeArrow}</span>}
                    <span className="audit-after">{change.after}</span>
                  </div>
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
    </section>
  );
};

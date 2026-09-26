import { useState } from 'react';

import { type CurrentUser } from '../../../../api/auth';
import { createResponseTask, fetchResponseTasks } from '../../../../api/surveyResponseExtras';
import { type SurveyResponse } from '../../../../api/surveys';
import { useCached } from '../../../../lib/cache';
import { formatJalaliDateTime } from '../../../../lib/jalali';
import { TSR } from '../../../../lib/forms/responseStrings';
import { JalaliDatePicker } from '../../../JalaliDatePicker';
import { memberLabel, useResponseLookups } from '../useResponseLookups';

type ResponseFollowUpProps = {
  response: SurveyResponse;
  user: CurrentUser;
  canEdit: boolean;
  initiallyOpen: boolean;
};

const tomorrowAtNine = (): string => {
  const date = new Date();

  date.setDate(date.getDate() + 1);

  const pad = (value: number) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T09:00`;
};

// A follow-up task linked to the response, and to its lead when there is one
// so it also shows on the lead's timeline and in the seller's task list.
export const ResponseFollowUp = ({ response, user, canEdit, initiallyOpen }: ResponseFollowUpProps) => {
  const { members } = useResponseLookups();
  const { data: tasks, refresh } = useCached(`svr:tasks:${response.id}`, () => fetchResponseTasks(response.id));
  const [open, setOpen] = useState(initiallyOpen);
  const [title, setTitle] = useState(() => TSR.followUpDefault(response.name.trim() || response.company?.name || TSR.noName));
  const [dueAt, setDueAt] = useState(tomorrowAtNine);
  const [assigneeId, setAssigneeId] = useState(user.workspaceMemberId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    if (saving || title.trim() === '') return;

    setSaving(true);
    setMessage(null);

    try {
      await createResponseTask({
        responseId: response.id,
        opportunityId: response.opportunity?.id ?? null,
        title: title.trim(),
        dueAt: dueAt === '' ? null : new Date(dueAt).toISOString(),
        assigneeId,
      });
      setMessage(TSR.followUpCreated);
      setOpen(false);
      await refresh();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card svr-section" aria-labelledby="svr-followup-title">
      <div className="svr-section-head">
        <h3 id="svr-followup-title">{TSR.followUp}</h3>
        {canEdit && !open && (
          <button type="button" className="btn line sm" onClick={() => setOpen(true)}>
            {TSR.followUpCreate}
          </button>
        )}
      </div>

      {tasks !== null && tasks.length === 0 && !open && <p className="svr-muted">{TSR.noTasks}</p>}
      <ul className="svr-tasks">
        {(tasks ?? []).map((task) => (
          <li key={task.id}>
            <a href={`#/task/${task.id}`} dir="auto" className={task.status === 'DONE' ? 'svr-done' : undefined}>
              {task.title}
            </a>
            <span className="svr-muted">
              {task.dueAt !== null && formatJalaliDateTime(task.dueAt)}
              {task.assignee !== '' && ` · ${task.assignee}`}
            </span>
          </li>
        ))}
      </ul>

      {canEdit && open && (
        <form
          className="svr-followup-form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className="fld">
            <span className="svr-fld-label">{TSR.followUpTitle}</span>
            <input dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="fld">
            <span className="svr-fld-label">{TSR.followUpDue}</span>
            <JalaliDatePicker value={dueAt} onChange={setDueAt} />
          </div>
          <label className="fld">
            <span className="svr-fld-label">{TSR.followUpAssignee}</span>
            <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              {!members.some((member) => member.id === user.workspaceMemberId) && (
                <option value={user.workspaceMemberId}>{`${user.firstName} ${user.lastName}`.trim()}</option>
              )}
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {memberLabel(member) || member.userEmail}
                </option>
              ))}
            </select>
          </label>
          {response.opportunity !== null && <p className="svr-muted">{TSR.followUpLinkedLead}</p>}
          <div className="svr-row-actions">
            <button type="submit" className="btn gold sm" disabled={saving || title.trim() === ''}>
              {saving ? TSR.creating : TSR.followUpCreate}
            </button>
            <button type="button" className="btn line sm" onClick={() => setOpen(false)}>
              {TSR.cancel}
            </button>
          </div>
        </form>
      )}
      {message !== null && <p className="svr-action-message" role="status">{message}</p>}
    </section>
  );
};

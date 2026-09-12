import { endOfTomorrow } from '../lib/format';
import { coreQuery } from './client';
import { setTaskStatus, updateTask, type Connection, type Task } from './records';

// My tasks that carry a reminder due by the end of tomorrow. That window is
// enough for "fired" and "upcoming today" (what the bell and the Today card
// show); anything later belongs to the calendar, which has its own query.
//
// Only ever called once the /metadata probe has confirmed task.remindAt
// exists: filter arguments are validated, so this query fails loudly on an
// unprovisioned server (unlike a plain selection, which would read nulls).
export const fetchMyReminders = async (assigneeId: string): Promise<Task[]> => {
  const data = await coreQuery<{ tasks: Connection<Task> }>(
    `query MyReminders($filter: TaskFilterInput) {
      tasks(filter: $filter, first: 200, orderBy: [{ remindAt: AscNullsLast }]) {
        edges {
          node {
            id
            title
            status
            taskType
            dueAt
            remindAt
            reminderDismissedAt
            createdAt
            bodyV2 { markdown }
            taskTargets {
              edges {
                node {
                  opportunity { id name }
                  company { id name }
                }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {
      filter: {
        and: [
          { assigneeId: { eq: assigneeId } },
          { status: { in: ['TODO', 'IN_PROGRESS'] } },
          { remindAt: { is: 'NOT_NULL' } },
          { remindAt: { lte: endOfTomorrow().toISOString() } },
        ],
      },
    },
  );

  return data.tasks.edges.map((edge) => edge.node);
};

export const dismissReminder = (taskId: string): Promise<void> =>
  updateTask(taskId, { reminderDismissedAt: new Date().toISOString() });

// A snooze is a new promise: the old dismissal must not silence the new time.
export const snoozeReminder = (taskId: string, remindAtIso: string): Promise<void> =>
  updateTask(taskId, { remindAt: remindAtIso, reminderDismissedAt: null });

export const completeReminder = (taskId: string): Promise<void> =>
  setTaskStatus(taskId, 'DONE', { dismissReminder: true });

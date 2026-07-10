import { type DoneTask, type Task } from '../api/records';

// Bullet-list draft of what a seller did today, from their completed tasks.
// The seller edits this before submitting — it's a starting point, not a
// final answer, so keep it terse (title + first line of the result note).
export const draftSummaryFromDoneTasks = (tasks: DoneTask[]): string => {
  if (tasks.length === 0) return '';
  return tasks
    .map((task) => {
      const firstLine = task.bodyV2?.markdown?.trim().split('\n')[0]?.slice(0, 120);
      return firstLine ? `- ${task.title} — ${firstLine}` : `- ${task.title}`;
    })
    .join('\n');
};

// Bullet-list draft of tomorrow's plan, from tasks already scheduled for
// tomorrow. The seller can add plans that aren't tasks yet.
export const draftPlanFromUpcomingTasks = (tasks: Task[]): string => {
  if (tasks.length === 0) return '';
  return tasks.map((task) => `- ${task.title}`).join('\n');
};

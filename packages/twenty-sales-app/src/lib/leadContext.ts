import {
  stageLabel,
  type LeadSummary,
  type Note,
  type Task,
} from '../api/records';
import { formatDateTime, fullPhone, personName } from './format';

// Compose the full lead context as plain text for AI prompts.
export const leadContextText = (
  lead: LeadSummary,
  tasks: Task[],
  notes: Note[],
): string => {
  const lines: string[] = [
    `Lead / Opportunity: ${lead.name}`,
    `Stage: ${stageLabel(lead.stage)}`,
    `Temperature: ${lead.temperature ?? 'unknown'}`,
    `Lead source: ${lead.leadSource ?? 'unknown'}`,
    `Company: ${lead.company?.name ?? 'unknown'}`,
    `Point of contact: ${personName(lead.pointOfContact)}${
      fullPhone(lead.pointOfContact?.phones ?? null)
        ? ` (${fullPhone(lead.pointOfContact?.phones ?? null)})`
        : ''
    }`,
    `Owner: ${personName(lead.owner)}`,
    `Created: ${formatDateTime(lead.createdAt)}`,
    '',
    '--- Activity history (tasks) ---',
  ];

  for (const task of tasks) {
    lines.push(
      `[${task.status ?? '?'}] ${formatDateTime(task.dueAt ?? task.createdAt)} — ${task.title}`,
    );
    if (task.bodyV2?.markdown) {
      lines.push(`  ${task.bodyV2.markdown.replace(/\n/g, '\n  ')}`);
    }
  }

  lines.push('', '--- Notes ---');
  for (const note of notes) {
    lines.push(`${formatDateTime(note.createdAt)} — ${note.title}`);
    if (note.bodyV2?.markdown) {
      lines.push(`  ${note.bodyV2.markdown.replace(/\n/g, '\n  ')}`);
    }
  }

  return lines.join('\n');
};

export const SUMMARIZE_SYSTEM_PROMPT =
  'You are a sales assistant for Hamagan, an Afghan software company selling business management systems (HMIS and related products). ' +
  'Summarize the lead for a busy salesperson. Reply in the same language the notes are written in (Dari/Persian notes get a Persian reply). ' +
  'Structure: 1) who they are, 2) current status and temperature, 3) what has happened so far, 4) recommended next action. Keep it under 150 words.';

export const CALL_SCRIPT_SYSTEM_PROMPT =
  'You are a sales coach for Hamagan, an Afghan software company selling business management systems. ' +
  'Write a practical phone call script for the salesperson based on this lead: a natural opening referencing the last interaction, ' +
  '2-3 discovery questions, how to pitch the product for this business type, common objections with answers, and a clear closing ask. ' +
  'Reply in the same language the notes are written in (Dari/Persian notes get a Persian reply). Keep it concise and usable on a phone screen.';

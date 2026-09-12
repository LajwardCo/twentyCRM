import { describe, expect, it } from 'vitest';

import {
  classifyReminders,
  offsetToRemindAt,
  presetFromRemindAt,
  shiftRemindAt,
  snoozeTarget,
  taskLeadRef,
  type ReminderTask,
} from './reminders';

const at = (iso: string) => new Date(iso);

const task = (over: Partial<ReminderTask>): ReminderTask => ({
  id: 'a',
  title: 't',
  status: 'TODO',
  dueAt: '2026-09-12T10:00:00.000Z',
  remindAt: '2026-09-12T09:00:00.000Z',
  reminderDismissedAt: null,
  ...over,
});

describe('classifyReminders', () => {
  const now = at('2026-09-12T09:30:00.000Z');

  it('fires a reminder whose remindAt has passed and is not dismissed', () => {
    const { fired } = classifyReminders([task({})], now);
    expect(fired.map((t) => t.id)).toEqual(['a']);
  });

  it('does not fire a dismissed or done reminder', () => {
    const { fired, upcomingToday } = classifyReminders(
      [
        task({ id: 'd', reminderDismissedAt: '2026-09-12T09:05:00.000Z' }),
        task({ id: 'x', status: 'DONE' }),
      ],
      now,
    );
    expect(fired).toEqual([]);
    expect(upcomingToday).toEqual([]);
  });

  it('ignores a dismissal older than the remindAt (stale after a reschedule)', () => {
    const { fired } = classifyReminders(
      [task({ reminderDismissedAt: '2026-09-11T09:05:00.000Z' })],
      now,
    );
    expect(fired.map((t) => t.id)).toEqual(['a']);
  });

  it('puts a later reminder today under upcomingToday and a later day under later', () => {
    // local-time day boundary: build "today" from the same local clock
    const localNow = new Date(2026, 8, 12, 9, 30);
    const laterToday = new Date(2026, 8, 12, 15, 0).toISOString();
    const tomorrow = new Date(2026, 8, 13, 15, 0).toISOString();
    const { upcomingToday, later } = classifyReminders(
      [task({ id: 'u', remindAt: laterToday }), task({ id: 'l', remindAt: tomorrow })],
      localNow,
    );
    expect(upcomingToday.map((t) => t.id)).toEqual(['u']);
    expect(later.map((t) => t.id)).toEqual(['l']);
  });

  it('ignores tasks with no remindAt and sorts fired by remindAt ascending', () => {
    const { fired } = classifyReminders(
      [
        task({ id: 'b', remindAt: '2026-09-12T09:20:00.000Z' }),
        task({ id: 'n', remindAt: null }),
        task({ id: 'u', remindAt: undefined }),
        task({ id: 'a', remindAt: '2026-09-12T08:00:00.000Z' }),
      ],
      now,
    );
    expect(fired.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('snoozeTarget', () => {
  it('one hour later is exactly now + 60 minutes', () => {
    const now = at('2026-09-12T09:30:00.000Z');
    expect(snoozeTarget('hour', now)).toBe('2026-09-12T10:30:00.000Z');
  });

  it('tomorrow morning lands on 09:00 local the next day even late at night', () => {
    const now = new Date(2026, 8, 12, 23, 40);
    const next = new Date(snoozeTarget('tomorrow', now));
    expect([next.getFullYear(), next.getMonth(), next.getDate()]).toEqual([2026, 8, 13]);
    expect([next.getHours(), next.getMinutes()]).toEqual([9, 0]);
  });
});

describe('shiftRemindAt', () => {
  it('keeps the offset between dueAt and remindAt when dueAt moves', () => {
    const shifted = shiftRemindAt(task({}), '2026-09-15T10:00:00.000Z');
    expect(shifted.remindAt).toBe('2026-09-15T09:00:00.000Z');
    expect(shifted.reminderDismissedAt).toBeNull();
  });

  it('leaves a task without a reminder alone', () => {
    const shifted = shiftRemindAt(task({ remindAt: null }), '2026-09-15T10:00:00.000Z');
    expect(shifted.remindAt).toBeNull();
  });

  it('treats a task with a reminder but no dueAt as "remind at the new due time"', () => {
    const shifted = shiftRemindAt(task({ dueAt: null }), '2026-09-15T10:00:00.000Z');
    expect(shifted.remindAt).toBe('2026-09-15T10:00:00.000Z');
  });
});

describe('presets', () => {
  const due = '2026-09-12T10:00:00.000Z';

  it('offsetToRemindAt subtracts the preset from dueAt', () => {
    expect(offsetToRemindAt('at', due)).toBe(due);
    expect(offsetToRemindAt('15m', due)).toBe('2026-09-12T09:45:00.000Z');
    expect(offsetToRemindAt('1h', due)).toBe('2026-09-12T09:00:00.000Z');
    expect(offsetToRemindAt('1d', due)).toBe('2026-09-11T10:00:00.000Z');
    expect(offsetToRemindAt('none', due)).toBeNull();
    expect(offsetToRemindAt('at', null)).toBeNull();
  });

  it('presetFromRemindAt recognises exact offsets and falls back to custom', () => {
    expect(presetFromRemindAt(null, due)).toBe('none');
    expect(presetFromRemindAt(due, due)).toBe('at');
    expect(presetFromRemindAt('2026-09-12T09:00:00.000Z', due)).toBe('1h');
    expect(presetFromRemindAt('2026-09-12T08:37:00.000Z', due)).toBe('custom');
    expect(presetFromRemindAt('2026-09-12T08:37:00.000Z', null)).toBe('custom');
  });
});

describe('taskLeadRef', () => {
  it('prefers the opportunity target, falls back to the company, else null', () => {
    const withOpp = {
      taskTargets: {
        edges: [
          { node: { opportunity: null, company: { id: 'c', name: 'Co' } } },
          { node: { opportunity: { id: 'o', name: 'Deal' }, company: null } },
        ],
      },
    };
    expect(taskLeadRef(withOpp)).toEqual({ id: 'o', name: 'Deal' });
    const onlyCompany = {
      taskTargets: { edges: [{ node: { opportunity: null, company: { id: 'c', name: 'Co' } } }] },
    };
    expect(taskLeadRef(onlyCompany)).toEqual({ id: null, name: 'Co' });
    expect(taskLeadRef({})).toBeNull();
  });
});

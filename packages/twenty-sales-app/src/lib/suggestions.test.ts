import { describe, expect, it } from 'vitest';

import { type LeadSummary, type Task } from '../api/records';
import {
  buildFocusPrompt,
  focusCacheKey,
  rankSuggestions,
  type DoneTaskWithTarget,
} from './suggestions';

// Local noon so "today" is unambiguous in any timezone the tests run in.
const NOW = new Date(2026, 8, 12, 12, 0, 0);
const hoursFromNow = (hours: number) =>
  new Date(NOW.getTime() + hours * 3_600_000).toISOString();
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

const lead = (
  overrides: Partial<LeadSummary> & { id: string; name: string },
): LeadSummary => ({
  stage: 'FOLLOWING_UP',
  temperature: null,
  leadSource: null,
  createdAt: daysAgo(60),
  stageChangedAt: daysAgo(2),
  company: null,
  pointOfContact: null,
  owner: null,
  amount: null,
  createdBy: null,
  referrer: null,
  ...overrides,
});

const amount = (afn: number) => ({
  amountMicros: afn * 1_000_000,
  currencyCode: 'AFN',
});

const openTask = (id: string, leadId: string, dueAt: string | null): Task => ({
  id,
  title: `task ${id}`,
  status: 'TODO',
  taskType: 'CALL',
  dueAt,
  createdAt: daysAgo(5),
  bodyV2: null,
  taskTargets: {
    edges: [{ node: { opportunity: { id: leadId, name: 'x' }, company: null } }],
  },
});

const doneTask = (id: string, leadId: string, updatedAt: string): DoneTaskWithTarget => ({
  id,
  updatedAt,
  taskTargets: { edges: [{ node: { opportunity: { id: leadId } } }] },
});

const rank = (
  leads: LeadSummary[],
  openTasks: Task[] = [],
  doneTasks: DoneTaskWithTarget[] = [],
  limit?: number,
) => rankSuggestions({ leads, openTasks, doneTasks, now: NOW }, { limit });

describe('rankSuggestions — which leads are considered', () => {
  it('ignores leads outside the open pipeline', () => {
    const result = rank([
      lead({ id: 'won', name: 'Won', stage: 'ACTIVE_CUSTOMER', temperature: 'HOT' }),
      lead({ id: 'lost', name: 'Lost', stage: 'LOST_MISSED', temperature: 'HOT' }),
    ]);
    expect(result).toEqual([]);
  });

  it('skips a lead that already has a task due today', () => {
    const hot = lead({ id: 'a', name: 'A', temperature: 'HOT' });
    const result = rank([hot], [openTask('t1', 'a', hoursFromNow(3))]);
    expect(result).toEqual([]);
  });

  it('drops leads with nothing to say about them', () => {
    const quiet = lead({ id: 'q', name: 'Quiet', createdAt: daysAgo(3), stageChangedAt: daysAgo(3) });
    expect(rank([quiet], [], [doneTask('d', 'q', daysAgo(2))])).toEqual([]);
  });
});

describe('rankSuggestions — each rule', () => {
  it('flags an overdue task and links to the task itself', () => {
    const l = lead({ id: 'a', name: 'A' });
    const [s] = rank([l], [openTask('t9', 'a', hoursFromNow(-30))]);
    expect(s).toMatchObject({
      leadId: 'a',
      kind: 'task',
      why: 'کار عقب‌مانده دارد',
      href: '/task/t9',
    });
  });

  it('flags a hot lead with no next step', () => {
    const [s] = rank([lead({ id: 'a', name: 'A', temperature: 'HOT' })]);
    expect(s).toMatchObject({ kind: 'call', why: 'لید داغ بدون قدم بعدی', href: '/lead/a' });
  });

  it('flags a warm lead with no next step', () => {
    const [s] = rank([lead({ id: 'a', name: 'A', temperature: 'WARM' })]);
    expect(s).toMatchObject({ kind: 'call', why: 'لید گرم بدون قدم بعدی' });
  });

  it('does not flag a hot lead that has an upcoming task planned', () => {
    const l = lead({ id: 'a', name: 'A', temperature: 'HOT' });
    const recent = [doneTask('d', 'a', daysAgo(1))];
    expect(rank([l], [openTask('t1', 'a', hoursFromNow(48))], recent)).toEqual([]);
  });

  it('flags a contract sent three days ago with no follow-up', () => {
    const l = lead({ id: 'a', name: 'A', stage: 'CONTRACT_SENT', stageChangedAt: daysAgo(3) });
    const [s] = rank([l]);
    expect(s).toMatchObject({ kind: 'contract', why: 'قرارداد ارسال شده، پیگیری نشده' });
  });

  it('flags a signed lead whose payment has not been chased', () => {
    const l = lead({
      id: 'a',
      name: 'A',
      stage: 'SIGNED_AWAITING_PAYMENT',
      stageChangedAt: daysAgo(4),
    });
    const [s] = rank([l]);
    expect(s).toMatchObject({ kind: 'contract', why: 'امضا شده، پرداخت پیگیری نشده' });
  });

  it('leaves a contract sent yesterday alone', () => {
    const l = lead({ id: 'a', name: 'A', stage: 'CONTRACT_SENT', stageChangedAt: daysAgo(1) });
    expect(rank([l], [], [doneTask('d', 'a', daysAgo(1))])).toEqual([]);
  });

  it('flags a new lead that was never contacted', () => {
    const l = lead({ id: 'a', name: 'A', stage: 'NEW_LEAD', createdAt: daysAgo(2), stageChangedAt: null });
    const [s] = rank([l]);
    expect(s).toMatchObject({ kind: 'call', why: 'لید جدید، هنوز تماس نگرفته‌اید' });
  });

  it('does not call a new lead "never contacted" once a task was done on it', () => {
    const l = lead({ id: 'a', name: 'A', stage: 'NEW_LEAD', createdAt: daysAgo(2), stageChangedAt: null });
    const result = rank([l], [], [doneTask('d', 'a', daysAgo(1))]);
    expect(result).toEqual([]);
  });

  it('flags a lead stalled in its stage for two weeks', () => {
    const l = lead({ id: 'a', name: 'A', stageChangedAt: daysAgo(16) });
    const [s] = rank([l], [], [doneTask('d', 'a', daysAgo(1))]);
    expect(s).toMatchObject({ kind: 'follow_up', why: '۱۶ روز در این مرحله' });
  });

  it('flags a lead nobody has contacted for a week', () => {
    const l = lead({ id: 'a', name: 'A', stageChangedAt: daysAgo(2) });
    const [s] = rank([l], [], [doneTask('d', 'a', daysAgo(9))]);
    expect(s).toMatchObject({ kind: 'follow_up', why: '۹ روز بدون تماس' });
  });

  it('treats no contact in the whole window as "over 30 days"', () => {
    const l = lead({ id: 'a', name: 'A', stageChangedAt: daysAgo(2) });
    const [s] = rank([l]);
    expect(s).toMatchObject({ kind: 'follow_up', why: 'بیش از ۳۰ روز بدون تماس' });
  });
});

describe('rankSuggestions — ordering', () => {
  it('lets the overdue task win over the hot-no-task reason', () => {
    const l = lead({ id: 'a', name: 'A', temperature: 'HOT' });
    const [s] = rank([l], [openTask('t1', 'a', hoursFromNow(-30))]);
    expect(s.kind).toBe('task');
    expect(s.href).toBe('/task/t1');
  });

  it('puts an overdue task ahead of a big hot lead even with tiebreak bonuses', () => {
    const contacted = [doneTask('d1', 'hot-big', daysAgo(1)), doneTask('d2', 'late', daysAgo(1))];
    const result = rank(
      [
        lead({ id: 'hot-big', name: 'Big', temperature: 'HOT', amount: amount(900), leadSource: 'REFERRAL' }),
        lead({ id: 'late', name: 'Late', amount: amount(10) }),
        lead({ id: 'filler', name: 'F', temperature: 'WARM', amount: amount(20) }),
      ],
      [openTask('t1', 'late', hoursFromNow(-30))],
      contacted,
    );
    expect(result[0].leadId).toBe('late');
  });

  it('orders by score, then amount, then name', () => {
    const contacted = [
      doneTask('d1', 'warm-small', daysAgo(1)),
      doneTask('d2', 'warm-big', daysAgo(1)),
      doneTask('d3', 'hot', daysAgo(1)),
      doneTask('d4', 'warm-same', daysAgo(1)),
    ];
    const result = rank(
      [
        lead({ id: 'warm-small', name: 'ب', temperature: 'WARM', amount: amount(10) }),
        lead({ id: 'hot', name: 'ج', temperature: 'HOT' }),
        lead({ id: 'warm-big', name: 'د', temperature: 'WARM', amount: amount(500) }),
        lead({ id: 'warm-same', name: 'الف', temperature: 'WARM', amount: amount(10) }),
      ],
      [],
      contacted,
    );
    expect(result.map((s) => s.leadId)).toEqual(['hot', 'warm-big', 'warm-same', 'warm-small']);
  });

  it('caps the list at six by default and honours a custom limit', () => {
    const leads = Array.from({ length: 9 }, (_, i) =>
      lead({ id: `l${i}`, name: `L${i}`, temperature: 'HOT' }),
    );
    expect(rank(leads)).toHaveLength(6);
    expect(rank(leads, [], [], 10)).toHaveLength(9);
  });

  it('breaks ties with pipeline size and referrals without changing the reason', () => {
    const contacted = ['plain', 'referred', 'big'].map((id, i) =>
      doneTask(`d${i}`, id, daysAgo(1)),
    );
    const result = rank(
      [
        lead({ id: 'plain', name: 'Plain', temperature: 'WARM', amount: amount(10) }),
        lead({ id: 'referred', name: 'Referred', temperature: 'WARM', amount: amount(10), leadSource: 'REFERRAL' }),
        lead({ id: 'big', name: 'Big', temperature: 'WARM', amount: amount(1000) }),
      ],
      [],
      contacted,
    );
    expect(result.map((s) => s.leadId)).toEqual(['big', 'referred', 'plain']);
    expect(new Set(result.map((s) => s.why))).toEqual(new Set(['لید گرم بدون قدم بعدی']));
  });
});

describe('buildFocusPrompt', () => {
  it('mentions every candidate by name and stage, in Persian', () => {
    const suggestions = rank([
      lead({ id: 'a', name: 'شرکت الف', temperature: 'HOT', amount: amount(250) }),
      lead({ id: 'b', name: 'شرکت ب', stage: 'CONTRACT_SENT', stageChangedAt: daysAgo(5) }),
    ]);
    const { systemPrompt, userPrompt } = buildFocusPrompt(suggestions);
    expect(systemPrompt).toMatch(/Hamagan/);
    expect(userPrompt).toContain('شرکت الف');
    expect(userPrompt).toContain('شرکت ب');
    expect(userPrompt).toContain('قرارداد ارسال شده');
    expect(userPrompt).toContain('داغ');
  });
});

describe('focusCacheKey', () => {
  it('scopes the cache to the member and the local calendar day', () => {
    expect(focusCacheKey('member-1', NOW)).toBe('salesApp:todayFocus:member-1:2026-09-12');
  });
});

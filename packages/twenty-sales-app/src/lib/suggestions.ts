import { OPEN_STAGES, type LeadSummary, type Task } from '../api/records';
import { formatMoney } from './format';
import { toPersianDigits } from './jalali';
import { ageTone, daysSince, stageAgeDays } from './leadAge';
import { STAGE_LABELS, TEMP_LABELS } from './strings';

// "What should I do now?" -- a seller with nothing scheduled still has leads
// that need a push. The ranker turns the signals the Today page already has
// into a short, ordered list with one plain reason each. It is deterministic
// on purpose: the AI note layered on top may be slow or down, the list must
// never be.

export type SuggestionKind = 'task' | 'contract' | 'call' | 'follow_up';

export type Suggestion = {
  leadId: string;
  leadName: string;
  stage: string | null;
  temperature: string | null;
  kind: SuggestionKind;
  score: number;
  why: string;
  href: string;
  amountMicros: number | null;
  currencyCode: string | null;
  stageDays: number | null;
  contactDays: number | null;
};

// The done-task query in records.ts has no targets; the suggestions API
// selects just enough to say "when did I last touch this lead".
export type DoneTaskWithTarget = {
  id: string;
  updatedAt: string;
  taskTargets: { edges: { node: { opportunity: { id: string } | null } }[] } | null;
};

export type SuggestionInput = {
  leads: LeadSummary[];
  openTasks: Task[];
  doneTasks: DoneTaskWithTarget[];
  now: Date;
};

const DEFAULT_LIMIT = 6;
const CONTRACT_CHASE_DAYS = 3;
const NO_CONTACT_DAYS = 7;
// Done tasks are only fetched this far back; a lead with none in the window
// is reported as "over N days" rather than an exact count we do not have.
export const DONE_TASK_WINDOW_DAYS = 30;

const CONTRACT_STAGES: Record<string, string> = {
  CONTRACT_SENT: 'قرارداد ارسال شده، پیگیری نشده',
  SIGNED_AWAITING_PAYMENT: 'امضا شده، پرداخت پیگیری نشده',
};

type Reason = { score: number; kind: SuggestionKind; why: string; href?: string };

const taskLeadId = (task: { taskTargets?: DoneTaskWithTarget['taskTargets'] }): string | null => {
  for (const { node } of task.taskTargets?.edges ?? []) {
    if (node.opportunity) return node.opportunity.id;
  }
  return null;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

type LeadTaskState = {
  dueToday: boolean;
  overdue: Task | null;
  hasOpen: boolean;
};

const groupOpenTasks = (tasks: Task[], now: Date): Map<string, LeadTaskState> => {
  const sod = startOfDay(now).getTime();
  const eod = endOfDay(now).getTime();
  const byLead = new Map<string, LeadTaskState>();
  for (const task of tasks) {
    const leadId = taskLeadId(task);
    if (leadId === null) continue;
    const state = byLead.get(leadId) ?? { dueToday: false, overdue: null, hasOpen: false };
    state.hasOpen = true;
    if (task.dueAt) {
      const due = new Date(task.dueAt).getTime();
      if (due >= sod && due <= eod) state.dueToday = true;
      // Keep the oldest overdue task: that is the one to clear first.
      else if (due < sod && (state.overdue === null || due < new Date(state.overdue.dueAt ?? 0).getTime())) {
        state.overdue = task;
      }
    }
    byLead.set(leadId, state);
  }
  return byLead;
};

const lastContactByLead = (doneTasks: DoneTaskWithTarget[]): Map<string, number> => {
  const latest = new Map<string, number>();
  for (const task of doneTasks) {
    const leadId = taskLeadId(task);
    if (leadId === null) continue;
    const at = new Date(task.updatedAt).getTime();
    if (!Number.isFinite(at)) continue;
    latest.set(leadId, Math.max(latest.get(leadId) ?? 0, at));
  }
  return latest;
};

// Top quartile by micros across the seller's own open pipeline (from two
// priced leads up -- it is only a tiebreak). Currencies are compared raw:
// within one seller the mix is nearly always one currency, and a tiebreak is
// not worth an FX table.
const topQuartileThreshold = (leads: LeadSummary[]): number | null => {
  const amounts = leads
    .map((lead) => lead.amount?.amountMicros ?? 0)
    .filter((micros) => micros > 0)
    .sort((a, b) => a - b);
  if (amounts.length < 2) return null;
  return amounts[Math.floor(amounts.length * 0.75)];
};

const reasonsFor = (
  lead: LeadSummary,
  taskState: LeadTaskState | undefined,
  lastContactAt: number | undefined,
  now: Date,
): { reasons: Reason[]; stageDays: number | null; contactDays: number | null } => {
  const reasons: Reason[] = [];
  const hasOpen = taskState?.hasOpen ?? false;
  const stageDays = stageAgeDays(lead.stageChangedAt, lead.createdAt, now.getTime());
  const leadDays = daysSince(lead.createdAt, now.getTime());
  const contactDays =
    lastContactAt === undefined
      ? null
      : daysSince(new Date(lastContactAt).toISOString(), now.getTime());

  // Above any single other reason plus both tiebreaks: a commitment already
  // missed comes before a lead that merely deserves attention.
  if (taskState?.overdue) {
    reasons.push({
      score: 60,
      kind: 'task',
      why: 'کار عقب‌مانده دارد',
      href: `/task/${taskState.overdue.id}`,
    });
  }

  if (!hasOpen && lead.temperature === 'HOT') {
    reasons.push({ score: 40, kind: 'call', why: 'لید داغ بدون قدم بعدی' });
  } else if (!hasOpen && lead.temperature === 'WARM') {
    reasons.push({ score: 25, kind: 'call', why: 'لید گرم بدون قدم بعدی' });
  }

  const contractWhy = lead.stage ? CONTRACT_STAGES[lead.stage] : undefined;
  if (contractWhy && !hasOpen && (stageDays ?? 0) >= CONTRACT_CHASE_DAYS) {
    reasons.push({ score: 35, kind: 'contract', why: contractWhy });
  }

  if (
    lead.stage === 'NEW_LEAD' &&
    !hasOpen &&
    lastContactAt === undefined &&
    (leadDays ?? 0) >= 1
  ) {
    reasons.push({ score: 30, kind: 'call', why: 'لید جدید، هنوز تماس نگرفته‌اید' });
  }

  const tone = ageTone(stageDays);
  if (tone !== 'ok' && stageDays !== null) {
    reasons.push({
      score: tone === 'stale' ? 25 : 15,
      kind: 'follow_up',
      why: `${toPersianDigits(stageDays)} روز در این مرحله`,
    });
  }

  if (contactDays !== null && contactDays >= NO_CONTACT_DAYS) {
    reasons.push({
      score: 15,
      kind: 'follow_up',
      why: `${toPersianDigits(contactDays)} روز بدون تماس`,
    });
  } else if (contactDays === null && (leadDays ?? 0) > DONE_TASK_WINDOW_DAYS) {
    reasons.push({
      score: 15,
      kind: 'follow_up',
      why: `بیش از ${toPersianDigits(DONE_TASK_WINDOW_DAYS)} روز بدون تماس`,
    });
  }

  return { reasons, stageDays, contactDays };
};

export const rankSuggestions = (
  input: SuggestionInput,
  options: { limit?: number } = {},
): Suggestion[] => {
  const { leads, openTasks, doneTasks, now } = input;
  const open = leads.filter((lead) => lead.stage !== null && OPEN_STAGES.includes(lead.stage));
  const taskStates = groupOpenTasks(openTasks, now);
  const lastContact = lastContactByLead(doneTasks);
  const bigDeal = topQuartileThreshold(open);

  const suggestions: Suggestion[] = [];
  for (const lead of open) {
    const taskState = taskStates.get(lead.id);
    // Already on today's task list -- no need to nag twice.
    if (taskState?.dueToday) continue;

    const { reasons, stageDays, contactDays } = reasonsFor(
      lead,
      taskState,
      lastContact.get(lead.id),
      now,
    );
    if (reasons.length === 0) continue;

    const top = reasons.reduce((best, r) => (r.score > best.score ? r : best));
    const micros = lead.amount?.amountMicros ?? null;
    let score = reasons.reduce((sum, r) => sum + r.score, 0);
    if (bigDeal !== null && (micros ?? 0) >= bigDeal) score += 10;
    if (lead.leadSource === 'REFERRAL' || lead.referrer) score += 5;

    suggestions.push({
      leadId: lead.id,
      leadName: lead.name,
      stage: lead.stage,
      temperature: lead.temperature,
      kind: top.kind,
      score,
      why: top.why,
      href: top.href ?? `/lead/${lead.id}`,
      amountMicros: micros,
      currencyCode: lead.amount?.currencyCode ?? null,
      stageDays,
      contactDays,
    });
  }

  suggestions.sort(
    (a, b) =>
      b.score - a.score ||
      (b.amountMicros ?? 0) - (a.amountMicros ?? 0) ||
      a.leadName.localeCompare(b.leadName, 'fa'),
  );
  return suggestions.slice(0, options.limit ?? DEFAULT_LIMIT);
};

// ---------- AI focus note ----------

export const FOCUS_SYSTEM_PROMPT =
  'You are a sales coach for Hamagan, an Afghan software company selling business management systems (HMIS and related products). ' +
  'You are given the leads a salesperson should look at today, already ranked, each with the reason. ' +
  'Write a short "focus of the day" note in Persian (Dari): what to do first and why, then the next one or two. ' +
  'Name at most three leads. Plain text only -- no markdown, no headings, no bullet list. At most 60 words.';

export const buildFocusPrompt = (
  suggestions: Suggestion[],
): { systemPrompt: string; userPrompt: string } => {
  const lines = suggestions.map((s, index) => {
    const parts = [
      `${index + 1}. ${s.leadName}`,
      `مرحله: ${STAGE_LABELS[s.stage ?? ''] ?? s.stage ?? '—'}`,
      s.temperature ? `دما: ${TEMP_LABELS[s.temperature] ?? s.temperature}` : null,
      s.stageDays !== null ? `${toPersianDigits(s.stageDays)} روز در مرحله` : null,
      s.contactDays !== null
        ? `آخرین تماس ${toPersianDigits(s.contactDays)} روز پیش`
        : 'تماسی ثبت نشده',
      (s.amountMicros ?? 0) > 0 ? `مبلغ: ${formatMoney(s.amountMicros, s.currencyCode)}` : null,
      `دلیل: ${s.why}`,
    ];
    return parts.filter((p) => p !== null).join(' | ');
  });
  return { systemPrompt: FOCUS_SYSTEM_PROMPT, userPrompt: lines.join('\n') };
};

const localDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

export const focusCacheKey = (memberId: string, now: Date): string =>
  `salesApp:todayFocus:${memberId}:${localDateKey(now)}`;

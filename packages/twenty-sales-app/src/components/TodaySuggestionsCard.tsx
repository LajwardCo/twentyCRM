import { useCallback, useEffect, useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import { type LeadSummary, type Task } from '../api/records';
import { fetchFocusNote, fetchMyDoneTasksWithTargets } from '../api/suggestions';
import { useCached } from '../lib/cache';
import { formatMoney } from '../lib/format';
import { toPersianDigits } from '../lib/jalali';
import { navigate } from '../lib/router';
import { STAGE_LABELS } from '../lib/strings';
import {
  DONE_TASK_WINDOW_DAYS,
  rankSuggestions,
  type Suggestion,
  type SuggestionKind,
} from '../lib/suggestions';
import {
  IconAI,
  IconClock,
  IconNote,
  IconPhone,
  IconRefresh,
  IconTasks,
} from './icons';

// Kept next to the component rather than in strings.ts: that file's tail is
// where every feature appends, and this card is the only reader.
const STRINGS = {
  title: 'پیشنهاد امروز',
  subtitle: 'بر اساس وضعیت لیدهای شما',
  leadCount: (n: number) => `${toPersianDigits(n)} لید`,
  regenerate: 'پیشنهاد تازه از هوش مصنوعی',
  empty: 'همه چیز مرتب است — لیدی که نیاز به توجه فوری داشته باشد نیست',
  hot: 'داغ',
};

const KIND_ICONS: Record<SuggestionKind, typeof IconPhone> = {
  task: IconTasks,
  contract: IconNote,
  call: IconPhone,
  follow_up: IconClock,
};

// The focus note asks the model about more candidates than the card shows, so
// its "do this first" can be informed by the whole picture.
const NOTE_CANDIDATES = 10;

type TodaySuggestionsCardProps = {
  user: CurrentUser;
  leads: LeadSummary[] | null;
  openTasks: Task[] | null;
};

type NoteState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; text: string }
  | { status: 'failed' };

const SuggestionRow = ({ suggestion }: { suggestion: Suggestion }) => {
  const Icon = KIND_ICONS[suggestion.kind];
  return (
    <div className="deal-row suggest-row" onClick={() => navigate(suggestion.href)}>
      <span className={`suggest-ico kind-${suggestion.kind}`}>
        <Icon size={15} />
      </span>
      <div className="deal-main">
        <div className="deal-name">{suggestion.leadName}</div>
        <div className="deal-sub suggest-sub">
          <span className="suggest-why">{suggestion.why}</span>
          <span>{STAGE_LABELS[suggestion.stage ?? ''] ?? suggestion.stage}</span>
          {suggestion.temperature === 'HOT' && (
            <span style={{ color: 'var(--hot)' }}>· {STRINGS.hot}</span>
          )}
        </div>
      </div>
      {(suggestion.amountMicros ?? 0) > 0 && (
        <span className="deal-val num">
          {formatMoney(suggestion.amountMicros, suggestion.currencyCode)}
        </span>
      )}
    </div>
  );
};

export const TodaySuggestionsCard = ({ user, leads, openTasks }: TodaySuggestionsCardProps) => {
  const memberId = user.workspaceMemberId;

  const fetchDone = useCallback(async () => {
    const since = new Date(Date.now() - DONE_TASK_WINDOW_DAYS * 86_400_000).toISOString();
    try {
      return await fetchMyDoneTasksWithTargets(memberId, since);
    } catch {
      // Without contact history the ranker still works from stage and
      // temperature; a failed side query must not blank the card.
      return [];
    }
  }, [memberId]);

  const { data: doneTasks } = useCached(`suggestions:done:${memberId}`, fetchDone);

  const loading = leads === null || openTasks === null || doneTasks === null;

  const candidates = useMemo(
    () =>
      loading
        ? []
        : rankSuggestions(
            { leads, openTasks, doneTasks, now: new Date() },
            { limit: NOTE_CANDIDATES },
          ),
    [loading, leads, openTasks, doneTasks],
  );
  const shown = candidates.slice(0, 6);

  const [note, setNote] = useState<NoteState>({ status: 'idle' });

  const loadNote = useCallback(
    async (force: boolean) => {
      if (candidates.length === 0) {
        setNote({ status: 'idle' });
        return;
      }
      setNote({ status: 'pending' });
      try {
        const text = await fetchFocusNote(memberId, candidates, { force });
        setNote(text ? { status: 'ready', text } : { status: 'idle' });
      } catch {
        setNote({ status: 'failed' });
      }
    },
    [memberId, candidates],
  );

  // Re-ask only when the set of candidates actually changes, not on every
  // re-render of the Today page.
  const candidateKey = candidates.map((s) => s.leadId).join(',');
  useEffect(() => {
    if (loading) return;
    void loadNote(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, candidateKey, memberId]);

  return (
    <div className="card anim d1">
      <div className="card-pad suggest-head">
        <div>
          <h3 className="suggest-title">
            <span className="suggest-spark">
              <IconAI size={16} />
            </span>
            {STRINGS.title}
            {!loading && shown.length > 0 && (
              <span className="sub"> · {STRINGS.leadCount(shown.length)}</span>
            )}
          </h3>
          <div className="sub">{STRINGS.subtitle}</div>
        </div>
        {!loading && candidates.length > 0 && (
          <button
            className={`icon-btn suggest-refresh ${note.status === 'pending' ? 'spinning' : ''}`}
            aria-label={STRINGS.regenerate}
            title={STRINGS.regenerate}
            disabled={note.status === 'pending'}
            onClick={() => void loadNote(true)}
          >
            <IconRefresh size={15} />
          </button>
        )}
      </div>

      {note.status === 'pending' && (
        <div className="suggest-note">
          <div className="skeleton" style={{ height: 14, width: '90%' }} />
          <div className="skeleton" style={{ height: 14, width: '60%', marginTop: 8 }} />
        </div>
      )}
      {note.status === 'ready' && (
        <div className="suggest-note">
          <span className="suggest-spark">
            <IconAI size={13} />
          </span>
          <p>{note.text}</p>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 44 }} />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state">{STRINGS.empty}</div>
      ) : (
        shown.map((s) => <SuggestionRow key={s.leadId} suggestion={s} />)
      )}
    </div>
  );
};

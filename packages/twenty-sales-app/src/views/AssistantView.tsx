import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  archiveChatThread,
  createChatThread,
  fetchChatMessages,
  fetchChatThreads,
  messageText,
  sendChatMessage,
  type ChatMessage,
  type ChatThread,
} from '../api/ai';
import { resolveAttachment } from '../api/assistantAttachments';
import { fetchAiUsage } from '../api/aiUsage';
import { AssistantAttachPicker } from '../components/AssistantAttachPicker';
import {
  IconAI,
  IconChevronDown,
  IconClose,
  IconPaperclip,
  IconPlus,
  IconSearch,
  IconSend,
  IconTrash,
} from '../components/icons';
import { formatTokensCompact, rangeBounds } from '../lib/aiUsage';
import {
  attachmentKey,
  composeAssistantMessage,
  parseAssistantMessage,
  type ChatAttachment,
  type ResolvedAttachment,
} from '../lib/assistantContext';
import { ATTACHMENT_KIND_LABELS, TAI } from '../lib/assistantStrings';
import { formatJalaliDate } from '../lib/jalali';
import { navigate } from '../lib/router';
import { T } from '../lib/strings';

// The standalone AI assistant: a chat not tied to any one record, with the
// seller's thread history beside it and CRM records attachable to any
// message. Threads are Twenty's own agent-chat threads (the lead chat screen
// writes into the same list).

type DisplayMessage = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  attachments: ChatAttachment[];
};

type AssistantViewProps = {
  threadId: string | null;
};

const POLL_FIRST_MS = 1200;
const POLL_NEXT_MS = 1500;
const POLL_MAX_ATTEMPTS = 80;
const NEAR_BOTTOM_PX = 80;

const toDisplay = (serverMessages: ChatMessage[]): DisplayMessage[] =>
  serverMessages
    .map((message): DisplayMessage => {
      const raw = messageText(message);
      if (message.role !== 'user') {
        return { id: message.id, role: 'ai', text: raw, attachments: [] };
      }
      const parsed = parseAssistantMessage(raw);
      return {
        id: message.id,
        role: 'user',
        text: parsed.question,
        attachments: parsed.attachments,
      };
    })
    .filter((message) => message.text.trim() !== '' || message.attachments.length > 0);

const threadTokens = (thread: ChatThread | undefined): number =>
  thread ? thread.totalInputTokens + thread.totalOutputTokens : 0;

const AttachmentChips = ({
  items,
  onRemove,
}: {
  items: ChatAttachment[];
  onRemove?: (item: ChatAttachment) => void;
}) => (
  <div className="ai-chips">
    {items.map((item) => (
      <span key={attachmentKey(item)} className="ai-chip">
        <IconPaperclip size={12} />
        <span className="ai-chip-kind">{ATTACHMENT_KIND_LABELS[item.kind]}</span>
        <span className="ai-chip-label">{item.label}</span>
        {onRemove && (
          <button
            type="button"
            className="ai-chip-remove"
            aria-label={TAI.removeAttachment}
            onClick={() => onRemove(item)}
          >
            <IconClose size={11} />
          </button>
        )}
      </span>
    ))}
  </div>
);

export const AssistantView = ({ threadId }: AssistantViewProps) => {
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [threadsFailed, setThreadsFailed] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [myUsage, setMyUsage] = useState<number | null>(null);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef(0);
  // The thread the screen is showing right now, for callbacks that outlive a
  // switch (a reply poll must not paint into another thread).
  const activeThreadRef = useRef<string | null>(threadId);
  // A thread this screen just created: the route change that follows must
  // not reload it and wipe the message still being answered.
  const createdThreadRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);

  const loadThreads = useCallback(async () => {
    try {
      const all = await fetchChatThreads();
      setThreads(all.filter((thread) => thread.deletedAt === null));
      setThreadsFailed(false);
    } catch {
      setThreadsFailed(true);
      setThreads((previous) => previous ?? []);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
    void fetchAiUsage('me', rangeBounds('30d')).then((result) => {
      if (result.status === 'ok') setMyUsage(result.report.totals.totalTokens);
    });
    return () => window.clearTimeout(pollRef.current);
  }, [loadThreads]);

  useEffect(() => {
    activeThreadRef.current = threadId;
    setHistoryOpen(false);
    if (threadId !== null && threadId === createdThreadRef.current) return;
    createdThreadRef.current = null;

    window.clearTimeout(pollRef.current);
    setWaiting(false);
    setError(null);
    stickToBottomRef.current = true;

    if (threadId === null) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setMessages([]);
    setLoadingMessages(true);
    fetchChatMessages(threadId)
      .then((serverMessages) => {
        if (!cancelled) setMessages(toDisplay(serverMessages));
      })
      .catch(() => {
        if (!cancelled) setError(TAI.messagesFailed);
      })
      .finally(() => {
        if (!cancelled) setLoadingMessages(false);
      });

    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const container = scrollRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior });
  };

  useEffect(() => {
    if (stickToBottomRef.current) scrollToBottom('smooth');
  }, [messages, waiting]);

  const handleScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_PX;
    stickToBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
  };

  const pollForReply = (thread: string, sinceReplies: number, attempt = 0) => {
    window.clearTimeout(pollRef.current);
    pollRef.current = window.setTimeout(
      async () => {
        if (activeThreadRef.current !== thread) return;
        try {
          const display = toDisplay(await fetchChatMessages(thread));
          if (activeThreadRef.current !== thread) return;
          if (display.filter((message) => message.role === 'ai').length > sinceReplies) {
            setMessages(display);
            setWaiting(false);
            // The first reply is when the server has titled the thread and
            // added up its tokens.
            void loadThreads();
            return;
          }
        } catch {
          // transient; keep polling
        }
        if (attempt < POLL_MAX_ATTEMPTS) {
          pollForReply(thread, sinceReplies, attempt + 1);
        } else {
          setWaiting(false);
          setError(T.aiTimeout);
        }
      },
      attempt === 0 ? POLL_FIRST_MS : POLL_NEXT_MS,
    );
  };

  const send = async () => {
    const question = draft.trim();
    if (question === '' || waiting || preparing) return;
    setError(null);

    let composed = question;
    if (attachments.length > 0) {
      setPreparing(true);
      const settled = await Promise.allSettled(attachments.map(resolveAttachment));
      setPreparing(false);
      const failed = attachments.filter((_, index) => settled[index].status === 'rejected');
      if (failed.length > 0) {
        setError(`${TAI.attachFailed} ${failed.map((item) => item.label).join('، ')}`);
        return;
      }
      composed = composeAssistantMessage(
        question,
        settled.map((result) => (result as PromiseFulfilledResult<ResolvedAttachment>).value),
      );
    }

    const sentAttachments = attachments;
    const repliesSoFar = messages.filter((message) => message.role === 'ai').length;
    setDraft('');
    setAttachments([]);
    setWaiting(true);
    stickToBottomRef.current = true;
    setMessages((previous) => [
      ...previous,
      { id: `local-${Date.now()}`, role: 'user', text: question, attachments: sentAttachments },
    ]);

    try {
      let thread = threadId;
      if (thread === null) {
        thread = await createChatThread();
        createdThreadRef.current = thread;
        activeThreadRef.current = thread;
        navigate(`/assistant/${thread}`);
      }
      await sendChatMessage({ threadId: thread, text: composed });
      pollForReply(thread, repliesSoFar);
      void loadThreads();
    } catch (sendError) {
      setWaiting(false);
      setError(sendError instanceof Error ? sendError.message : T.sendFailedChat);
    }
  };

  const archive = async (thread: ChatThread) => {
    if (!window.confirm(TAI.archiveConfirm)) return;
    try {
      await archiveChatThread(thread.id);
      setThreads((previous) => previous?.filter((item) => item.id !== thread.id) ?? null);
      if (thread.id === threadId) navigate('/assistant');
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : TAI.loadFailed);
    }
  };

  const toggleAttachment = (attachment: ChatAttachment) =>
    setAttachments((previous) =>
      previous.some((item) => attachmentKey(item) === attachmentKey(attachment))
        ? previous.filter((item) => attachmentKey(item) !== attachmentKey(attachment))
        : [...previous, attachment],
    );

  const visibleThreads = useMemo(() => {
    const query = historyQuery.trim().toLowerCase();
    return (threads ?? []).filter(
      (thread) => query === '' || (thread.title ?? '').toLowerCase().includes(query),
    );
  }, [threads, historyQuery]);

  const activeThread = threads?.find((thread) => thread.id === threadId);
  const activeTokens = threadTokens(activeThread);

  return (
    <div className="ai-page">
      <aside className={`ai-history${historyOpen ? ' open' : ''}`} aria-label={TAI.history}>
        <div className="ai-history-head">
          <button className="btn sm ai-new-chat" onClick={() => navigate('/assistant')}>
            <IconPlus size={15} />
            {TAI.newChat}
          </button>
          <button
            className="btn line sm ai-history-close"
            onClick={() => setHistoryOpen(false)}
            aria-label={TAI.hideHistory}
          >
            <IconClose size={15} />
          </button>
        </div>

        <div className="cmd-search ai-history-search">
          <span className="s-ico">
            <IconSearch size={15} />
          </span>
          <input
            type="search"
            value={historyQuery}
            placeholder={TAI.searchHistory}
            onChange={(event) => setHistoryQuery(event.target.value)}
          />
        </div>

        <div className="ai-history-label">{TAI.history}</div>
        <div className="ai-history-list">
          {threads === null &&
            [0, 1, 2].map((index) => (
              <div key={index} className="skeleton" style={{ height: 46, marginBottom: 6 }} />
            ))}
          {threadsFailed && <div className="ai-history-note">{TAI.loadFailed}</div>}
          {threads !== null && !threadsFailed && visibleThreads.length === 0 && (
            <div className="ai-history-note">{TAI.historyEmpty}</div>
          )}
          {visibleThreads.map((thread) => (
            <div
              key={thread.id}
              className={`ai-thread${thread.id === threadId ? ' on' : ''}`}
            >
              <button
                className="ai-thread-main"
                onClick={() => navigate(`/assistant/${thread.id}`)}
              >
                <b>{thread.title || TAI.untitled}</b>
                <small className="num">
                  {formatJalaliDate(thread.lastMessageAt ?? thread.updatedAt)}
                  {threadTokens(thread) > 0 &&
                    ` · ${formatTokensCompact(threadTokens(thread))} ${TAI.tokens}`}
                </small>
              </button>
              <button
                className="ai-thread-archive"
                aria-label={TAI.archive}
                title={TAI.archive}
                onClick={() => void archive(thread)}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>

        {myUsage !== null && (
          <div className="ai-history-usage">
            {TAI.myUsage}:{' '}
            <b className="num">
              {formatTokensCompact(myUsage)} {TAI.tokens}
            </b>
          </div>
        )}
      </aside>
      {historyOpen && <div className="ai-history-scrim" onClick={() => setHistoryOpen(false)} />}

      <section className="ai-chat">
        <div className="ai-chat-head">
          <button
            className="btn line sm ai-history-toggle"
            onClick={() => setHistoryOpen(true)}
          >
            {TAI.showHistory}
          </button>
          <div className="ai-chat-title">
            <b>{threadId === null ? TAI.newChat : activeThread?.title || TAI.untitled}</b>
            {activeTokens > 0 && (
              <small className="num">
                {TAI.threadTokens}: {formatTokensCompact(activeTokens)} {TAI.tokens}
              </small>
            )}
          </div>
          {threadId !== null && (
            <button
              className="btn line sm"
              onClick={() => navigate('/assistant')}
              aria-label={TAI.newChat}
            >
              <IconPlus size={15} />
            </button>
          )}
        </div>

        <div className="chat-scroll" ref={scrollRef} onScroll={handleScroll}>
          {loadingMessages && (
            <div className="chat-log">
              <div className="skeleton" style={{ height: 40, width: '60%' }} />
              <div className="skeleton" style={{ height: 90, width: '75%', alignSelf: 'flex-end' }} />
            </div>
          )}

          {!loadingMessages && messages.length === 0 && !waiting && (
            <div className="ai-empty">
              <span className="ai-empty-ico">
                <IconAI size={30} />
              </span>
              <h2>{TAI.emptyTitle}</h2>
              <p>{TAI.emptyHint}</p>
              <div className="ai-suggestions">
                {TAI.suggestions.map((suggestion) => (
                  <button key={suggestion} className="ai-suggestion" onClick={() => setDraft(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="chat-log">
            {messages.map((message) => (
              <div key={message.id} className={`chat-msg ${message.role}`}>
                {message.attachments.length > 0 && <AttachmentChips items={message.attachments} />}
                {message.text}
              </div>
            ))}
            {waiting && (
              <div className="chat-msg ai thinking">
                <span className="dots">{T.thinking}</span>
              </div>
            )}
          </div>
          {error !== null && <div className="error-banner">{error}</div>}
        </div>

        {!atBottom && messages.length > 0 && (
          <button
            className="ai-scroll-bottom"
            onClick={() => {
              stickToBottomRef.current = true;
              scrollToBottom('smooth');
            }}
            aria-label={TAI.scrollToBottom}
            title={TAI.scrollToBottom}
          >
            <IconChevronDown size={18} />
          </button>
        )}

        <div className="chat-input-bar ai-input-bar">
          <div className="ai-input-stack">
            {attachments.length > 0 && (
              <AttachmentChips items={attachments} onRemove={toggleAttachment} />
            )}
            {preparing && <div className="ai-preparing">{TAI.preparingContext}</div>}
            <div className="chat-input-inner">
              <button
                className="btn line ai-attach-btn"
                onClick={() => setPickerOpen(true)}
                aria-label={TAI.attach}
                title={TAI.attach}
              >
                <IconPaperclip size={18} />
              </button>
              <textarea
                rows={1}
                placeholder={TAI.placeholder}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                className="btn ai-send-btn"
                disabled={waiting || preparing || draft.trim() === ''}
                onClick={() => void send()}
                aria-label={T.send}
              >
                <IconSend size={18} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {pickerOpen && (
        <AssistantAttachPicker
          selected={attachments}
          onToggle={toggleAttachment}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
};

import { useEffect, useRef, useState } from 'react';

import {
  createChatThread,
  fetchChatMessages,
  messageText,
  sendChatMessage,
  type ChatMessage,
} from '../api/ai';
import { fetchLead } from '../api/records';
import { IconSend } from '../components/icons';
import { TopBar } from '../components/Shell';

type LeadChatViewProps = {
  leadId: string;
};

type DisplayMessage = {
  id: string;
  role: 'user' | 'ai';
  text: string;
  pending?: boolean;
};

export const LeadChatView = ({ leadId }: LeadChatViewProps) => {
  const [leadName, setLeadName] = useState('AI Chat');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number>(0);

  useEffect(() => {
    fetchLead(leadId)
      .then((lead) => setLeadName(lead.name))
      .catch(() => undefined);
    return () => window.clearTimeout(pollRef.current);
  }, [leadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, waiting]);

  const toDisplay = (serverMessages: ChatMessage[]): DisplayMessage[] =>
    serverMessages
      .map((m) => ({
        id: m.id,
        role: (m.role === 'user' ? 'user' : 'ai') as 'user' | 'ai',
        text: messageText(m),
      }))
      .filter((m) => m.text.trim() !== '');

  // Poll until an assistant message newer than `sinceCount` appears.
  const pollForReply = (thread: string, sinceCount: number, attempt = 0) => {
    window.clearTimeout(pollRef.current);
    pollRef.current = window.setTimeout(
      async () => {
        try {
          const serverMessages = await fetchChatMessages(thread);
          const display = toDisplay(serverMessages);
          const assistantCount = display.filter((m) => m.role === 'ai').length;
          if (assistantCount > sinceCount) {
            setMessages(display);
            setWaiting(false);
            return;
          }
        } catch {
          // transient; keep polling
        }
        if (attempt < 80) {
          pollForReply(thread, sinceCount, attempt + 1);
        } else {
          setWaiting(false);
          setError('The AI did not reply in time. Try again.');
        }
      },
      attempt === 0 ? 1200 : 1500,
    );
  };

  const send = async () => {
    const text = draft.trim();
    if (text === '' || waiting) return;
    setDraft('');
    setError(null);
    setWaiting(true);
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: 'user', text },
    ]);

    try {
      const thread = threadId ?? (await createChatThread());
      if (threadId === null) setThreadId(thread);
      const assistantCount = messages.filter((m) => m.role === 'ai').length;
      await sendChatMessage({ threadId: thread, text, recordId: leadId });
      pollForReply(thread, assistantCount);
    } catch (err) {
      setWaiting(false);
      setError(err instanceof Error ? err.message : 'Failed to send');
    }
  };

  return (
    <>
      <TopBar title={`AI · ${leadName}`} showBack />
      <main
        className="app-main"
        style={{ paddingBottom: 'calc(96px + var(--safe-bottom))' }}
      >
        {messages.length === 0 && !waiting && (
          <div className="empty-state">
            Ask anything about this lead — history, next steps, how to pitch,
            objections…
          </div>
        )}
        <div className="chat-log">
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.role}`}>
              {m.text}
            </div>
          ))}
          {waiting && (
            <div className="chat-msg ai muted">Thinking…</div>
          )}
        </div>
        {error !== null && <div className="error-banner">{error}</div>}
        <div ref={bottomRef} />
      </main>

      <div className="chat-input-bar">
        <textarea
          rows={1}
          placeholder="Ask about this lead…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="btn"
          style={{ borderRadius: '50%', width: 44, height: 44, padding: 0 }}
          disabled={waiting || draft.trim() === ''}
          onClick={send}
          aria-label="Send"
        >
          <IconSend size={18} />
        </button>
      </div>
    </>
  );
};

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
import { T } from '../lib/strings';
import { announceDockablePage, clearDockablePage } from '../lib/workbench';

type LeadChatViewProps = {
  leadId: string;
};

type DisplayMessage = {
  id: string;
  role: 'user' | 'ai';
  text: string;
};

export const LeadChatView = ({ leadId }: LeadChatViewProps) => {
  const [leadName, setLeadName] = useState('');
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
    announceDockablePage(leadName ? `AI — ${leadName}` : 'گفتگو با AI', 'lead');
    return clearDockablePage;
  }, [leadName]);

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
          setError(T.aiTimeout);
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
      { id: `local-${prev.length}`, role: 'user', text },
    ]);

    try {
      const thread = threadId ?? (await createChatThread());
      if (threadId === null) setThreadId(thread);
      const assistantCount = messages.filter((m) => m.role === 'ai').length;
      await sendChatMessage({ threadId: thread, text, recordId: leadId });
      pollForReply(thread, assistantCount);
    } catch (err) {
      setWaiting(false);
      setError(err instanceof Error ? err.message : T.sendFailedChat);
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-scroll">
        {messages.length === 0 && !waiting && (
          <div className="empty-state" style={{ paddingTop: 80 }}>
            <div
              style={{
                fontSize: 34,
                marginBottom: 10,
              }}
            >
              ✨
            </div>
            {T.chatEmpty}
          </div>
        )}
        <div className="chat-log">
          {messages.map((m) => (
            <div key={m.id} className={`chat-msg ${m.role}`}>
              {m.text}
            </div>
          ))}
          {waiting && (
            <div className="chat-msg ai thinking">
              <span className="dots">{T.thinking}</span>
            </div>
          )}
        </div>
        {error !== null && <div className="error-banner">{error}</div>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar">
        <div className="chat-input-inner">
          <textarea
            rows={1}
            placeholder={leadName ? `${T.chatPlaceholder} (${leadName})` : T.chatPlaceholder}
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
            style={{ borderRadius: '50%', width: 44, height: 44, padding: 0, flexShrink: 0 }}
            disabled={waiting || draft.trim() === ''}
            onClick={send}
            aria-label={T.send}
          >
            <IconSend size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

import { loadTokens, metadataQuery } from './client';

// ---------- one-shot generation (summary / call script) ----------

export const generateText = async (
  systemPrompt: string,
  userPrompt: string,
): Promise<string> => {
  const tokens = loadTokens();
  const response = await fetch('/rest/ai/generate-text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokens?.accessToken ?? ''}`,
    },
    body: JSON.stringify({ systemPrompt, userPrompt }),
  });

  if (!response.ok) {
    let message = `AI request failed (${response.status})`;
    try {
      const body = (await response.json()) as {
        message?: string | string[];
        messages?: string[];
      };
      const detail = body.messages ?? body.message;
      if (detail) {
        message = Array.isArray(detail) ? detail.join(', ') : detail;
      }
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  const json = (await response.json()) as { text: string };
  return json.text;
};

// ---------- agent chat (talk about this lead) ----------

export type ChatMessage = {
  id: string;
  role: string;
  createdAt: string;
  parts: {
    type: string;
    textContent: string | null;
  }[];
};

export const createChatThread = async (): Promise<string> => {
  const data = await metadataQuery<{ createChatThread: { id: string } }>(
    `mutation CreateChatThread {
      createChatThread { id }
    }`,
  );
  return data.createChatThread.id;
};

// recordId pins the chat to one lead (the lead chat screen); the standalone
// assistant sends its records inside the text instead (lib/assistantContext).
export const sendChatMessage = async (input: {
  threadId: string;
  text: string;
  recordId?: string;
}): Promise<void> => {
  await metadataQuery(
    `mutation SendChatMessage(
      $threadId: UUID!
      $text: String!
      $messageId: UUID!
      $browsingContext: JSON
    ) {
      sendChatMessage(
        threadId: $threadId
        text: $text
        messageId: $messageId
        browsingContext: $browsingContext
      ) {
        messageId
        queued
      }
    }`,
    {
      threadId: input.threadId,
      text: input.text,
      messageId: crypto.randomUUID(),
      browsingContext:
        input.recordId === undefined
          ? null
          : {
              type: 'recordPage',
              objectNameSingular: 'opportunity',
              recordId: input.recordId,
            },
    },
  );
};

// ---------- thread history (standalone assistant) ----------

export type ChatThread = {
  id: string;
  title: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  deletedAt: string | null;
};

// Every thread of the signed-in user, most recently active first (the
// server's order). Archived threads come back too; callers hide them.
export const fetchChatThreads = async (): Promise<ChatThread[]> => {
  const data = await metadataQuery<{ chatThreads: ChatThread[] }>(
    `query ChatThreads {
      chatThreads {
        id
        title
        totalInputTokens
        totalOutputTokens
        createdAt
        updatedAt
        lastMessageAt
        deletedAt
      }
    }`,
  );
  return data.chatThreads;
};

// Archive, not delete: the thread leaves the history list but its messages
// and token totals stay on the server.
export const archiveChatThread = async (id: string): Promise<void> => {
  await metadataQuery(
    `mutation ArchiveChatThread($id: UUID!) {
      archiveChatThread(id: $id) { id }
    }`,
    { id },
  );
};

export const fetchChatMessages = async (
  threadId: string,
): Promise<ChatMessage[]> => {
  const data = await metadataQuery<{ chatMessages: ChatMessage[] }>(
    `query GetChatMessages($threadId: UUID!) {
      chatMessages(threadId: $threadId) {
        id
        role
        createdAt
        parts {
          type
          textContent
        }
      }
    }`,
    { threadId },
  );
  return data.chatMessages;
};

export const messageText = (message: ChatMessage): string =>
  message.parts
    .filter((p) => p.type === 'text' && p.textContent)
    .map((p) => p.textContent)
    .join('\n');

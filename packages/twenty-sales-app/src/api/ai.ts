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

export const sendChatMessage = async (input: {
  threadId: string;
  text: string;
  recordId: string;
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
      browsingContext: {
        type: 'recordPage',
        objectNameSingular: 'opportunity',
        recordId: input.recordId,
      },
    },
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

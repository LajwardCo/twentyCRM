// Records a seller attaches to an AI-assistant message travel inside the
// message text itself: Twenty's chat takes a single "browsing context" record,
// and the agent's own record tools would spend tokens (and guesswork) looking
// things up the app already has on screen. So the app reads each record with
// the seller's own permissions, writes it out as plain text in a
// <crm_context> envelope ahead of the question, and strips the envelope again
// when the thread is shown, leaving chips in its place.

export type AttachmentKind =
  | 'lead'
  | 'person'
  | 'company'
  | 'task'
  | 'note'
  | 'survey';

export const ATTACHMENT_KINDS: readonly AttachmentKind[] = [
  'lead',
  'person',
  'company',
  'survey',
  'task',
  'note',
];

export type ChatAttachment = {
  kind: AttachmentKind;
  id: string;
  label: string;
};

export type ResolvedAttachment = ChatAttachment & {
  text: string;
};

// A long lead history can run to pages; past this the context costs more
// tokens than it adds. The cut is marked so the model knows it is partial.
export const MAX_ATTACHMENT_CHARS = 6000;

const OPEN_TAG = '<crm_context>';
const CLOSE_TAG = '</crm_context>';
const PREAMBLE =
  'CRM records the user attached to this message, as read-only context. ' +
  'Use them to answer; do not look them up again.';

const escapeAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\r\n]+/g, ' ');

const unescapeAttribute = (value: string): string =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

// Record text is free-form (notes, survey answers); it must not be able to
// close the envelope early and smuggle the rest in as the user's question.
const neutraliseBody = (text: string): string =>
  text.replace(/<\/(crm_context|record)/gi, '<\\/$1');

const truncate = (text: string): string =>
  text.length > MAX_ATTACHMENT_CHARS
    ? `${text.slice(0, MAX_ATTACHMENT_CHARS)}\n[... truncated]`
    : text;

export const attachmentKey = (attachment: ChatAttachment): string =>
  `${attachment.kind}:${attachment.id}`;

export const composeAssistantMessage = (
  question: string,
  attachments: ResolvedAttachment[],
): string => {
  const trimmed = question.trim();
  if (attachments.length === 0) return trimmed;

  const records = attachments.map(
    (attachment) =>
      `<record kind="${attachment.kind}" id="${escapeAttribute(attachment.id)}" label="${escapeAttribute(attachment.label)}">\n` +
      `${neutraliseBody(truncate(attachment.text.trim()))}\n</record>`,
  );

  return [OPEN_TAG, PREAMBLE, ...records, CLOSE_TAG, '', trimmed].join('\n');
};

const RECORD_HEADER =
  /<record kind="([a-z]+)" id="([^"]*)" label="([^"]*)">/g;

const isAttachmentKind = (value: string): value is AttachmentKind =>
  (ATTACHMENT_KINDS as readonly string[]).includes(value);

// The inverse, for display: the question as typed plus what was attached.
// Text without an envelope (older threads, the lead chat) comes back as is.
export const parseAssistantMessage = (
  text: string,
): { question: string; attachments: ChatAttachment[] } => {
  const start = text.indexOf(OPEN_TAG);
  const end = text.indexOf(CLOSE_TAG);

  if (start !== 0 || end === -1) {
    return { question: text, attachments: [] };
  }

  const envelope = text.slice(0, end);
  const attachments: ChatAttachment[] = [];

  for (const match of envelope.matchAll(RECORD_HEADER)) {
    const [, kind, id, label] = match;
    if (!isAttachmentKind(kind)) continue;
    attachments.push({
      kind,
      id: unescapeAttribute(id),
      label: unescapeAttribute(label),
    });
  }

  return {
    question: text.slice(end + CLOSE_TAG.length).trim(),
    attachments,
  };
};

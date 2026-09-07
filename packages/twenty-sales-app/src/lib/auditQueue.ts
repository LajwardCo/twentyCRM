import { dedupeKeyOf, type AuditRecord } from './auditEvent';

// The buffer between "a user did something" and "a row exists on the server".
//
// Three properties matter and they are all about not losing events:
//   - it never throws into the caller, so a failing audit can never break a
//     screen the seller is trying to use;
//   - it survives a reload, a crash and a lost connection, because a log that
//     quietly drops what happened while the phone was in a lift is not a log;
//   - it batches, because one network round trip per tap on a 3G phone would
//     make the app slower than the thing it is auditing.
//
// Every dependency is injected so the behaviour above is testable without a
// browser or a clock.

export type AuditSink = (records: AuditRecord[]) => Promise<void>;

export type QueueStorage = {
  read: () => string | null;
  write: (value: string) => void;
  clear: () => void;
};

export type AuditQueueOptions = {
  sink: AuditSink;
  storage?: QueueStorage | null;
  now?: () => number;
  maxBatch?: number;
  // How long the same event on the same target is folded into one row.
  dedupeWindowMs?: number;
  // Hard cap on unsent rows. Past this the oldest go, and the loss is itself
  // recorded rather than hidden.
  maxBuffer?: number;
};

export type AuditQueue = {
  push: (record: AuditRecord) => void;
  flush: () => Promise<void>;
  pending: () => number;
  droppedCount: () => number;
  drain: () => AuditRecord[];
};

const STORAGE_VERSION = 1;

export const createAuditQueue = ({
  sink,
  storage = null,
  now = () => Date.now(),
  maxBatch = 25,
  dedupeWindowMs = 4000,
  maxBuffer = 500,
}: AuditQueueOptions): AuditQueue => {
  let buffer: AuditRecord[] = [];
  let dropped = 0;
  let flushing: Promise<void> | null = null;
  const lastSeen = new Map<string, number>();

  const persist = () => {
    if (storage === null) return;
    try {
      if (buffer.length === 0) {
        storage.clear();
        return;
      }
      storage.write(
        JSON.stringify({ v: STORAGE_VERSION, dropped, records: buffer }),
      );
    } catch {
      // A full or unavailable localStorage must not take the app with it.
    }
  };

  const restore = () => {
    if (storage === null) return;
    try {
      const raw = storage.read();
      if (raw === null) return;
      const parsed = JSON.parse(raw) as {
        v?: number;
        dropped?: number;
        records?: AuditRecord[];
      };
      if (parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.records)) return;
      buffer = parsed.records.slice(-maxBuffer);
      dropped = typeof parsed.dropped === 'number' ? parsed.dropped : 0;
    } catch {
      // Corrupt buffer: better to start clean than to wedge every later flush.
      storage.clear();
    }
  };

  restore();

  const push = (record: AuditRecord) => {
    const key = dedupeKeyOf(record);
    const at = now();
    const previous = lastSeen.get(key);
    if (previous !== undefined && at - previous < dedupeWindowMs) return;
    lastSeen.set(key, at);
    // The dedupe map is bounded: without this a long shift on the leads list
    // would grow it without limit.
    if (lastSeen.size > 400) {
      for (const [k, t] of lastSeen) {
        if (at - t >= dedupeWindowMs) lastSeen.delete(k);
      }
    }

    buffer.push(record);
    if (buffer.length > maxBuffer) {
      dropped += buffer.length - maxBuffer;
      buffer = buffer.slice(-maxBuffer);
    }
    persist();
  };

  const flush = async (): Promise<void> => {
    if (flushing !== null) return flushing;
    if (buffer.length === 0) return;

    flushing = (async () => {
      // Send oldest first, one batch at a time, and only drop what the server
      // confirmed. A failed batch stays in the buffer for the next attempt.
      while (buffer.length > 0) {
        const batch = buffer.slice(0, maxBatch);
        try {
          await sink(batch);
        } catch {
          break;
        }
        buffer = buffer.slice(batch.length);
        persist();
      }
      if (dropped > 0 && buffer.length === 0) {
        const lost = dropped;
        dropped = 0;
        persist();
        try {
          await sink([overflowRecord(lost, now())]);
        } catch {
          dropped = lost;
          persist();
        }
      }
    })().finally(() => {
      flushing = null;
    });

    return flushing;
  };

  return {
    push,
    flush,
    pending: () => buffer.length,
    droppedCount: () => dropped,
    drain: () => {
      const out = buffer;
      buffer = [];
      persist();
      return out;
    },
  };
};

// A gap in an audit log has to be visible in the audit log itself, otherwise
// the cheapest attack on it is to make it overflow.
const overflowRecord = (lost: number, at: number): AuditRecord => ({
  occurredAt: new Date(at).toISOString(),
  eventType: 'audit.buffer_overflow',
  category: 'security',
  severity: 'critical',
  actorMemberId: null,
  actorName: 'سیستم',
  actorEmail: '',
  actorRole: 'system',
  targetType: null,
  targetId: null,
  targetLabel: null,
  route: null,
  detail: JSON.stringify({ lostEvents: lost }),
  sessionId: 'system',
  device: null,
});

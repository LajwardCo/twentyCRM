import { describe, expect, it } from 'vitest';

import {
  buildAuditRecord,
  isWatermarkedSection,
  changedFieldsOf,
  classifyOperation,
  dedupeKeyOf,
  parseOperation,
  redactDetail,
  targetIdOf,
} from './auditEvent';

const ID = '11111111-2222-3333-4444-555555555555';

describe('parseOperation', () => {
  it('names the operation and its root field', () => {
    const parsed = parseOperation(`query MyLeads($f: X) {
      opportunities(filter: $f) { edges { node { id } } }
    }`);
    expect(parsed).toEqual({
      operation: 'query',
      operationName: 'MyLeads',
      rootField: 'opportunities',
    });
  });

  it('reads mutations', () => {
    expect(parseOperation('mutation Del($id: UUID!) { deleteTask(id: $id) { id } }'))
      .toEqual({ operation: 'mutation', operationName: 'Del', rootField: 'deleteTask' });
  });

  it('sees through an aliased root field', () => {
    expect(parseOperation('query { mine: opportunities { id } }').rootField).toBe(
      'opportunities',
    );
  });

  it('ignores comments above the operation', () => {
    expect(parseOperation('# mutation Fake { x }\nquery Real { people { id } }'))
      .toMatchObject({ operationName: 'Real', rootField: 'people' });
  });

  it('never throws on junk', () => {
    expect(() => parseOperation('')).not.toThrow();
    expect(parseOperation('').rootField).toBeNull();
  });
});

describe('classifyOperation', () => {
  it('classifies a create as a write', () => {
    expect(classifyOperation(parseOperation('mutation { createNote { id } }')))
      .toMatchObject({ eventType: 'record.create', category: 'write', targetType: 'note' });
  });

  it('marks every delete critical, whatever the object is', () => {
    expect(classifyOperation(parseOperation('mutation { deleteNote { id } }')))
      .toMatchObject({ category: 'delete', severity: 'critical' });
    expect(classifyOperation(parseOperation('mutation { destroyManyTasks { id } }')))
      .toMatchObject({ category: 'delete', severity: 'critical' });
  });

  it('marks writes to sensitive objects sensitive and others merely notable', () => {
    expect(classifyOperation(parseOperation('mutation { updateOpportunity { id } }'))?.severity)
      .toBe('sensitive');
    expect(classifyOperation(parseOperation('mutation { updateTask { id } }'))?.severity)
      .toBe('notice');
  });

  it('records reads of sensitive objects', () => {
    expect(classifyOperation(parseOperation('query { people { id } }')))
      .toMatchObject({ eventType: 'record.read', category: 'read', targetType: 'people' });
  });

  it('drops reads of uninteresting objects so the log stays readable', () => {
    expect(classifyOperation(parseOperation('query { currentUser { id } }'))).toBeNull();
    expect(classifyOperation(parseOperation('query { getRoles { id } }'))).toBeNull();
  });

  it('does not mistake a prefix-only field for a mutation', () => {
    // `create` alone is not "create <something>"
    expect(classifyOperation(parseOperation('mutation { create { id } }'))).toBeNull();
  });

  it('returns null when there is no root field', () => {
    expect(classifyOperation(parseOperation(''))).toBeNull();
  });
});

describe('targetIdOf', () => {
  it('finds the record id a call names', () => {
    expect(targetIdOf({ id: ID })).toBe(ID);
    expect(targetIdOf({ leadId: ID })).toBe(ID);
  });

  it('ignores non-uuid values and list filters', () => {
    expect(targetIdOf({ id: 'NEW_LEAD' })).toBeNull();
    expect(targetIdOf({ filter: { stage: { eq: 'X' } } })).toBeNull();
    expect(targetIdOf(undefined)).toBeNull();
  });
});

describe('changedFieldsOf', () => {
  it('lists the field names a mutation wrote', () => {
    expect(changedFieldsOf({ id: ID, data: { amount: 5, stage: 'WON' } }))
      .toEqual(['amount', 'stage']);
  });

  it('reads the first element of a bulk payload', () => {
    expect(changedFieldsOf({ data: [{ name: 'a' }] })).toEqual(['name']);
  });

  it('is empty when there is no payload', () => {
    expect(changedFieldsOf({ id: ID })).toEqual([]);
    expect(changedFieldsOf(undefined)).toEqual([]);
  });
});

describe('redactDetail', () => {
  it('never lets a secret through, at any depth', () => {
    const out = redactDetail({
      password: 'hunter2',
      nested: { refreshToken: 'abc', apiKey: 'k' },
    }) as Record<string, Record<string, string>>;
    expect(out.password).toBe('[redacted]');
    expect(out.nested.refreshToken).toBe('[redacted]');
    expect(out.nested.apiKey).toBe('[redacted]');
    expect(JSON.stringify(out)).not.toContain('hunter2');
  });

  it('reduces business content to a size, not a copy', () => {
    const out = redactDetail({ body: 'private customer note' }) as Record<string, string>;
    expect(out.body).toBe('[21 chars]');
  });

  it('keeps ids and short values intact so rows stay investigable', () => {
    expect(redactDetail({ id: ID, stage: 'WON' })).toEqual({ id: ID, stage: 'WON' });
  });

  it('truncates long strings to their length', () => {
    expect(redactDetail({ q: 'x'.repeat(500) })).toEqual({ q: '[500 chars]' });
  });

  it('caps arrays and deep nesting', () => {
    const long = redactDetail({ xs: Array.from({ length: 30 }, (_, i) => i) }) as {
      xs: unknown[];
    };
    expect(long.xs).toHaveLength(21);
    expect(long.xs[20]).toBe('[+10 more]');
    expect(redactDetail({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({
      a: { b: { c: { d: '[deep]' } } },
    });
  });

  it('passes null through', () => {
    expect(redactDetail(null)).toBeNull();
  });
});

describe('buildAuditRecord', () => {
  const context = {
    actor: {
      workspaceMemberId: ID,
      name: 'راشد',
      email: 'r@example.com',
      role: 'admin',
    },
    sessionId: 'sess-1',
    device: 'iPhone',
    now: new Date('2026-09-07T10:00:00.000Z'),
  };

  it('denormalizes the actor so the row survives the member being deleted', () => {
    const record = buildAuditRecord(
      { eventType: 'screen.view', category: 'navigation', route: '/leads' },
      context,
    );
    expect(record).toMatchObject({
      occurredAt: '2026-09-07T10:00:00.000Z',
      actorName: 'راشد',
      actorEmail: 'r@example.com',
      actorRole: 'admin',
      severity: 'info',
      sessionId: 'sess-1',
      device: 'iPhone',
    });
  });

  it('still logs when nobody is signed in, and says so', () => {
    const record = buildAuditRecord(
      { eventType: 'auth.failed', category: 'auth' },
      { ...context, actor: null },
    );
    expect(record.actorMemberId).toBeNull();
    expect(record.actorRole).toBe('anonymous');
    expect(record.severity).toBe('sensitive');
    // The server stamps this row with whoever eventually flushes it, so the
    // row has to carry the fact that its actor is not who did the thing.
    expect(JSON.parse(record.detail ?? '{}')).toMatchObject({
      recordedBeforeSignIn: true,
    });
  });

  it('does not mark a signed-in event as pre-sign-in', () => {
    const record = buildAuditRecord(
      { eventType: 'screen.view', category: 'navigation' },
      context,
    );
    expect(record.detail).toBeNull();
  });

  it('keeps a short error reason readable but collapses a long one', () => {
    const short = buildAuditRecord(
      { eventType: 'auth.failed', category: 'auth', detail: { reason: 'Wrong password' } },
      context,
    );
    expect(JSON.parse(short.detail ?? '{}').reason).toBe('Wrong password');

    const long = buildAuditRecord(
      { eventType: 'api.error', category: 'read', detail: { reason: 'x'.repeat(400) } },
      context,
    );
    expect(JSON.parse(long.detail ?? '{}').reason).toBe('[400 chars]');
  });

  it('serializes redacted detail, not raw detail', () => {
    const record = buildAuditRecord(
      { eventType: 'auth.failed', category: 'auth', detail: { password: 'hunter2' } },
      { ...context, actor: null },
    );
    expect(JSON.parse(record.detail ?? '{}').password).toBe('[redacted]');
    expect(record.detail).not.toContain('hunter2');
  });

  it('lets an explicit severity override the category default', () => {
    const record = buildAuditRecord(
      { eventType: 'screen.view', category: 'navigation', severity: 'critical' },
      context,
    );
    expect(record.severity).toBe('critical');
  });
});

describe('dedupeKeyOf', () => {
  const base = {
    eventType: 'record.read',
    category: 'read' as const,
    severity: 'sensitive' as const,
    actorMemberId: ID,
    actorName: 'x',
    actorEmail: 'x',
    actorRole: 'admin',
    targetType: 'lead',
    targetId: ID,
    targetLabel: null,
    route: '/lead/1',
    detail: null,
    sessionId: 's',
    device: null,
    occurredAt: '2026-09-07T10:00:00.000Z',
  };

  it('treats the same read of the same record on the same screen as one fact', () => {
    expect(dedupeKeyOf(base)).toBe(
      dedupeKeyOf({ ...base, occurredAt: '2026-09-07T10:00:01.000Z' }),
    );
  });

  it('separates different records', () => {
    expect(dedupeKeyOf(base)).not.toBe(dedupeKeyOf({ ...base, targetId: 'other' }));
  });
});

describe('isWatermarkedSection', () => {
  it('marks the screens that show customer data or money', () => {
    for (const section of ['lead', 'leads', 'contacts', 'reports', 'audit']) {
      expect(isWatermarkedSection(section)).toBe(true);
    }
  });

  it('leaves the ordinary working screens clean', () => {
    for (const section of ['today', 'tasks', 'calendar', 'new', undefined]) {
      expect(isWatermarkedSection(section)).toBe(false);
    }
  });
});

import {
  clientIpFrom,
  isMissingAuditObjectError,
  MAX_EVENTS_PER_REQUEST,
  sanitizeAuditEvent,
  sanitizeAuditEvents,
} from 'src/modules/sales-crm/audit-log/utils/sanitize-audit-event.util';

const NOW = new Date('2026-09-07T10:00:00.000Z');

describe('sanitizeAuditEvent', () => {
  it('keeps a well-formed event', () => {
    expect(
      sanitizeAuditEvent(
        {
          occurredAt: '2026-09-07T09:59:00.000Z',
          eventType: 'record.read',
          category: 'read',
          severity: 'sensitive',
          targetType: 'lead',
          targetId: 'abc',
          route: '/leads',
          detail: '{"operation":"MyLeads"}',
          sessionId: 's1',
          device: 'Safari/iOS 390x844',
        },
        NOW,
      ),
    ).toEqual({
      occurredAt: new Date('2026-09-07T09:59:00.000Z'),
      eventType: 'record.read',
      category: 'read',
      severity: 'sensitive',
      targetType: 'lead',
      targetId: 'abc',
      targetLabel: null,
      route: '/leads',
      detail: '{"operation":"MyLeads"}',
      sessionId: 's1',
      device: 'Safari/iOS 390x844',
    });
  });

  it('drops an event with no type, which nobody could review', () => {
    expect(sanitizeAuditEvent({ category: 'read' }, NOW)).toBeNull();
    expect(sanitizeAuditEvent({ eventType: '   ' }, NOW)).toBeNull();
  });

  it('will not let a client bury an event under an unknown severity', () => {
    expect(
      sanitizeAuditEvent({ eventType: 'x', severity: 'trivial' }, NOW)
        ?.severity,
    ).toBe('critical');
    expect(
      sanitizeAuditEvent({ eventType: 'x', category: 'harmless' }, NOW)
        ?.category,
    ).toBe('security');
  });

  it('replaces a wildly wrong client clock with the server time', () => {
    expect(
      sanitizeAuditEvent(
        { eventType: 'x', occurredAt: '1970-01-01T00:00:00Z' },
        NOW,
      )?.occurredAt,
    ).toEqual(NOW);
    expect(
      sanitizeAuditEvent({ eventType: 'x', occurredAt: 'not a date' }, NOW)
        ?.occurredAt,
    ).toEqual(NOW);
    expect(
      sanitizeAuditEvent({ eventType: 'x', occurredAt: 12345 }, NOW)
        ?.occurredAt,
    ).toEqual(NOW);
  });

  it('keeps a small clock difference so the reviewer can see it', () => {
    const drifted = '2026-09-07T09:30:00.000Z';

    expect(
      sanitizeAuditEvent({ eventType: 'x', occurredAt: drifted }, NOW)
        ?.occurredAt,
    ).toEqual(new Date(drifted));
  });

  it('clamps oversized strings so the log cannot be used to fill the disk', () => {
    const event = sanitizeAuditEvent(
      { eventType: 'x'.repeat(500), detail: 'y'.repeat(9000) },
      NOW,
    );

    expect(event?.eventType).toHaveLength(80);
    expect(event?.detail).toHaveLength(2000);
  });

  it('turns non-strings and blanks into null rather than storing them', () => {
    const event = sanitizeAuditEvent(
      { eventType: 'x', targetId: { evil: true }, route: '', device: 42 },
      NOW,
    );

    expect(event?.targetId).toBeNull();
    expect(event?.route).toBeNull();
    expect(event?.device).toBeNull();
  });
});

describe('sanitizeAuditEvents', () => {
  it('caps how many events one request can file', () => {
    const many = Array.from({ length: 120 }, () => ({ eventType: 'x' }));

    expect(sanitizeAuditEvents(many, NOW)).toHaveLength(MAX_EVENTS_PER_REQUEST);
  });

  it('keeps the good events in a batch that also contains junk', () => {
    expect(
      sanitizeAuditEvents(
        [{ eventType: 'a' }, null, {}, { eventType: 'b' }],
        NOW,
      ),
    ).toHaveLength(2);
  });

  it('returns nothing for a non-array body', () => {
    expect(sanitizeAuditEvents({ eventType: 'x' }, NOW)).toEqual([]);
    expect(sanitizeAuditEvents(undefined, NOW)).toEqual([]);
  });
});

describe('clientIpFrom', () => {
  it('prefers the original client from the proxy chain', () => {
    expect(
      clientIpFrom({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }, '10.0.0.1'),
    ).toBe('203.0.113.7');
  });

  it('handles a repeated header', () => {
    expect(
      clientIpFrom({ 'x-forwarded-for': ['198.51.100.4'] }, '10.0.0.1'),
    ).toBe('198.51.100.4');
  });

  it('falls back to the socket address', () => {
    expect(clientIpFrom({}, '192.0.2.9')).toBe('192.0.2.9');
    expect(clientIpFrom({ 'x-forwarded-for': '  ' }, '192.0.2.9')).toBe(
      '192.0.2.9',
    );
  });

  it('is null when there is nothing to record', () => {
    expect(clientIpFrom({}, undefined)).toBeNull();
  });
});

describe('isMissingAuditObjectError', () => {
  it('recognizes a workspace that never provisioned the object', () => {
    expect(
      isMissingAuditObjectError(
        new Error(
          'Object metadata for object "auditEvent" is missing in workspace "abc" with object metadata collection length: 29',
        ),
      ),
    ).toBe(true);
  });

  it('recognizes the raw table being absent', () => {
    expect(
      isMissingAuditObjectError(
        new Error('relation "workspace_x.audit_event" does not exist'),
      ),
    ).toBe(true);
  });

  it('does not swallow an unrelated failure', () => {
    // These must keep throwing: a connection drop or a permission problem is
    // a real incident, not a workspace to skip.
    expect(isMissingAuditObjectError(new Error('connection terminated'))).toBe(
      false,
    );
    expect(isMissingAuditObjectError(new Error('permission denied'))).toBe(
      false,
    );
    expect(
      isMissingAuditObjectError(
        new Error('Object metadata for object "opportunity" is missing'),
      ),
    ).toBe(false);
  });
});

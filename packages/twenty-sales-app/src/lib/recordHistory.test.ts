import { describe, expect, it } from 'vitest';

import {
  type ActivityRow,
  type AuditEntry,
  humanizeActivity,
  mergeAuditEntries,
  parseActivityName,
  toAuditEntries,
} from './recordHistory';

describe('parseActivityName', () => {
  it('splits an object event into its object and action', () => {
    expect(parseActivityName('opportunity.updated')).toEqual({
      objectName: 'opportunity',
      action: 'updated',
    });
  });

  it('reads the linked-activity events the server writes for notes and tasks', () => {
    expect(parseActivityName('linked-note.created')).toEqual({
      objectName: 'note',
      action: 'created',
    });
  });

  it('returns null for an event shape it does not understand', () => {
    expect(parseActivityName('message.linked')).toBeNull();
    expect(parseActivityName('')).toBeNull();
  });
});

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: 'a1',
  name: 'opportunity.updated',
  happensAt: '2026-03-01T10:00:00.000Z',
  properties: {},
  workspaceMember: null,
  linkedRecordCachedName: null,
  ...over,
});

describe('humanizeActivity', () => {
  it('names the field, the old value and the new one', () => {
    const entry = humanizeActivity(
      row({ properties: { diff: { stage: { before: 'NEW_LEAD', after: 'DEMO_SCHEDULED' } } } }),
    );

    expect(entry?.changes).toEqual([
      { field: 'stage', label: 'مرحله', before: 'لید جدید', after: 'دمو تعیین شده' },
    ]);
  });

  it('credits the person who made the change', () => {
    const entry = humanizeActivity(
      row({
        workspaceMember: { name: { firstName: 'راشد', lastName: 'احمدی' } },
        properties: { diff: { name: { before: 'الف', after: 'ب' } } },
      }),
    );

    expect(entry?.actor).toBe('راشد احمدی');
  });

  it('falls back to a system actor when no member is attached', () => {
    const entry = humanizeActivity(
      row({ properties: { diff: { name: { before: 'الف', after: 'ب' } } } }),
    );

    expect(entry?.actor).toBe('سیستم');
  });

  // The server stamps updatedBy on every write, so an unfiltered log shows a
  // row for changes nobody made. Those rows carry no information a seller can
  // act on and would bury the ones that do.
  it('drops an update whose only change is the server-side bookkeeping', () => {
    expect(
      humanizeActivity(
        row({
          properties: {
            diff: {
              updatedBy: {
                before: { name: 'Tim Apple', source: 'MANUAL' },
                after: { name: 'Standard', source: 'APPLICATION' },
              },
            },
          },
        }),
      ),
    ).toBeNull();
  });

  it('keeps the real change when bookkeeping rides alongside it', () => {
    const entry = humanizeActivity(
      row({
        properties: {
          diff: {
            updatedBy: { before: { name: 'a' }, after: { name: 'b' } },
            temperature: { before: 'COLD', after: 'HOT' },
          },
        },
      }),
    );

    expect(entry?.changes.map((c) => c.field)).toEqual(['temperature']);
  });

  // A rich-text diff is a wall of BlockNote JSON. Printing it would make the
  // log unreadable; that the text changed is the whole useful signal.
  it('summarises a rich-text change instead of printing its JSON', () => {
    const entry = humanizeActivity(
      row({
        name: 'task.updated',
        properties: {
          diff: {
            bodyV2: {
              before: { markdown: '', blocknote: null },
              after: { markdown: 'سلام', blocknote: '[{"id":"x"}]' },
            },
          },
        },
      }),
    );

    expect(entry?.changes[0]?.after).toBe('متن تغییر کرد');
    expect(JSON.stringify(entry)).not.toContain('blocknote');
  });

  it('formats money the way the rest of the app does', () => {
    const entry = humanizeActivity(
      row({
        properties: {
          diff: {
            amount: {
              before: null,
              after: { amountMicros: 300000000000, currencyCode: 'AFN' },
            },
          },
        },
      }),
    );

    expect(entry?.changes[0]?.after).toContain('۳۰۰\u066c۰۰۰');
    expect(entry?.changes[0]?.before).toBe('—');
  });

  it('renders a creation without pretending fields changed', () => {
    const entry = humanizeActivity(row({ name: 'opportunity.created', properties: {} }));

    expect(entry?.action).toBe('created');
    expect(entry?.changes).toEqual([]);
  });

  it('keeps a deletion even though it carries an empty diff', () => {
    const entry = humanizeActivity(
      row({ name: 'opportunity.deleted', properties: { diff: {} } }),
    );

    expect(entry?.action).toBe('deleted');
  });

  it('names the note or task a linked-activity row points at', () => {
    const entry = humanizeActivity(
      row({ name: 'linked-note.created', linkedRecordCachedName: 'جلسه با مدیر' }),
    );

    expect(entry?.subject).toBe('جلسه با مدیر');
  });
});

describe('toAuditEntries', () => {
  it('drops the rows that humanize to nothing and keeps newest first', () => {
    const entries = toAuditEntries([
      row({ id: 'old', happensAt: '2026-01-01T00:00:00.000Z', properties: { diff: { stage: { before: 'A', after: 'B' } } } }),
      row({ id: 'noise', properties: { diff: { updatedBy: { before: 1, after: 2 } } } }),
      row({ id: 'new', happensAt: '2026-05-01T00:00:00.000Z', properties: { diff: { stage: { before: 'B', after: 'C' } } } }),
    ]);

    expect(entries.map((e) => e.id)).toEqual(['new', 'old']);
  });
});

describe('mergeAuditEntries', () => {
  const entry = (id: string, at: string): AuditEntry => ({
    id,
    at,
    action: 'updated',
    objectName: 'opportunity',
    actor: 'x',
    subject: null,
    changes: [],
  });

  it('interleaves several records\' logs newest first', () => {
    const lead = [entry('l2', '2026-05-01T00:00:00.000Z'), entry('l1', '2026-01-01T00:00:00.000Z')];
    const company = [entry('c1', '2026-03-01T00:00:00.000Z')];

    expect(mergeAuditEntries([lead, company], 60).map((e) => e.id)).toEqual([
      'l2',
      'c1',
      'l1',
    ]);
  });

  it('dedupes a row that appears in two streams (linked note on lead + its own)', () => {
    const shared = entry('shared', '2026-04-01T00:00:00.000Z');
    const merged = mergeAuditEntries([[shared], [shared]], 60);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('shared');
  });

  it('caps the merged log to the limit', () => {
    const stream = Array.from({ length: 5 }, (_, i) =>
      entry(`e${i}`, `2026-0${i + 1}-01T00:00:00.000Z`),
    );

    expect(mergeAuditEntries([stream], 2).map((e) => e.id)).toEqual(['e4', 'e3']);
  });
});

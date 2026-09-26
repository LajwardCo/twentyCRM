import { type FormDefinition, createEmptyFormDefinition } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { PALETTE_GROUPS, createPaletteItem, findPaletteEntry, glyphFor, itemText } from './palette';

describe('builder palette', () => {
  it('should offer every question type exactly once', () => {
    const types = PALETTE_GROUPS.flatMap((group) =>
      group.entries.flatMap((entry) => (entry.kind === 'question' ? [entry.type] : [])),
    );

    expect(new Set(types).size).toBe(types.length);
    expect(types).toHaveLength(22);
  });

  it('should keep CRM pickers in the staff-only group and force their audience', () => {
    const staff = PALETTE_GROUPS.find((group) => group.key === 'staff');

    expect(staff?.entries.map((entry) => entry.key)).toEqual(['crm_company', 'crm_contact', 'crm_lead']);

    for (const entry of staff?.entries ?? []) {
      const item = createPaletteItem(entry, 'fa');

      expect(item.kind === 'question' && item.audience).toBe('STAFF_ONLY');
    }
  });

  it('should create blocks and sections with fresh ids', () => {
    const section = createPaletteItem(findPaletteEntry('section')!, 'fa');
    const divider = createPaletteItem(findPaletteEntry('divider')!, 'fa');

    expect(section).toMatchObject({ kind: 'section' });
    expect(section.id).toMatch(/^s_/);
    expect(divider).toMatchObject({ kind: 'divider' });
    expect(divider.id).toMatch(/^b_/);
    expect(glyphFor(section)).toBe('§');
  });

  it('should show the default-language text of an item', () => {
    const definition: FormDefinition = { ...createEmptyFormDefinition('fa'), languages: ['fa', 'en'] };
    const question = createPaletteItem(findPaletteEntry('short_text')!, 'en');

    expect(itemText({ ...question, label: { en: 'Name' } } as typeof question, definition)).toBe('Name');
    expect(itemText({ ...question, label: { fa: 'نام', en: 'Name' } } as typeof question, definition)).toBe('نام');
  });
});

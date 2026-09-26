import { validateForPublish } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { buildFixtureDefinition, itemIds } from './builderFixtures';
import {
  addPage,
  canMoveItem,
  completeDefinition,
  duplicateItem,
  duplicatePage,
  locateItem,
  moveItemBy,
  moveItemTo,
  movePage,
  removeItem,
  removePage,
  updateItem,
} from './definitionOps';

describe('definition edits', () => {
  it('should not mutate the original definition', () => {
    const definition = buildFixtureDefinition();
    const snapshot = JSON.stringify(definition);

    moveItemBy(definition, 'q2', -1);
    removePage(definition, 'p2');
    updateItem(definition, 'q1', (item) => ({ ...item, id: 'changed' }));

    expect(JSON.stringify(definition)).toBe(snapshot);
  });

  it('should move an item up and down within its page', () => {
    const definition = buildFixtureDefinition();

    expect(itemIds(moveItemBy(definition, 'q2', -1))[0]).toEqual(['q1', 'q2', 's1']);
    expect(itemIds(moveItemBy(definition, 'q1', 1))[0]).toEqual(['s1', 'q1', 'q2']);
  });

  it('should cross into the neighbouring page at a page edge', () => {
    const definition = buildFixtureDefinition();

    expect(itemIds(moveItemBy(definition, 'q3', -1))).toEqual([
      ['q1', 's1', 'q2', 'q3'],
      ['q4'],
      ['q5'],
    ]);
    expect(itemIds(moveItemBy(definition, 'q2', 1))).toEqual([
      ['q1', 's1'],
      ['q2', 'q3', 'q4'],
      ['q5'],
    ]);
  });

  it('should refuse to move past the first or last position', () => {
    const definition = buildFixtureDefinition();

    expect(canMoveItem(definition, 'q1', -1)).toBe(false);
    expect(canMoveItem(definition, 'q5', 1)).toBe(false);
    expect(moveItemBy(definition, 'q1', -1)).toBe(definition);
    expect(canMoveItem(definition, 'q5', -1)).toBe(true);
  });

  it('should move an item to another page at a given index', () => {
    const definition = buildFixtureDefinition();

    expect(itemIds(moveItemTo(definition, 'q1', 'p2', 1))).toEqual([
      ['s1', 'q2'],
      ['q3', 'q1', 'q4'],
      ['q5'],
    ]);
    expect(itemIds(moveItemTo(definition, 'q1', 'p3'))[2]).toEqual(['q5', 'q1']);
    expect(moveItemTo(definition, 'q1', 'missing')).toBe(definition);
  });

  it('should duplicate an item right below it with fresh ids and no rules', () => {
    const definition = buildFixtureDefinition();
    const { definition: next, newId } = duplicateItem(definition, 'q3');
    const copy = locateItem(next, newId ?? '');

    expect(newId).not.toBe('q3');
    expect(itemIds(next)[1]).toEqual(['q3', newId, 'q4']);
    expect(copy?.item.kind === 'question' && copy.item.visibleWhen).toBeUndefined();
  });

  it('should remove an item', () => {
    expect(itemIds(removeItem(buildFixtureDefinition(), 's1'))[0]).toEqual(['q1', 'q2']);
  });

  it('should add a page after a given page', () => {
    const { definition, pageId } = addPage(buildFixtureDefinition(), 'fa', 'p1');

    expect(definition.pages.map((page) => page.id)).toEqual(['p1', pageId, 'p2', 'p3']);
    expect(pageId).toMatch(/^p_/);
  });

  it('should duplicate a page with fresh ids for the page, items and choices', () => {
    const original = buildFixtureDefinition();
    const { definition, pageId } = duplicatePage(original, 'p1');
    const copy = definition.pages[1];
    const originalIds = new Set(
      original.pages.flatMap((page) => [
        page.id,
        ...page.items.map((item) => item.id),
        ...page.items.flatMap((item) =>
          item.kind === 'question' ? (item.config.choices ?? []).map((choice) => choice.id) : [],
        ),
      ]),
    );
    const copyIds = [
      copy.id,
      ...copy.items.map((item) => item.id),
      ...copy.items.flatMap((item) =>
        item.kind === 'question' ? (item.config.choices ?? []).map((choice) => choice.id) : [],
      ),
    ];

    expect(copy.id).toBe(pageId);
    expect(copy.items).toHaveLength(3);
    expect(copy.jumps).toEqual([]);
    expect(copyIds.some((id) => originalIds.has(id))).toBe(false);
    expect(
      validateForPublish(definition).errors.filter((issue) => issue.code === 'DUPLICATE_ID'),
    ).toEqual([]);
  });

  it('should remove a page and the jumps that targeted it, keeping at least one page', () => {
    const definition = removePage(buildFixtureDefinition(), 'p3');

    expect(definition.pages.map((page) => page.id)).toEqual(['p1', 'p2']);
    expect(definition.pages[0].jumps).toEqual([]);

    const single = { ...definition, pages: [definition.pages[0]] };

    expect(removePage(single, 'p1')).toBe(single);
  });

  it('should reorder pages', () => {
    const definition = buildFixtureDefinition();

    expect(movePage(definition, 'p2', -1).pages.map((page) => page.id)).toEqual(['p2', 'p1', 'p3']);
    expect(movePage(definition, 'p3', 1)).toBe(definition);
  });
});

describe('completeDefinition', () => {
  it('should fill in missing top-level parts without touching the rest', () => {
    const partial = { ...buildFixtureDefinition(), print: undefined, welcome: undefined } as unknown as Parameters<
      typeof completeDefinition
    >[0];
    const complete = completeDefinition(partial);

    expect(complete.print).toEqual({ instructions: {} });
    expect(complete.welcome.enabled).toBe(false);
    expect(complete.pages.map((page) => page.id)).toEqual(['p1', 'p2', 'p3']);
    expect(completeDefinition(null).pages).toHaveLength(1);
  });
});

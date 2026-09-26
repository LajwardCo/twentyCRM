import {
  type FormDefinition,
  type FormItem,
  type FormLanguage,
  type FormPage,
  createEmptyFormDefinition,
  duplicateFormItem,
  generateSurveyId,
} from '@shared/surveys';

// Immutable edits of a form definition used by the builder. Every function
// returns a new definition and leaves its input untouched, so autosave can
// compare snapshots by identity.

export type ItemLocation = {
  page: FormPage;
  pageIndex: number;
  item: FormItem;
  itemIndex: number;
};

export const locateItem = (
  definition: FormDefinition,
  itemId: string,
): ItemLocation | null => {
  for (const [pageIndex, page] of definition.pages.entries()) {
    const itemIndex = page.items.findIndex((item) => item.id === itemId);

    if (itemIndex >= 0) {
      return { page, pageIndex, item: page.items[itemIndex], itemIndex };
    }
  }

  return null;
};

export const updatePage = (
  definition: FormDefinition,
  pageId: string,
  updater: (page: FormPage) => FormPage,
): FormDefinition => ({
  ...definition,
  pages: definition.pages.map((page) => (page.id === pageId ? updater(page) : page)),
});

export const updateItem = (
  definition: FormDefinition,
  itemId: string,
  updater: (item: FormItem) => FormItem,
): FormDefinition => ({
  ...definition,
  pages: definition.pages.map((page) =>
    page.items.some((item) => item.id === itemId)
      ? {
          ...page,
          items: page.items.map((item) => (item.id === itemId ? updater(item) : item)),
        }
      : page,
  ),
});

export const insertItem = (
  definition: FormDefinition,
  pageId: string,
  item: FormItem,
  index?: number,
): FormDefinition =>
  updatePage(definition, pageId, (page) => {
    const items = [...page.items];
    const at = index === undefined ? items.length : Math.max(0, Math.min(index, items.length));

    items.splice(at, 0, item);

    return { ...page, items };
  });

export const removeItem = (
  definition: FormDefinition,
  itemId: string,
): FormDefinition => ({
  ...definition,
  pages: definition.pages.map((page) =>
    page.items.some((item) => item.id === itemId)
      ? { ...page, items: page.items.filter((item) => item.id !== itemId) }
      : page,
  ),
});

// The copy lands right below the original.
export const duplicateItem = (
  definition: FormDefinition,
  itemId: string,
): { definition: FormDefinition; newId: string | null } => {
  const location = locateItem(definition, itemId);

  if (location === null) return { definition, newId: null };

  const copy = duplicateFormItem(location.item);

  return {
    definition: insertItem(definition, location.page.id, copy, location.itemIndex + 1),
    newId: copy.id,
  };
};

// Places an item on a page at an index, wherever it currently is. The index
// is interpreted against the target page *without* the moved item.
export const moveItemTo = (
  definition: FormDefinition,
  itemId: string,
  targetPageId: string,
  targetIndex?: number,
): FormDefinition => {
  const location = locateItem(definition, itemId);

  if (location === null) return definition;
  if (!definition.pages.some((page) => page.id === targetPageId)) return definition;

  return insertItem(removeItem(definition, itemId), targetPageId, location.item, targetIndex);
};

// ↑/↓ reordering. At a page edge the item crosses into the neighbouring page,
// so keyboard users can reach every position without drag-and-drop.
export const canMoveItem = (
  definition: FormDefinition,
  itemId: string,
  delta: -1 | 1,
): boolean => {
  const location = locateItem(definition, itemId);

  if (location === null) return false;

  if (delta === -1) {
    return location.itemIndex > 0 || location.pageIndex > 0;
  }

  return (
    location.itemIndex < location.page.items.length - 1 ||
    location.pageIndex < definition.pages.length - 1
  );
};

export const moveItemBy = (
  definition: FormDefinition,
  itemId: string,
  delta: -1 | 1,
): FormDefinition => {
  const location = locateItem(definition, itemId);

  if (location === null || !canMoveItem(definition, itemId, delta)) return definition;

  const { page, pageIndex, itemIndex } = location;
  const targetIndex = itemIndex + delta;

  if (targetIndex >= 0 && targetIndex < page.items.length) {
    return moveItemTo(definition, itemId, page.id, targetIndex);
  }

  const neighbour = definition.pages[pageIndex + delta];

  return moveItemTo(
    definition,
    itemId,
    neighbour.id,
    delta === -1 ? neighbour.items.length : 0,
  );
};

export const createPage = (language: FormLanguage, title = ''): FormPage => ({
  id: generateSurveyId('p'),
  title: title === '' ? {} : { [language]: title },
  items: [],
  jumps: [],
});

export const addPage = (
  definition: FormDefinition,
  language: FormLanguage,
  afterPageId?: string,
): { definition: FormDefinition; pageId: string } => {
  const page = createPage(language);
  const pages = [...definition.pages];
  const afterIndex =
    afterPageId === undefined
      ? pages.length - 1
      : pages.findIndex((candidate) => candidate.id === afterPageId);

  pages.splice(afterIndex + 1, 0, page);

  return { definition: { ...definition, pages }, pageId: page.id };
};

// Fresh ids for the page and everything on it. Jump rules are not copied:
// the same rules on two pages would silently double the branching.
export const duplicatePage = (
  definition: FormDefinition,
  pageId: string,
): { definition: FormDefinition; pageId: string | null } => {
  const index = definition.pages.findIndex((page) => page.id === pageId);

  if (index < 0) return { definition, pageId: null };

  const original = definition.pages[index];
  const copy: FormPage = {
    ...JSON.parse(JSON.stringify(original)),
    id: generateSurveyId('p'),
    items: original.items.map((item) => duplicateFormItem(item)),
    jumps: [],
  };
  const pages = [...definition.pages];

  pages.splice(index + 1, 0, copy);

  return { definition: { ...definition, pages }, pageId: copy.id };
};

// Jumps that target the removed page would point nowhere, so they go too.
// A form always keeps at least one page.
export const removePage = (
  definition: FormDefinition,
  pageId: string,
): FormDefinition => {
  if (definition.pages.length <= 1) return definition;

  return {
    ...definition,
    pages: definition.pages
      .filter((page) => page.id !== pageId)
      .map((page) => ({
        ...page,
        jumps: page.jumps.filter(
          (jump) => !('pageId' in jump.to) || jump.to.pageId !== pageId,
        ),
      })),
  };
};

export const movePage = (
  definition: FormDefinition,
  pageId: string,
  delta: -1 | 1,
): FormDefinition => {
  const index = definition.pages.findIndex((page) => page.id === pageId);
  const target = index + delta;

  if (index < 0 || target < 0 || target >= definition.pages.length) return definition;

  const pages = [...definition.pages];
  const [page] = pages.splice(index, 1);

  pages.splice(target, 0, page);

  return { ...definition, pages };
};

// Drafts written by older builds (or by hand through the API) may lack newer
// top-level parts; the editor always works on a complete shape.
export const completeDefinition = (raw: FormDefinition | null | undefined): FormDefinition => {
  const empty = createEmptyFormDefinition(raw?.languages?.[0] ?? 'fa');

  if (raw === null || raw === undefined || typeof raw !== 'object') return empty;

  return {
    ...empty,
    ...raw,
    languages: Array.isArray(raw.languages) && raw.languages.length > 0 ? raw.languages : empty.languages,
    welcome: { ...empty.welcome, ...(raw.welcome ?? {}) },
    pages:
      Array.isArray(raw.pages) && raw.pages.length > 0
        ? raw.pages.map((page) => ({ ...page, items: page.items ?? [], jumps: page.jumps ?? [] }))
        : empty.pages,
    endings: Array.isArray(raw.endings) ? raw.endings : empty.endings,
    appearance: { ...empty.appearance, ...(raw.appearance ?? {}) },
    print: { ...empty.print, ...(raw.print ?? {}) },
    crmMapping: Array.isArray(raw.crmMapping) ? raw.crmMapping : [],
    automations: Array.isArray(raw.automations) ? raw.automations : [],
  };
};

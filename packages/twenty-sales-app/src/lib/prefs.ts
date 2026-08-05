// Persisted UI preferences — theme, list view options, form drafts.
// Sellers get their workspace back exactly as they left it.

const PREFS_KEY = 'salesAppPrefs';

export type Prefs = {
  theme: 'light' | 'dark' | null; // null = follow system
  leadsView: 'table' | 'kanban';
  mineOnly: boolean;
  openOnly: boolean;
  leadsSort: 'created' | 'value' | 'name';
  deepSearch: boolean;
  // Encoded filter query per list screen ("leads" -> "stage=NEW_LEAD"), so a
  // screen reopens filtered the way the seller left it. Stored encoded rather
  // than as objects: it is the same string the URL carries, and a stale shape
  // from an older build decodes to "no filter" instead of throwing.
  filters: Record<string, string>;
};

const DEFAULTS: Prefs = {
  theme: null,
  leadsView: 'table',
  mineOnly: true,
  openOnly: true,
  leadsSort: 'created',
  deepSearch: false,
  filters: {},
};

export const loadPrefs = (): Prefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
};

export const savePref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
  const prefs = loadPrefs();
  prefs[key] = value;
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
};

export const resolveTheme = (pref: Prefs['theme']): 'light' | 'dark' => {
  if (pref) return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
};

export const applyTheme = (theme: 'light' | 'dark') => {
  document.documentElement.dataset.theme = theme;
};

// ---- new-lead draft persistence ----

const DRAFT_KEY = 'salesAppLeadDraft';

export const saveDraft = (draft: Record<string, unknown>) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
};

export const loadDraft = <T>(): T | null => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const clearDraft = () => {
  localStorage.removeItem(DRAFT_KEY);
};

import { useEffect, useState } from 'react';

// Workspace dock: sellers juggle several leads/tasks at once, so any page can
// be minimized into a footer bar (like a taskbar) and restored with one click.
// Persisted per browser so the working set survives reloads.

export type DockKind = 'lead' | 'task' | 'new' | 'page' | 'search';

export type DockItem = {
  route: string; // hash route without '#', e.g. "/lead/<id>"
  kind: DockKind;
  label: string;
};

const DOCK_KEY = 'salesAppDock';
const MAX_ITEMS = 8;

const load = (): DockItem[] => {
  try {
    const raw = localStorage.getItem(DOCK_KEY);
    return raw ? (JSON.parse(raw) as DockItem[]) : [];
  } catch {
    return [];
  }
};

let items: DockItem[] = load();
const listeners = new Set<() => void>();

const persist = () => {
  localStorage.setItem(DOCK_KEY, JSON.stringify(items));
  listeners.forEach((fn) => fn());
};

export const dockAdd = (item: DockItem) => {
  // append newest at the end (rightmost, like browser tabs); drop the oldest
  items = [...items.filter((i) => i.route !== item.route), item].slice(
    -MAX_ITEMS,
  );
  persist();
};

export const dockRemove = (route: string) => {
  items = items.filter((i) => i.route !== route);
  persist();
};

export const useDock = (): DockItem[] => {
  const [value, setValue] = useState(items);
  useEffect(() => {
    const onChange = () => setValue(items);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return value;
};

// Each view announces what "minimizing this page" should be called; the
// shell's minimize button reads the latest announcement.
let currentPage: { label: string; kind: DockKind } | null = null;

export const announceDockablePage = (label: string, kind: DockKind) => {
  currentPage = { label, kind };
};

export const clearDockablePage = () => {
  currentPage = null;
};

export const getDockablePage = () => currentPage;

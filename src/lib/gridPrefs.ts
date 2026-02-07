export type GridPrefs = {
  order: string[];
  hidden: string[];
  autoAddRows: boolean;
  widths: Record<string, number>;
};

export type SavedView = {
  name: string;
  searchQuery: string;
  order: string[];
  hidden: string[];
  autoAddRows: boolean;
  widths: Record<string, number>;
};

const defaultPrefs: GridPrefs = {
  order: [],
  hidden: [],
  autoAddRows: true,
  widths: {},
};

export function loadGridPrefs(key: string): GridPrefs {
  if (typeof window === 'undefined') return defaultPrefs;
  const raw = localStorage.getItem(`gridPrefs:${key}`);
  if (!raw) return defaultPrefs;
  try {
    const parsed = JSON.parse(raw) as Partial<GridPrefs>;
    return {
      order: parsed.order ?? [],
      hidden: parsed.hidden ?? [],
      autoAddRows: parsed.autoAddRows ?? true,
      widths: parsed.widths ?? {},
    };
  } catch {
    return defaultPrefs;
  }
}

export function saveGridPrefs(key: string, prefs: GridPrefs) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`gridPrefs:${key}`, JSON.stringify(prefs));
}

export function loadViews(key: string): SavedView[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(`gridViews:${key}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveViews(key: string, views: SavedView[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(`gridViews:${key}`, JSON.stringify(views));
}

export function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

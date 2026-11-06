/**
 * Best results + sound preference, persisted in localStorage.
 *
 * Kept tiny and dependency-free so tests can pass an in-memory store.
 * In a non-browser environment (Vitest in Node) every function is a
 * safe no-op returning the default.
 */

export interface BestResults {
  bestDG: number;
  bestServed: number;
  bestCombo: number;
}

export const BEST_DG_KEY = 'dango-order:best-dg';
export const BEST_SERVED_KEY = 'dango-order:best-served';
export const BEST_COMBO_KEY = 'dango-order:best-combo';
export const MUTED_KEY = 'dango-order:muted';

/** Minimal storage shape (localStorage-compatible). */
export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const memoryStore = (): Store => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
};

/** The real browser store, or an in-memory fallback outside a browser. */
export const defaultStore = (): Store => {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Private mode / restricted environment: fall through to memory.
  }
  return memoryStore();
};

const readNumber = (store: Store, key: string): number => {
  const raw = store.getItem(key);
  const value = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

export const loadBest = (store: Store = defaultStore()): BestResults => ({
  bestDG: readNumber(store, BEST_DG_KEY),
  bestServed: readNumber(store, BEST_SERVED_KEY),
  bestCombo: readNumber(store, BEST_COMBO_KEY),
});

/**
 * Save a run's results. Returns the new bests plus whether any record
 * was broken (used for the NEW RECORD! badge on the result screen).
 */
export const saveBest = (
  dg: number,
  served: number,
  combo: number,
  store: Store = defaultStore(),
): { best: BestResults; isNewRecord: boolean } => {
  const before = loadBest(store);
  const best: BestResults = {
    bestDG: Math.max(before.bestDG, dg),
    bestServed: Math.max(before.bestServed, served),
    bestCombo: Math.max(before.bestCombo, combo),
  };
  store.setItem(BEST_DG_KEY, String(best.bestDG));
  store.setItem(BEST_SERVED_KEY, String(best.bestServed));
  store.setItem(BEST_COMBO_KEY, String(best.bestCombo));
  const isNewRecord =
    dg > before.bestDG ||
    served > before.bestServed ||
    combo > before.bestCombo;
  return { best, isNewRecord };
};

export const loadMuted = (store: Store = defaultStore()): boolean =>
  store.getItem(MUTED_KEY) === '1';

export const saveMuted = (
  muted: boolean,
  store: Store = defaultStore(),
): void => {
  store.setItem(MUTED_KEY, muted ? '1' : '0');
};

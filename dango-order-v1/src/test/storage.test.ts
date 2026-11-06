/**
 * Tests for best-result persistence (src/logic/storage.ts).
 * Uses an in-memory store so the tests run in Node.
 */
import { describe, expect, it } from 'vitest';
import { loadBest, loadMuted, saveBest, saveMuted, type Store } from '../logic/storage';

const freshStore = (): Store => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
};

describe('saveBest / loadBest', () => {
  it('starts empty and records the first run as a record', () => {
    const store = freshStore();
    expect(loadBest(store)).toEqual({ bestDG: 0, bestServed: 0, bestCombo: 0 });
    const { best, isNewRecord } = saveBest(120, 9, 4, store);
    expect(isNewRecord).toBe(true);
    expect(best).toEqual({ bestDG: 120, bestServed: 9, bestCombo: 4 });
    expect(loadBest(store)).toEqual(best);
  });

  it('keeps the best of each value and reports no record when beaten by none', () => {
    const store = freshStore();
    saveBest(120, 9, 4, store);
    const { best, isNewRecord } = saveBest(50, 11, 5, store);
    expect(isNewRecord).toBe(true); // served and combo improved
    expect(best).toEqual({ bestDG: 120, bestServed: 11, bestCombo: 5 });
    const worse = saveBest(10, 1, 1, store);
    expect(worse.isNewRecord).toBe(false);
    expect(worse.best).toEqual({ bestDG: 120, bestServed: 11, bestCombo: 5 });
  });
});

describe('muted preference', () => {
  it('round-trips the mute flag', () => {
    const store = freshStore();
    expect(loadMuted(store)).toBe(false);
    saveMuted(true, store);
    expect(loadMuted(store)).toBe(true);
    saveMuted(false, store);
    expect(loadMuted(store)).toBe(false);
  });
});

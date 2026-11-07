import { describe, expect, it } from 'vitest';
import {
  buildScoreStats,
  toDurationSec,
} from '../systems/ScoreSubmission';

describe('toDurationSec', () => {
  it('rounds milliseconds to whole seconds', () => {
    expect(toDurationSec(0)).toBe(0);
    expect(toDurationSec(61_400)).toBe(61);
    expect(toDurationSec(61_600)).toBe(62);
  });

  it('clamps nonsense to 0', () => {
    expect(toDurationSec(-5)).toBe(0);
    expect(toDurationSec(Number.NaN)).toBe(0);
    expect(toDurationSec(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('buildScoreStats', () => {
  it('carries exactly the four agreed stats — nothing personal', () => {
    const stats = buildScoreStats(
      { served: 14, maxCombo: 6, goldenCount: 2 },
      63,
    );
    expect(stats).toEqual({
      duration_sec: 63,
      orders_served: 14,
      max_combo: 6,
      golden_count: 2,
    });
    expect(Object.keys(stats).sort()).toEqual([
      'duration_sec',
      'golden_count',
      'max_combo',
      'orders_served',
    ]);
  });
});

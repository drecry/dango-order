/**
 * Building the data sent to the ranking API (pure logic, no Phaser).
 *
 * Mirrors Dango Drop's `systems/ScoreSubmission.ts`: what gets sent
 * feeds the server's sanity checks, so it is kept as a pure function
 * the tests can pin down — including that nothing personal is in it.
 *
 * ★Do not add fields casually★ — the set of stored items is a family
 * decision (see dango-leaderboard/docs/api.md).
 */

/** The per-run numbers an Order score is built from. */
export interface OrderRunStats {
  /** Orders served during the shift. */
  served: number;
  /** Best combo reached during the shift. */
  maxCombo: number;
  /** Golden (VIP) orders served during the shift. */
  goldenCount: number;
}

/**
 * Stats sent with a score. Field names line up with what the server's
 * score-rules.json may reference.
 *
 * NOTE: a `type`, not an `interface` — the SDK's PlayStats allows
 * arbitrary keys via an index signature, which interfaces do not get
 * implicitly.
 */
export type ScoreStats = {
  /** Play time in seconds (the server's plausibility yardstick). */
  readonly duration_sec: number;
  readonly orders_served: number;
  readonly max_combo: number;
  readonly golden_count: number;
};

/** Milliseconds → whole seconds, clamped to a sane non-negative int. */
export const toDurationSec = (elapsedMs: number): number => {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return 0;
  }
  return Math.round(elapsedMs / 1000);
};

/** Assemble the stats payload for one finished run. */
export const buildScoreStats = (
  run: OrderRunStats,
  durationSec: number,
): ScoreStats => ({
  duration_sec: durationSec,
  orders_served: run.served,
  max_combo: run.maxCombo,
  golden_count: run.goldenCount,
});

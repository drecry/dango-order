/**
 * Ranking connection settings (one client for the whole game).
 *
 * Mirrors Dango Drop's `systems/LeaderboardClient.ts` — the family
 * leaderboard API (`dango-leaderboard`, Cloudflare Worker + D1) is
 * shared by all DreCry games and tells them apart by `gameId`.
 *
 * ★The game plays fine with no API★
 *   When no URL is configured, `enabled` is false and nothing is ever
 *   sent; personal bests keep living in localStorage.
 *
 * Settings come from .env (Vite environment variables):
 *   VITE_LEADERBOARD_URL=https://dango-leaderboard.xxx.workers.dev
 *   VITE_RANKING_ENABLED=true
 *
 * See dango-leaderboard/docs/integration.md.
 */
import { createLeaderboardClient } from '../leaderboard';
import type { LeaderboardClient } from '../leaderboard';

/** Game identifier (the ranking API separates games by game_id). */
export const GAME_ID = 'dango-order';

/** API base URL. Empty when unconfigured (= ranking disabled). */
const BASE_URL = import.meta.env.VITE_LEADERBOARD_URL ?? '';

/** Ranking is used only when a URL exists and it is not switched off. */
const RANKING_ENABLED =
  BASE_URL.length > 0 && import.meta.env.VITE_RANKING_ENABLED !== 'false';

/** The ranking client singleton, imported by the scenes. */
export const leaderboard: LeaderboardClient = createLeaderboardClient({
  baseUrl: BASE_URL,
  gameId: GAME_ID,
  enabled: RANKING_ENABLED,
});

/** Whether the ranking UI should be drawn at all. */
export const isRankingEnabled = (): boolean => RANKING_ENABLED;

/**
 * クライアントSDK の入口
 * ゲーム側はこのファイルからだけ import すればよい。
 *
 * 使い方の例:
 * ```ts
 * import { createLeaderboardClient } from '@dango/leaderboard-client';
 *
 * const leaderboard = createLeaderboardClient({
 *   baseUrl: 'https://dango-leaderboard.xxx.workers.dev',
 *   gameId: 'dango-drop',
 *   enabled: import.meta.env.VITE_RANKING_ENABLED !== 'false',
 * });
 * ```
 * 詳しくは docs/integration.md を参照。
 */
export { createLeaderboardClient } from './leaderboard';
export type { LeaderboardClient } from './leaderboard';
export { detectPlatform, getIdentity, saveDisplayName, getSavedDisplayName } from './identity';
export { checkDisplayName, MAX_DISPLAY_NAME_LENGTH } from './names';
export type { NameCheckResult } from './names';
export type {
  BoardKind,
  LeaderboardEntry,
  LeaderboardOptions,
  LeaderboardResult,
  MeResult,
  Platform,
  PlayStats,
  PlayerIdentity,
  RankInfo,
  RoomResult,
  SubmitResult,
} from './types';

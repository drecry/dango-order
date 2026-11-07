/**
 * クライアントSDK の型定義
 *
 * サーバー（worker/src/types.ts）と同じ形を持つが、意図的に別定義にしている。
 * SDK は「外部依存ゼロ・軽量」が要件で、ゲームのバンドルに入るため
 * サーバー側のコードを引き込みたくないから。
 * 仕様の正は docs/api.md（食い違ったらそちらに合わせる）。
 */

/** プレイヤーの由来プラットフォーム */
export type Platform = 'itch' | 'crazygames' | 'poki' | 'standalone';

/** ランキングの種類 */
export type BoardKind = 'alltime' | 'weekly' | 'room';

/** ゲームから送るプレイ統計（項目はゲームごとに自由） */
export interface PlayStats {
  duration_sec?: number;
  lines_cleared?: number;
  golden_count?: number;
  short_count?: number;
  long_count?: number;
  [key: string]: number | string | boolean | undefined;
}

/** プレイヤーの識別情報 */
export interface PlayerIdentity {
  /** 端末をまたいでも同じになる ID（プラットフォームが提供すればそれを使う） */
  playerId: string;
  /** 表示名。未設定なら null（名前なしでも遊べる） */
  displayName: string | null;
  /** どこから来たプレイヤーか */
  platform: Platform;
}

/** 順位情報 */
export interface RankInfo {
  rank: number | null;
  total_players: number;
  percentile: number | null;
}

/** ランキング1行 */
export interface LeaderboardEntry {
  rank: number;
  player_id: string;
  display_name: string;
  score: number;
  is_you?: boolean;
}

/** ランキング取得の結果 */
export interface LeaderboardResult {
  /** サーバーから取れたか。false ならランキングは表示できない */
  online: boolean;
  board: BoardKind;
  period_key: string;
  entries: LeaderboardEntry[];
  total_players: number;
}

/**
 * スコア送信の結果
 *
 * ★online が false でも personalBest は必ず入る★
 *   APIが落ちていても「自己ベスト更新！」の演出だけは出せるようにするため、
 *   自己ベストは localStorage にも持っている。
 */
export interface SubmitResult {
  /** サーバーに届いたか */
  online: boolean;
  /** 自己ベストを更新したか */
  isPersonalBest: boolean;
  /** 更新後の自己ベスト（オフライン時は端末内の記録） */
  personalBest: number;
  /** 不正チェックに触れたか（オフライン時は false） */
  flagged: boolean;
  /** 全期間の順位。オフライン時は null */
  alltime: RankInfo | null;
  /** 今週の順位。オフライン時は null */
  weekly: RankInfo | null;
}

/** 自分の記録 */
export interface MeResult {
  online: boolean;
  personalBest: number;
  weeklyBest: number;
  playCount: number;
  alltime: RankInfo | null;
  weekly: RankInfo | null;
}

/** ルーム作成の結果 */
export interface RoomResult {
  online: boolean;
  roomCode: string | null;
  label: string | null;
}

/** SDK の設定 */
export interface LeaderboardOptions {
  /** API のベースURL（例 https://dango-leaderboard.xxx.workers.dev） */
  baseUrl: string;
  /** ゲーム識別子（例 dango-drop） */
  gameId: string;
  /**
   * ランキング機能を使うか。
   * ★Poki の審査が下りるまでは false にしてビルドできるようにするための口★
   * false のときは一切通信せず、端末内の自己ベストだけで動く。
   */
  enabled?: boolean;
  /** 通信のタイムアウト（ミリ秒）。既定3秒 */
  timeoutMs?: number;
  /** 家族ルームのコード（あれば送信時に付ける） */
  roomCode?: string | null;
}

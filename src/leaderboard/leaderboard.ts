/**
 * ランキングAPI クライアントSDK
 *
 * ★大原則: APIが落ちていてもゲームは遊べること★
 *   すべてのメソッドは例外を投げない。通信に失敗したら
 *   端末内（localStorage）の自己ベストだけで結果を組み立てて返す。
 *   ゲーム側は `online` を見て「ランキング欄を出すかどうか」だけ判断すればよい。
 *
 * ★外部依存ゼロ・軽量★
 *   fetch と localStorage しか使わない。
 *   Poki は初回ダウンロード 8MB 制限があるため、バンドルを膨らませない。
 *
 * ★ランキング機能ごと無効化できる★
 *   options.enabled を false にすると一切通信しない。
 *   Poki の審査が下りるまではこのフラグでビルドを切り替える。
 *
 * 関連: docs/api.md / docs/integration.md
 */
import { getIdentity } from './identity';
import { cacheKey, readNumber, readValue, syncedKey, writeValue } from './storage';
import type {
  BoardKind,
  LeaderboardEntry,
  LeaderboardOptions,
  LeaderboardResult,
  MeResult,
  PlayStats,
  PlayerIdentity,
  RoomResult,
  SubmitResult,
} from './types';

/** 通信のタイムアウト既定値（ミリ秒）。待たせすぎるとゲームが止まって見える */
const DEFAULT_TIMEOUT_MS = 3000;

/** サーバーの応答（docs/api.md の形。必要な項目だけ拾う） */
interface SubmitScoreApiResponse {
  is_personal_best: boolean;
  personal_best: number;
  flagged: boolean;
  alltime: { rank: number | null; total_players: number; percentile: number | null };
  weekly: { rank: number | null; total_players: number; percentile: number | null };
}
interface LeaderboardApiResponse {
  board: BoardKind;
  period_key: string;
  entries: LeaderboardEntry[];
  total_players: number;
}
interface MeApiResponse {
  personal_best: number;
  weekly_best: number;
  play_count: number;
  alltime: { rank: number | null; total_players: number; percentile: number | null };
  weekly: { rank: number | null; total_players: number; percentile: number | null };
}
interface RoomApiResponse {
  room_code: string;
  label: string | null;
}

/** SDK が返すクライアント */
export interface LeaderboardClient {
  /** このプレイヤーの識別情報（起動時に一度だけ解決される） */
  getIdentity(): Promise<PlayerIdentity>;
  /** スコアを送る。失敗しても端末内の自己ベストは更新される */
  submitScore(score: number, stats?: PlayStats): Promise<SubmitResult>;
  /** ランキングを取る。失敗したら online:false と空配列 */
  fetchLeaderboard(board: BoardKind, limit?: number): Promise<LeaderboardResult>;
  /** 自分の記録を取る。失敗したら端末内の自己ベストだけ返す */
  fetchMe(): Promise<MeResult>;
  /** 家族ルームを作る */
  createRoom(label?: string): Promise<RoomResult>;
  /** 端末内に保存している自己ベストを読む（通信なし・即時） */
  getLocalBest(): number;
  /** 表示名を保存する（任意入力なので、入力があったときだけ呼ぶ） */
  setDisplayName(name: string): void;
  /** 家族ルームのコードを設定する（以後の送信に付く） */
  setRoomCode(code: string | null): void;
}

/**
 * ランキングクライアントを作る
 * @param options 接続先とゲーム識別子
 * @returns クライアント
 */
export const createLeaderboardClient = (
  options: LeaderboardOptions,
): LeaderboardClient => {
  const enabled = options.enabled !== false;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = options.baseUrl.replace(/\/$/, '');
  // 自己ベストは端末をまたいで引き継ぎたいので同期対象のキーに置く
  const bestKey = syncedKey(`best_${options.gameId}`);
  // ランキングの一時キャッシュは同期不要（Poki の規約に沿って除外接頭辞を使う）
  const lastBoardKey = cacheKey(`board_${options.gameId}`);

  let roomCode: string | null = options.roomCode ?? null;
  /** 識別情報は一度解決したら使い回す（毎回 SDK を叩かない） */
  let identityPromise: Promise<PlayerIdentity> | null = null;

  /** 識別情報を解決する（初回だけ） */
  const identity = (): Promise<PlayerIdentity> => {
    identityPromise ??= getIdentity();
    return identityPromise;
  };

  /**
   * タイムアウト付きで API を呼ぶ
   * 失敗（通信エラー・タイムアウト・エラー応答）はすべて null にして返す。
   * ★ここで例外を吸収するので、呼び出し側は try/catch 不要★
   * @param path パス
   * @param init メソッドと本文
   * @returns 応答。失敗したら null
   */
  const callApi = async <T>(
    path: string,
    init?: { method: string; body: unknown },
  ): Promise<T | null> => {
    if (!enabled) {
      return null;
    }
    // AbortController で「3秒待っても返ってこなければ諦める」を実現する
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: init?.method ?? 'GET',
        headers: init === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: init === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as T;
    } catch {
      // オフライン・タイムアウト・CORS 拒否など。ゲームは続行させる
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  /** 端末内の自己ベストを読む */
  const getLocalBest = (): number => readNumber(bestKey, 0);

  /** 端末内の自己ベストを更新する（伸びたときだけ） */
  const updateLocalBest = (score: number): boolean => {
    const previous = getLocalBest();
    if (score <= previous) {
      return false;
    }
    writeValue(bestKey, String(score));
    return true;
  };

  return {
    getIdentity: identity,

    async submitScore(score: number, stats?: PlayStats): Promise<SubmitResult> {
      // ★通信より先に端末内を更新する★
      //   こうしておけば、APIが落ちていても「自己ベスト更新！」が出せる
      const improvedLocally = updateLocalBest(score);
      const me = await identity();

      const response = await callApi<SubmitScoreApiResponse>('/v1/scores', {
        method: 'POST',
        body: {
          game_id: options.gameId,
          player_id: me.playerId,
          display_name: me.displayName,
          score,
          room_code: roomCode,
          platform: me.platform,
          stats,
        },
      });

      if (response === null) {
        return {
          online: false,
          isPersonalBest: improvedLocally,
          personalBest: getLocalBest(),
          flagged: false,
          alltime: null,
          weekly: null,
        };
      }

      // サーバーの方が正しい（他端末で出した記録が入っていることがある）
      if (response.personal_best > getLocalBest()) {
        writeValue(bestKey, String(response.personal_best));
      }
      return {
        online: true,
        isPersonalBest: response.is_personal_best,
        personalBest: response.personal_best,
        flagged: response.flagged,
        alltime: response.alltime,
        weekly: response.weekly,
      };
    },

    async fetchLeaderboard(board: BoardKind, limit = 20): Promise<LeaderboardResult> {
      const me = await identity();
      const params = new URLSearchParams({
        game_id: options.gameId,
        board,
        limit: String(limit),
        player_id: me.playerId,
      });
      if (board === 'room' && roomCode !== null) {
        params.set('room_code', roomCode);
      }

      const response = await callApi<LeaderboardApiResponse>(
        `/v1/leaderboard?${params.toString()}`,
      );
      if (response === null) {
        // 前回取れた内容が残っていれば、それを見せる（真っ白よりはまし）
        const cached = readValue(lastBoardKey);
        if (cached !== null) {
          try {
            const parsed = JSON.parse(cached) as LeaderboardApiResponse;
            if (parsed.board === board) {
              return { online: false, ...parsed };
            }
          } catch {
            // キャッシュが壊れていたら無視する
          }
        }
        return {
          online: false,
          board,
          period_key: '',
          entries: [],
          total_players: 0,
        };
      }

      writeValue(lastBoardKey, JSON.stringify(response));
      return { online: true, ...response };
    },

    async fetchMe(): Promise<MeResult> {
      const me = await identity();
      const params = new URLSearchParams({
        game_id: options.gameId,
        player_id: me.playerId,
      });
      const response = await callApi<MeApiResponse>(`/v1/me?${params.toString()}`);
      if (response === null) {
        return {
          online: false,
          personalBest: getLocalBest(),
          weeklyBest: 0,
          playCount: 0,
          alltime: null,
          weekly: null,
        };
      }
      if (response.personal_best > getLocalBest()) {
        writeValue(bestKey, String(response.personal_best));
      }
      return {
        online: true,
        personalBest: response.personal_best,
        weeklyBest: response.weekly_best,
        playCount: response.play_count,
        alltime: response.alltime,
        weekly: response.weekly,
      };
    },

    async createRoom(label?: string): Promise<RoomResult> {
      const me = await identity();
      const response = await callApi<RoomApiResponse>('/v1/rooms', {
        method: 'POST',
        body: { game_id: options.gameId, label: label ?? null, player_id: me.playerId },
      });
      if (response === null) {
        return { online: false, roomCode: null, label: null };
      }
      // 作ったルームはそのまま使う状態にしておく
      roomCode = response.room_code;
      return { online: true, roomCode: response.room_code, label: response.label };
    },

    getLocalBest,

    setDisplayName(name: string): void {
      writeValue(syncedKey('display_name'), name);
      // 次回の送信に反映されるよう、解決済みの識別情報を作り直させる
      identityPromise = null;
    },

    setRoomCode(code: string | null): void {
      roomCode = code;
    },
  };
};

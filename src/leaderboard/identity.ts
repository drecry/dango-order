/**
 * プレイヤー識別（プラットフォームごとの分岐）
 *
 * ★どの環境でも同じ形（PlayerIdentity）で返すのが役目★
 *   ゲーム側は「Poki かどうか」を意識せずに使える。
 *
 * | 環境        | 識別方法 |
 * |------------|---------|
 * | Poki       | PokiSDK.getUser() のユーザー名。取れなければ匿名IDへ |
 * | CrazyGames | CrazyGames SDK のユーザー情報。同上 |
 * | itch / その他 | localStorage の UUID ＋ 任意入力のニックネーム |
 *
 * ★ニックネーム入力は必須にしない★
 *   Poki は「ログインウォール禁止・即プレイ」が公開要件。
 *   名前が無くても遊べ、スコア送信後に任意で登録できる流れにする。
 */
import { readValue, syncedKey, writeValue } from './storage';
import type { Platform, PlayerIdentity } from './types';

/** プレイヤーIDの保存キー（端末をまたいで引き継ぎたいので同期対象） */
const PLAYER_ID_KEY = syncedKey('player_id');

/** 表示名の保存キー（同上） */
const DISPLAY_NAME_KEY = syncedKey('display_name');

/**
 * 各プラットフォームSDKの最小限の形
 * SDK 本体は読み込まない（外部依存ゼロを守るため）。
 * ゲーム側が読み込んでいれば window に生えているので、それを覗くだけにする。
 */
interface PokiSdkLike {
  getUser?: () => Promise<{ id?: string; name?: string } | null | undefined>;
}
interface CrazyGamesSdkLike {
  user?: {
    getUser?: () => Promise<{ username?: string; profilePictureUrl?: string } | null>;
  };
}
interface SdkWindow {
  PokiSDK?: PokiSdkLike;
  CrazyGames?: { SDK?: CrazyGamesSdkLike };
}

/**
 * window を安全に覗く（サーバー描画やテスト環境で window が無くても落ちないように）
 * @returns window 相当のオブジェクト。無ければ空
 */
const sdkWindow = (): SdkWindow => {
  return typeof globalThis === 'undefined' ? {} : (globalThis as SdkWindow);
};

/**
 * いまどのプラットフォームで動いているか判定する
 *
 * SDK が読み込まれているかを最優先で見る（もっとも確実なため）。
 * itch.io は SDK が無いのでホスト名で判定する。
 *
 * @returns プラットフォーム
 */
export const detectPlatform = (): Platform => {
  const win = sdkWindow();
  if (win.PokiSDK !== undefined) {
    return 'poki';
  }
  if (win.CrazyGames?.SDK !== undefined) {
    return 'crazygames';
  }
  // itch.io のゲームは itch.zone / itch.io のドメインで配信される
  const host = typeof location === 'undefined' ? '' : location.hostname;
  if (host.endsWith('itch.io') || host.endsWith('itch.zone')) {
    return 'itch';
  }
  return 'standalone';
};

/**
 * ランダムなプレイヤーIDを作る
 * crypto.randomUUID が使えない古い環境でも動くよう予備の手段を持つ。
 * @returns UUID 風の文字列
 */
const generatePlayerId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // crypto が使えない環境ではこの下の手段へ
  }
  // 最後の手段。衝突しにくさは劣るが、遊べなくなるよりはよい
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * 匿名プレイヤーIDを取り出す（無ければ作って保存する）
 * @returns プレイヤーID
 */
export const getOrCreateAnonymousId = (): string => {
  const saved = readValue(PLAYER_ID_KEY);
  if (saved !== null && saved.length > 0) {
    return saved;
  }
  const created = generatePlayerId();
  writeValue(PLAYER_ID_KEY, created);
  return created;
};

/**
 * 保存済みの表示名を読む
 * @returns 表示名。未設定なら null
 */
export const getSavedDisplayName = (): string | null => {
  const saved = readValue(DISPLAY_NAME_KEY);
  return saved !== null && saved.length > 0 ? saved : null;
};

/**
 * 表示名を保存する（プレイヤーが任意で入力したとき）
 * @param name 表示名
 */
export const saveDisplayName = (name: string): void => {
  writeValue(DISPLAY_NAME_KEY, name);
};

/**
 * プラットフォームのユーザー名を取得する
 * SDK が無い・ログインしていない・失敗した、のいずれでも null を返す
 * （匿名IDへフォールバックするため、ここで例外を投げてはいけない）。
 * @param platform 判定済みのプラットフォーム
 * @returns ユーザー名。取れなければ null
 */
const fetchPlatformName = async (platform: Platform): Promise<string | null> => {
  const win = sdkWindow();
  try {
    if (platform === 'poki' && typeof win.PokiSDK?.getUser === 'function') {
      const user = await win.PokiSDK.getUser();
      return user?.name ?? null;
    }
    if (
      platform === 'crazygames' &&
      typeof win.CrazyGames?.SDK?.user?.getUser === 'function'
    ) {
      const user = await win.CrazyGames.SDK.user.getUser();
      return user?.username ?? null;
    }
  } catch {
    // ログインしていない場合など。匿名として続行する
  }
  return null;
};

/**
 * このプレイヤーの識別情報をまとめて取り出す
 *
 * プラットフォームがユーザー名をくれる場合はそれを表示名に使い、
 * くれない場合は保存済みのニックネーム（あれば）を使う。
 * どちらも無ければ表示名は null のまま（サーバー側で "Player" になる）。
 *
 * ★プレイヤーIDは常に自前の UUID を使う★
 *   プラットフォームのIDに寄せると、Poki で遊んだ記録と itch で遊んだ記録が
 *   別人になってしまう。自前IDなら同期を通じて引き継げる。
 *
 * @returns プレイヤー識別情報
 */
export const getIdentity = async (): Promise<PlayerIdentity> => {
  const platform = detectPlatform();
  const playerId = getOrCreateAnonymousId();
  const platformName = await fetchPlatformName(platform);
  return {
    playerId,
    displayName: platformName ?? getSavedDisplayName(),
    platform,
  };
};

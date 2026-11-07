/**
 * localStorage の安全な読み書き
 *
 * ★必ず try/catch で包む★
 *   Poki は「シークレットモードでも動くこと」を公開要件にしている。
 *   その環境では localStorage へのアクセス自体が例外を投げるため、
 *   素で触るとゲームが起動しなくなる。
 *   使えない環境ではメモリ上の代用品に切り替えて動き続ける。
 *
 * ★キーの接頭辞のルール★
 *   - `poki_ignore` で始まるキー … Poki のクラウドセーブ同期から除外される。
 *     一時キャッシュ（前回のランキング等）はこちらに置く。
 *   - それ以外のキー … 同期される。
 *     player_id と自己ベストは端末が変わっても引き継ぎたいのでこちら。
 */

/** 同期させたいキーの接頭辞（プレイヤーID・自己ベストなど） */
const SYNCED_PREFIX = 'dango_';

/** 同期させたくないキーの接頭辞（Poki の規約に沿った一時キャッシュ用） */
const IGNORED_PREFIX = 'poki_ignore_dango_';

/** localStorage が使えない環境のための代用品（このセッション中だけ保持） */
const memoryStore = new Map<string, string>();

/** localStorage が使えるかを一度だけ判定した結果 */
let storageUsable: boolean | null = null;

/**
 * localStorage が実際に使えるか確かめる
 * 「存在するか」だけでは足りない（存在しても書き込みで例外になる環境がある）ので、
 * 実際に書いて消してみる。
 * @returns 使えれば true
 */
const canUseStorage = (): boolean => {
  if (storageUsable !== null) {
    return storageUsable;
  }
  try {
    const probe = `${IGNORED_PREFIX}probe`;
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    storageUsable = true;
  } catch {
    // シークレットモード・容量超過・ストレージ無効など
    storageUsable = false;
  }
  return storageUsable;
};

/**
 * 同期対象のキーを組み立てる（端末をまたいで引き継ぎたい値）
 * @param name キー名
 * @returns 実際の localStorage キー
 */
export const syncedKey = (name: string): string => `${SYNCED_PREFIX}${name}`;

/**
 * 同期対象外のキーを組み立てる（一時キャッシュ）
 * @param name キー名
 * @returns 実際の localStorage キー
 */
export const cacheKey = (name: string): string => `${IGNORED_PREFIX}${name}`;

/**
 * 値を読む
 * @param key キー
 * @returns 値。無ければ null
 */
export const readValue = (key: string): string | null => {
  if (!canUseStorage()) {
    return memoryStore.get(key) ?? null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return memoryStore.get(key) ?? null;
  }
};

/**
 * 値を書く
 * 失敗しても例外を投げない（保存できなくてもゲームは続行する）。
 * @param key キー
 * @param value 値
 */
export const writeValue = (key: string, value: string): void => {
  // 使えない環境でも、同じセッション中は覚えておけるようメモリにも持つ
  memoryStore.set(key, value);
  if (!canUseStorage()) {
    return;
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    // 容量超過などで書けなくても、メモリ側に入っているので進行に支障はない
  }
};

/**
 * 数値を読む（壊れた値は既定値にフォールバックする）
 * @param key キー
 * @param fallback 読めなかったときの値
 * @returns 数値
 */
export const readNumber = (key: string, fallback = 0): number => {
  const raw = readValue(key);
  if (raw === null) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

/**
 * テスト用: 判定結果のキャッシュとメモリ代用品をリセットする
 * 本番コードからは呼ばない。
 */
export const resetStorageForTest = (): void => {
  storageUsable = null;
  memoryStore.clear();
};

/**
 * 表示名の入力チェック（クライアント側）
 *
 * ★これは「その場で教えてあげる」ためのもの★
 *   本当の判定はサーバー側（worker/src/names.ts）が行う。
 *   クライアントのフィルタは開発者ツールで回避できるので、ここは
 *   「入力欄で赤字を出して気づいてもらう」ためのUX用と割り切る。
 *   そのぶん語彙は絞り、バンドルを軽く保つ（Poki の 8MB 制限のため）。
 */

/** 表示名の最大文字数（サーバーと同じ値にすること） */
export const MAX_DISPLAY_NAME_LENGTH = 16;

/** その場で弾く語（サーバー側はもっと多くの語を見ている） */
const NG_WORDS: readonly string[] = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'asshole',
  'nigger', 'nigga', 'faggot', 'rape', 'porn', 'sex',
  'admin', 'moderator', 'official',
  'ばか', 'バカ', '死ね', 'しね', '殺す', 'ころす',
  'うんこ', 'ちんこ', 'まんこ', 'エロ',
];

/**
 * 判定用に正規化する（記号や数字での回避を潰す）
 * @param value 元の文字列
 * @returns 正規化後の文字列
 */
const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\s_\-.*+!@#$%^&()[\]{}<>/\\|'"`~,;:?=]/g, '')
    .replace(/4/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/0/g, 'o')
    .replace(/5/g, 's');

/** 入力チェックの結果 */
export interface NameCheckResult {
  /** そのまま使えるか */
  ok: boolean;
  /** 使えない理由（プレイヤーに見せる文言。英語） */
  reason?: string;
}

/**
 * 入力された表示名が使えるか確かめる
 *
 * ★空を「エラー」にしない★
 *   名前は任意入力。空のまま遊べることが Poki の公開要件なので、
 *   空文字は ok として扱い、サーバー側で "Player" が割り当てられる。
 *
 * @param raw 入力された名前
 * @returns 判定結果
 */
export const checkDisplayName = (raw: string): NameCheckResult => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true }; // 未入力でよい
  }
  if ([...trimmed].length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, reason: `Up to ${MAX_DISPLAY_NAME_LENGTH} characters` };
  }
  const normalized = normalize(trimmed);
  if (NG_WORDS.some((word) => normalized.includes(normalize(word)))) {
    return { ok: false, reason: 'Please choose another name' };
  }
  return { ok: true };
};

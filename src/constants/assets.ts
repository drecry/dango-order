/**
 * Dango character data (Dango Order).
 *
 * The seven dango friends, with the real character art from
 * Dango Drop (public/assets/dango/*.png). Image files are the same art
 * used in Dango Drop and Dango Swap, so the family looks identical
 * across all two games.
 *
 * Prices come from src/config/dango-economy.json (single source of truth);
 * this file only holds display data (names, colors, introductions).
 */

export type DangoKind =
  | 'shiratama'
  | 'anko'
  | 'sakura'
  | 'mitarashi'
  | 'yomogi'
  | 'matcha'
  | 'golden';

/** The five everyday friends — the regular drop pool. */
export const REGULAR_KINDS: readonly DangoKind[] = [
  'shiratama',
  'anko',
  'sakura',
  'mitarashi',
  'yomogi',
];

/** All seven friends, for loading and the Meet the Dango screen. */
export const ALL_DANGO_KINDS: readonly DangoKind[] = [
  ...REGULAR_KINDS,
  'matcha',
  'golden',
];

export interface DangoInfo {
  kind: DangoKind;
  /** Display name (English). */
  name: string;
  /** One-line introduction for the Meet the Dango screen. */
  intro: string;
  /** Accent color used for name labels and effects. */
  color: string;
}

export const DANGO_INFO: Record<DangoKind, DangoInfo> = {
  shiratama: {
    kind: 'shiratama',
    name: 'Shiratama',
    intro: 'Soft, white and cheerful. The first friend you meet.',
    color: '#fff7e6',
  },
  anko: {
    kind: 'anko',
    name: 'Anko',
    intro: 'Sweet red bean paste. Warm, round and reliable.',
    color: '#7a4a2b',
  },
  sakura: {
    kind: 'sakura',
    name: 'Sakura',
    intro: 'Pink like cherry blossom. Gentle and a little dreamy.',
    color: '#f6c9d4',
  },
  mitarashi: {
    kind: 'mitarashi',
    name: 'Mitarashi',
    intro: 'Glazed with sweet soy sauce. Shiny and proud.',
    color: '#c89b6a',
  },
  yomogi: {
    kind: 'yomogi',
    name: 'Yomogi',
    intro: 'Green mugwort. Calm, herbal and quietly strong.',
    color: '#8fbf7f',
  },
  matcha: {
    kind: 'matcha',
    name: 'Matcha',
    intro: 'The Shy One. Rarely comes to the shop, but works the hardest when she does.',
    color: '#5a8a4a',
  },
  golden: {
    kind: 'golden',
    name: 'Golden',
    intro: 'A rare shining dango. Worth a fortune at the shop!',
    color: '#f5c542',
  },
};

/** Path of a dango image inside public/ (Vite serves public/ at the base). */
export const dangoImagePath = (kind: DangoKind): string =>
  `assets/dango/${kind}.png`;

/** Phaser texture key of the shop background illustration. */
export const BACKGROUND_KEY = 'bg-order';

/** Path of the shop background (public/assets/bg-order.webp). */
export const BACKGROUND_PATH = 'assets/bg-order.webp';

/** Customer expressions (only these three friends have variants). */
export type DangoExpression = 'happy' | 'sad' | 'angry';

/** Kinds whose Drive art includes expression variants. */
export const EXPRESSION_KINDS: readonly DangoKind[] = [
  'shiratama',
  'sakura',
  'yomogi',
];

/** Whether a kind has expression-variant art. */
export const hasExpressions = (kind: DangoKind): boolean =>
  EXPRESSION_KINDS.includes(kind);

/** Phaser texture key for an expression variant: `<kind>-<expression>`. */
export const expressionKey = (
  kind: DangoKind,
  expression: DangoExpression,
): string => `${kind}-${expression}`;

/** Path of an expression-variant image inside public/. */
export const expressionImagePath = (
  kind: DangoKind,
  expression: DangoExpression,
): string => `assets/dango/${kind}-${expression}.png`;

/**
 * Customer animals (v3). The customers are cute animals now — generated
 * watercolor portraits, circular-cropped with baked-in alpha so they
 * sit inside the portrait ring. Purely cosmetic: who walks in never
 * changes the order rules.
 */
export type AnimalKind =
  | 'rabbit'
  | 'cat'
  | 'bear'
  | 'panda'
  | 'fox'
  | 'hamster';

/** All six animal customers, for loading and random picks. */
export const ANIMAL_KINDS: readonly AnimalKind[] = [
  'rabbit',
  'cat',
  'bear',
  'panda',
  'fox',
  'hamster',
];

/** Phaser texture key for an animal portrait: `animal-<kind>`. */
export const animalKey = (kind: AnimalKind): string => `animal-${kind}`;

/** Path of an animal portrait inside public/. */
export const animalImagePath = (kind: AnimalKind): string =>
  `assets/animals/${kind}.webp`;

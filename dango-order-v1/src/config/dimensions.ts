/**
 * Logical resolution (the design canvas) — pure numbers, no Phaser.
 *
 * Kept in its own file so pure logic and tests can use the size without
 * importing Phaser (which touches `window` on load and breaks Vitest in
 * Node). Same pattern as Dango Drop's dimensions.ts.
 *
 * 540x960 = 9:16, the standard portrait phone ratio.
 */
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

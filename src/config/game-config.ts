/**
 * Phaser game config (Dango Order).
 *
 * Portrait phone game: logical resolution 540x960 (9:16), Scale.FIT +
 * CENTER_BOTH, same as Dango Drop / Dango Swap.
 * All UI constants are written relative to GAME_WIDTH / GAME_HEIGHT.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './dimensions';

export { GAME_WIDTH, GAME_HEIGHT };

/**
 * Game background color (warm cream of a dango shop).
 * NOTE: index.html body background must match this value, because the
 * letterbox bands created by Scale.FIT show the body color.
 */
export const GAME_BACKGROUND_COLOR = '#f9edda';

export const createGameConfig = (): Phaser.Types.Core.GameConfig => {
  return {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game',
    backgroundColor: GAME_BACKGROUND_COLOR,
    render: {
      pixelArt: false,
      antialias: true,
      roundPixels: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    input: {
      activePointers: 1,
    },
    scene: [],
  };
};

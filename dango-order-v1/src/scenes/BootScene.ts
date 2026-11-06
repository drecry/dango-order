/**
 * Boot scene (Dango Order).
 * Sets the background color, then hands over to PreloadScene.
 */
import Phaser from 'phaser';
import { GAME_BACKGROUND_COLOR } from '../config/game-config';

export const BOOT_SCENE_KEY = 'BootScene';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(BOOT_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor(GAME_BACKGROUND_COLOR);
    this.scene.start('PreloadScene');
  }
}

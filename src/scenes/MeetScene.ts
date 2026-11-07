/**
 * Meet the Dango screen (Dango Order).
 *
 * Introduces the seven dango friends with their real character art,
 * menu prices and one-line personalities. Reached from the title screen.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import {
  ALL_DANGO_KINDS,
  BACKGROUND_KEY,
  DANGO_INFO,
} from '../constants/assets';
import { loadEconomy } from '../systems/EconomyConfig';
import { addSoftPanel, bodyText, headingText, makeButton } from './ui';

export const MEET_SCENE_KEY = 'MeetScene';

export class MeetScene extends Phaser.Scene {
  constructor() {
    super(MEET_SCENE_KEY);
  }

  create(): void {
    const economy = loadEconomy();
    // Shop background illustration (drawn first, behind everything).
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKGROUND_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    addSoftPanel(this, GAME_WIDTH / 2, 470, 500, 840, 0.35);
    headingText(this, GAME_WIDTH / 2, 72, 'MEET THE DANGO', 36);
    bodyText(
      this,
      GAME_WIDTH / 2,
      116,
      'Seven friends run the dango shop together.',
      18,
    ).setOrigin(0.5);

    let y = 168;
    for (const kind of ALL_DANGO_KINDS) {
      const info = DANGO_INFO[kind];
      this.add.image(72, y + 34, kind).setDisplaySize(68, 68);
      this.add
        .text(120, y, `${info.name}  ·  ${economy.prices[kind]} DG`, {
          fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
          fontSize: '21px',
          color: '#5a3a28',
        })
        .setOrigin(0, 0);
      bodyText(this, 120, y + 30, info.intro, 17, 400).setOrigin(0, 0);
      y += 90;
    }

    bodyText(
      this,
      GAME_WIDTH / 2,
      y + 6,
      'Matcha and Golden are rare treats!',
      17,
    ).setOrigin(0.5);

    makeButton(this, GAME_WIDTH / 2, 892, 240, 56, 'BACK', () => {
      this.scene.start('TitleScene');
    });
  }
}

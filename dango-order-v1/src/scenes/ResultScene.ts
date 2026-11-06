/**
 * Result screen (Dango Order) — "Today's Dango Shop".
 *
 * Like Dango Drop's "Today's Dango Shop", a finished shift is reframed
 * as a shop report: the skewers you served were sold, and here is the
 * total. Shows DG earned, orders served, best combo, best results, and
 * a NEW RECORD badge when a record was broken.
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/dimensions';
import { CURRENCY } from '../systems/EconomyConfig';
import { bodyText, headingText, makeButton } from './ui';

export const RESULT_SCENE_KEY = 'ResultScene';

export interface ResultData {
  dg: number;
  served: number;
  bestCombo: number;
  bestDG: number;
  bestServed: number;
  bestComboBest: number;
  isNewRecord: boolean;
}

export class ResultScene extends Phaser.Scene {
  constructor() {
    super(RESULT_SCENE_KEY);
  }

  create(data: ResultData): void {
    headingText(this, GAME_WIDTH / 2, 96, "Today's", 36);
    headingText(this, GAME_WIDTH / 2, 148, 'Dango Shop', 44);

    if (data.isNewRecord) {
      const badge = this.add
        .text(GAME_WIDTH / 2, 206, 'NEW RECORD!', {
          fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
          fontSize: '26px',
          color: '#ffffff',
          backgroundColor: '#e86a7a',
          padding: { x: 18, y: 8 },
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: badge,
        scale: 1.1,
        duration: 400,
        yoyo: true,
        repeat: -1,
      });
    }

    this.add
      .text(GAME_WIDTH / 2, 292, `${data.dg} ${CURRENCY}`, {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '64px',
        color: '#5a3a28',
      })
      .setOrigin(0.5);
    bodyText(
      this,
      GAME_WIDTH / 2,
      368,
      'sold at the shop today!',
      20,
    ).setOrigin(0.5);

    const panel = this.add.rectangle(
      GAME_WIDTH / 2,
      508,
      420,
      190,
      0xfff7e6,
      1,
    );
    panel.setStrokeStyle(2, 0xc89b6a);
    const rows: [string, string][] = [
      ['Orders served', `${data.served}`],
      ['Best combo', `x${data.bestCombo}`],
      ['Best DG', `${data.bestDG} ${CURRENCY}`],
      ['Best served', `${data.bestServed}`],
    ];
    rows.forEach(([label, value], i) => {
      const y = 448 + i * 34;
      this.add
        .text(GAME_WIDTH / 2 - 190, y, label, {
          fontFamily: '"Zen Maru Gothic", sans-serif',
          fontSize: '20px',
          color: '#5a3a28',
        })
        .setOrigin(0, 0.5);
      this.add
        .text(GAME_WIDTH / 2 + 190, y, value, {
          fontFamily: '"Zen Maru Gothic", sans-serif',
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#5a3a28',
        })
        .setOrigin(1, 0.5);
    });

    makeButton(this, GAME_WIDTH / 2, 680, 300, 72, 'PLAY AGAIN', () => {
      this.scene.start('GameScene');
    });
    makeButton(
      this,
      GAME_WIDTH / 2,
      772,
      300,
      56,
      'TITLE',
      () => {
        this.scene.start('TitleScene');
      },
      22,
    );
  }
}

/**
 * How to Play screen (Dango Order).
 *
 * The rules live on their own screen, reached from the title — never as
 * an overlay on the game, so the game itself can use the whole phone
 * screen. All text is English.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import { BACKGROUND_KEY } from '../constants/assets';
import { loadEconomy } from '../systems/EconomyConfig';
import { addSoftPanel, bodyText, headingText, makeButton } from './ui';

export const HOW_TO_SCENE_KEY = 'HowToScene';

export class HowToScene extends Phaser.Scene {
  constructor() {
    super(HOW_TO_SCENE_KEY);
  }

  create(): void {
    const economy = loadEconomy();
    // Shop background illustration (drawn first, behind everything).
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKGROUND_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    addSoftPanel(this, GAME_WIDTH / 2, 430, 500, 800, 0.35);
    headingText(this, GAME_WIDTH / 2, 84, 'HOW TO PLAY', 40);

    const steps: { icon: string; title: string; text: string }[] = [
      {
        icon: 'shiratama',
        title: '1. Read the order',
        text: 'A customer wants a skewer of dango, in order from the bottom up. Tap the dango in that order.',
      },
      {
        icon: 'sakura',
        title: '2. Tap the pad',
        text: 'Tap the matching dango on the pad to build the skewer. A wrong dango tries the customer\'s patience!',
      },
      {
        icon: 'matcha',
        title: '3. Serve fast',
        text: 'Serve before the patience bar runs out for a wait bonus. Serves in a row build a combo!',
      },
      {
        icon: 'golden',
        title: '4. Every order is sold',
        text: 'Each served skewer is sold at the shop. DG is your score — the faster you serve, the richer the shop!',
      },
    ];

    let y = 140;
    for (const step of steps) {
      this.add.image(64, y + 22, step.icon).setDisplaySize(52, 52);
      this.add
        .text(100, y, step.title, {
          fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
          fontSize: '21px',
          color: '#5a3a28',
        })
        .setOrigin(0, 0);
      bodyText(this, 100, y + 30, step.text, 18, 420).setOrigin(0, 0);
      y += 108;
    }

    // DG formula box.
    const box = this.add.rectangle(
      GAME_WIDTH / 2,
      y + 74,
      460,
      148,
      0xfff7e6,
      1,
    );
    box.setStrokeStyle(2, 0xc89b6a);
    headingText(this, GAME_WIDTH / 2, y + 22, 'HOW DG IS EARNED', 22);
    bodyText(
      this,
      GAME_WIDTH / 2,
      y + 52,
      `DG = sum of prices x ${economy.sellMultiplier} (VIP order x${economy.vipMultiplier}) + wait bonus (+${economy.waitBonusPerSecond} DG per patience second left) + combo bonus (${economy.comboBonus} DG x combo)\nMatcha order: +${economy.matchaBonusSeconds} seconds! Golden order: VIP, 2x sales!`,
      17,
    ).setOrigin(0.5, 0);

    makeButton(this, GAME_WIDTH / 2, 868, 240, 60, 'BACK', () => {
      this.scene.start('TitleScene');
    });
  }
}

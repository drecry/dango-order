/**
 * Title screen (Dango Order).
 *
 * The front door of the game: title, PLAY, HOW TO PLAY and
 * MEET THE DANGO buttons, best results, and a sound toggle.
 * Rules and introductions live on their own screens (reached from here),
 * never over the game itself — the game screen stays full-screen.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import { ALL_DANGO_KINDS } from '../constants/assets';
import { loadBest } from '../logic/storage';
import { sound } from '../systems/sound';
import {
  COLOR_TEXT,
  bodyText,
  headingText,
  makeButton,
  makeIconButton,
} from './ui';

export const TITLE_SCENE_KEY = 'TitleScene';

export class TitleScene extends Phaser.Scene {
  private soundButtonText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(TITLE_SCENE_KEY);
  }

  create(): void {
    const best = loadBest();

    // Seven friends bobbing above the title.
    ALL_DANGO_KINDS.forEach((kind, i) => {
      const x = 60 + i * 70;
      const img = this.add.image(x, 168, kind).setDisplaySize(56, 56);
      this.tweens.add({
        targets: img,
        y: 152,
        duration: 900 + i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });

    headingText(this, GAME_WIDTH / 2, 268, 'DANGO', 64);
    headingText(this, GAME_WIDTH / 2, 332, 'ORDER', 64);
    bodyText(
      this,
      GAME_WIDTH / 2,
      392,
      'Serve it. Sell it. Smile!',
      22,
    ).setOrigin(0.5);

    makeButton(this, GAME_WIDTH / 2, 500, 300, 72, 'PLAY', () => {
      this.scene.start('GameScene');
    });

    makeButton(
      this,
      GAME_WIDTH / 2,
      596,
      300,
      56,
      'HOW TO PLAY',
      () => {
        this.scene.start('HowToScene');
      },
      22,
    );

    makeButton(
      this,
      GAME_WIDTH / 2,
      668,
      300,
      56,
      'MEET THE DANGO',
      () => {
        this.scene.start('MeetScene');
      },
      22,
    );

    const bestLine =
      best.bestDG > 0
        ? `BEST  ${best.bestDG} DG  ·  ${best.bestServed} served  ·  COMBO x${best.bestCombo}`
        : 'No customers yet — your first shift is waiting!';
    this.add
      .text(GAME_WIDTH / 2, 742, bestLine, {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '19px',
        fontStyle: 'bold',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5);

    // Sound toggle (top right).
    const soundButton = makeIconButton(
      this,
      GAME_WIDTH - 36,
      40,
      sound.isMuted ? 'OFF' : 'ON',
      () => {
        const muted = sound.toggleMuted();
        this.soundButtonText?.setText(muted ? 'OFF' : 'ON');
      },
    );
    this.soundButtonText = soundButton.getAt(1) as Phaser.GameObjects.Text;
    this.add
      .text(GAME_WIDTH - 36, 72, 'SOUND', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '13px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 62, 'Designed by ELLY', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '16px',
        color: '#a08060',
      })
      .setOrigin(0.5);

    this.add
      .text(
        GAME_WIDTH / 2,
        GAME_HEIGHT - 36,
        'A DREAM CRYSTAL game  ·  drecry.com',
        {
          fontFamily: '"Zen Maru Gothic", sans-serif',
          fontSize: '16px',
          color: '#a08060',
        },
      )
      .setOrigin(0.5);
  }
}

/**
 * Asset loading scene (Preload).
 * Loads the seven dango character images, shows a progress bar, waits for
 * the official fonts, then moves to the Title scene.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import { ALL_DANGO_KINDS, dangoImagePath } from '../constants/assets';
import { FONT_WAIT_TIMEOUT_MS } from '../constants/fonts';
import { sound } from '../systems/sound';

export const PRELOAD_SCENE_KEY = 'PreloadScene';

const PROGRESS_BAR_WIDTH_RATIO = 0.6;
const PROGRESS_BAR_HEIGHT = 24;

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(PRELOAD_SCENE_KEY);
  }

  preload(): void {
    this.drawProgressBar();
    // All seven friends. Matcha and Golden are loaded too even though they
    // are rare drops, so no loading hitch happens mid-game.
    // import.meta.env.BASE_URL is '/' in dev and '/dango-order/' in the
    // production build, so the same code works in both.
    this.load.setBaseURL(import.meta.env.BASE_URL);
    for (const kind of ALL_DANGO_KINDS) {
      this.load.image(kind, dangoImagePath(kind));
    }
  }

  create(): void {
    // The first user tap unlocks audio; prepare the context early.
    this.input.once('pointerdown', () => sound.unlock());
    void this.startAfterFonts();
  }

  /**
   * Wait for the official fonts (Canvas needs an explicit
   * document.fonts.load()) and then go to the title screen.
   * Offline fonts fall back to system fonts after a timeout.
   */
  private async startAfterFonts(): Promise<void> {
    const timeout = new Promise<void>((resolve) => {
      window.setTimeout(resolve, FONT_WAIT_TIMEOUT_MS);
    });
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('16px "Mochiy Pop One"'),
          document.fonts.load('16px "Zen Maru Gothic"'),
          document.fonts.load('bold 16px "Zen Maru Gothic"'),
        ]),
        timeout,
      ]);
    } catch {
      // Fonts are decoration; start the game anyway.
    }
    // Design shortcuts: ?scene=howto / meet / game / result open a scene
    // directly (sample data for the result screen). Normal play is unaffected.
    const requestedScene = new URLSearchParams(window.location.search).get(
      'scene',
    );
    if (requestedScene === 'howto') {
      this.scene.start('HowToScene');
      return;
    }
    if (requestedScene === 'meet') {
      this.scene.start('MeetScene');
      return;
    }
    if (requestedScene === 'game') {
      this.scene.start('GameScene');
      return;
    }
    if (requestedScene === 'result') {
      this.scene.start('ResultScene', {
        dg: 312,
        served: 9,
        bestCombo: 5,
        bestDG: 312,
        bestServed: 9,
        bestComboBest: 5,
        isNewRecord: true,
      });
      return;
    }
    this.scene.start('TitleScene');
  }

  private drawProgressBar(): void {
    const barWidth = GAME_WIDTH * PROGRESS_BAR_WIDTH_RATIO;
    const barX = (GAME_WIDTH - barWidth) / 2;
    const barY = GAME_HEIGHT / 2;
    const bg = this.add.rectangle(
      barX + barWidth / 2,
      barY,
      barWidth,
      PROGRESS_BAR_HEIGHT,
      0xe8dcc3,
    );
    bg.setStrokeStyle(2, 0xc89b6a);
    const fill = this.add.rectangle(
      barX,
      barY,
      0,
      PROGRESS_BAR_HEIGHT - 6,
      0xf6a8b8,
    );
    fill.setOrigin(0, 0.5);
    this.add
      .text(GAME_WIDTH / 2, barY - 44, 'Loading...', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '22px',
        color: '#5a3a28',
      })
      .setOrigin(0.5);
    this.load.on('progress', (value: number) => {
      fill.width = (barWidth - 6) * value;
    });
  }
}

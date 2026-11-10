/**
 * Title screen (Dango Order).
 *
 * The front door of the game: title, PLAY, HOW TO PLAY,
 * MEET THE DANGO and OPTIONS buttons over the shop illustration,
 * best results, and a sound toggle. Rules and introductions live on
 * their own screens (reached from here), never over the game itself
 * — the game screen stays full-screen.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import { ALL_DANGO_KINDS, BACKGROUND_KEY } from '../constants/assets';
import { getSavedDisplayName } from '../leaderboard';
import { loadBest } from '../logic/storage';
import { bgm } from '../systems/bgm';
import { isRankingEnabled, leaderboard } from '../systems/LeaderboardClient';
import { openOptions } from '../systems/OptionsOverlay';
import { sound } from '../systems/sound';
import {
  COLOR_TEXT,
  addSoftPanel,
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
    bgm.start('menu');
    const best = loadBest();

    // Shop background illustration (drawn first, behind everything).
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKGROUND_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    // Soft panels keep the title and credits readable over the art.
    addSoftPanel(this, GAME_WIDTH / 2, 300, 486, 240, 0.45);
    addSoftPanel(this, GAME_WIDTH / 2, 916, 420, 88, 0.5);

    // Seven friends bobbing above the title.
    ALL_DANGO_KINDS.forEach((kind, i) => {
      const x = 60 + i * 70;
      const img = this.add.image(x, 150, kind).setDisplaySize(56, 56);
      this.tweens.add({
        targets: img,
        y: 134,
        duration: 900 + i * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    });

    headingText(this, GAME_WIDTH / 2, 236, 'DANGO', 64);
    headingText(this, GAME_WIDTH / 2, 298, 'ORDER', 64);
    bodyText(
      this,
      GAME_WIDTH / 2,
      352,
      'Serve it. Sell it. Smile!',
      22,
    ).setOrigin(0.5);

    makeButton(this, GAME_WIDTH / 2, 452, 300, 72, 'PLAY', () => {
      this.scene.start('GameScene');
    });

    // With ranking on, the stack squeezes up a little to fit a
    // RANKING button under OPTIONS (the Dango Tower title does the
    // same shift). Without ranking, the layout is exactly as before.
    const ranking = isRankingEnabled();
    const subY: [number, number, number] = ranking
      ? [536, 598, 660]
      : [544, 608, 672];

    makeButton(
      this,
      GAME_WIDTH / 2,
      subY[0],
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
      subY[1],
      300,
      56,
      'MEET THE DANGO',
      () => {
        this.scene.start('MeetScene');
      },
      22,
    );

    makeButton(
      this,
      GAME_WIDTH / 2,
      subY[2],
      300,
      56,
      'OPTIONS',
      () => {
        // Name + sound, the Dango Drop way: an HTML overlay with a
        // real text input (Phaser has none). Name entry is optional.
        openOptions({
          currentName: getSavedDisplayName(),
          muted: sound.isMuted,
          onNameChange: (name) => leaderboard.setDisplayName(name),
          onToggleSound: () => {
            const muted = sound.toggleMuted();
            this.soundButtonText?.setText(muted ? 'OFF' : 'ON');
            return muted;
          },
        });
      },
      22,
    );

    if (ranking) {
      makeButton(
        this,
        GAME_WIDTH / 2,
        722,
        300,
        56,
        'RANKING',
        () => {
          this.scene.start('RankingScene');
        },
        22,
      );
    }

    const bestLine =
      best.bestDG > 0
        ? `BEST  ${best.bestDG} DG  ·  ${best.bestServed} served  ·  COMBO x${best.bestCombo}`
        : 'No customers yet — your first shift is waiting!';
    this.add
      .text(GAME_WIDTH / 2, ranking ? 788 : 742, bestLine, {
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

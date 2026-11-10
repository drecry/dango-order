/**
 * Ranking screen (Dango Order) — reached from the title screen.
 *
 * Mirrors Dango Tower's RankingScene (which follows Dango Drop): a
 * header, the shared RankingBoard panel (with its name button, so the
 * display name can be changed right here), and a BACK button to the
 * title. Your own rank line is filled in from `fetchMe()` when the
 * reply arrives; the board itself loads on its own either way.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import { BACKGROUND_KEY } from '../constants/assets';
import { FONT_HEADING } from '../constants/fonts';
import { leaderboard } from '../systems/LeaderboardClient';
import { bgm } from '../systems/bgm';
import { RankingBoard } from '../ui/RankingBoard';
import { TITLE_SCENE_KEY } from './TitleScene';
import { COLOR_TEXT, addSoftPanel, makeButton } from './ui';

export const RANKING_SCENE_KEY = 'RankingScene';

const PANEL = { x: 30, y: 130, height: 620, maxRows: 14 } as const;

export class RankingScene extends Phaser.Scene {
  constructor() {
    super(RANKING_SCENE_KEY);
  }

  create(): void {
    bgm.start('menu');

    // Shop background illustration, same as the other menu screens.
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKGROUND_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    addSoftPanel(this, GAME_WIDTH / 2, 76, 360, 84, 0.45);

    this.add
      .text(GAME_WIDTH / 2, 76, 'DANGO ORDER', {
        fontFamily: FONT_HEADING,
        fontSize: '36px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5);

    this.createBoard();

    makeButton(this, GAME_WIDTH / 2, GAME_HEIGHT - 90, 300, 56, 'BACK', () => {
      this.scene.start(TITLE_SCENE_KEY);
    }, 22);
  }

  private createBoard(): void {
    const board = new RankingBoard(this, {
      x: PANEL.x,
      y: PANEL.y,
      width: GAME_WIDTH - PANEL.x * 2,
      height: PANEL.height,
      maxRows: PANEL.maxRows,
    });
    if (!board.create()) {
      // Ranking is not part of this build (no URL configured). Say
      // so in one line; BACK still works.
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'Ranking is not available', {
          fontFamily: FONT_HEADING,
          fontSize: '22px',
          color: '#a08060',
        })
        .setOrigin(0.5);
      return;
    }

    // Your own record (personal best + ranks) for the "YOU #◯" line.
    void leaderboard
      .fetchMe()
      .then((me) => {
        board.applyMyRank({
          alltime: me.alltime,
          weekly: me.weekly,
          score: me.personalBest,
        });
      })
      .catch(() => {
        // A malformed reply costs the rank line only; the board
        // and BACK keep working.
      });
  }
}

/**
 * Result screen (Dango Order) — "Today's Dango Shop".
 *
 * Like Dango Drop's "Today's Dango Shop", a finished shift is reframed
 * as a shop report: the skewers you served were sold, and here is the
 * total. Shows DG earned (counting up), orders served, best combo,
 * best results, and a NEW RECORD badge when a record was broken.
 *
 * v2 — RANKING: when the shared family leaderboard is enabled, the
 * screen grows a RANKING section below the report (the page scrolls,
 * the same drag/wheel scrolling as Dango Drop's shop screen). The
 * score was already submitted by the GameScene without waiting; this
 * screen shows "Loading..." and fills in the board and your rank when
 * the replies arrive. Offline, a plain message shows instead and the
 * rest of the screen works exactly as before.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import { BACKGROUND_KEY } from '../constants/assets';
import type {
  BoardKind,
  LeaderboardEntry,
  SubmitResult,
} from '../leaderboard';
import { bgm } from '../systems/bgm';
import { CURRENCY } from '../systems/EconomyConfig';
import { isRankingEnabled, leaderboard } from '../systems/LeaderboardClient';
import {
  COLOR_ACCENT,
  COLOR_TEXT,
  addSoftPanel,
  bodyText,
  headingText,
  makeButton,
} from './ui';

export const RESULT_SCENE_KEY = 'ResultScene';

export interface ResultData {
  dg: number;
  served: number;
  bestCombo: number;
  bestDG: number;
  bestServed: number;
  bestComboBest: number;
  isNewRecord: boolean;
  /**
   * The in-flight ranking submission for this run (not awaited by the
   * GameScene). Resolves with the player's ranks when the API replies;
   * absent when ranking is disabled.
   */
  submission?: Promise<SubmitResult>;
}

/** Page height when the ranking section is present. */
const CONTENT_HEIGHT_RANKING = 1560;
/** Y of the RANKING heading. */
const RANKING_TOP = 884;
/** First board row Y. */
const BOARD_TOP = 1012;
/** Board row height. */
const ROW_H = 36;

export class ResultScene extends Phaser.Scene {
  private boardObjects: Phaser.GameObjects.GameObject[] = [];
  private tabTexts = new Map<BoardKind, Phaser.GameObjects.Text>();
  private tabLines = new Map<BoardKind, Phaser.GameObjects.Rectangle>();
  private statusText: Phaser.GameObjects.Text | null = null;
  private ownRankText: Phaser.GameObjects.Text | null = null;
  private currentBoard: BoardKind = 'weekly';
  private submitResult: SubmitResult | null = null;
  private runDG = 0;
  private alive = false;

  constructor() {
    super(RESULT_SCENE_KEY);
  }

  create(data: ResultData): void {
    bgm.start('menu');
    this.alive = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.alive = false;
    });
    this.boardObjects = [];
    this.tabTexts.clear();
    this.tabLines.clear();
    this.submitResult = null;
    this.currentBoard = 'weekly';
    this.runDG = data.dg;

    const ranking = isRankingEnabled();
    const contentHeight = ranking ? CONTENT_HEIGHT_RANKING : GAME_HEIGHT;

    // Shop background illustration (drawn first, behind everything).
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKGROUND_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    if (ranking) {
      // Warm paper below the fold, where the ranking lives.
      this.add.rectangle(
        GAME_WIDTH / 2,
        (GAME_HEIGHT + contentHeight) / 2,
        GAME_WIDTH,
        contentHeight - GAME_HEIGHT,
        0xf3e3c8,
        1,
      );
      this.setupScroll(contentHeight);
    }
    // Soft panels keep the headings and the score readable over the art.
    addSoftPanel(this, GAME_WIDTH / 2, 122, 440, 140, 0.45);
    addSoftPanel(this, GAME_WIDTH / 2, 318, 460, 190, 0.5);

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

    // The day's takings count up — the register filling, in numbers.
    const dgText = this.add
      .text(GAME_WIDTH / 2, 292, `0 ${CURRENCY}`, {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '64px',
        color: '#5a3a28',
      })
      .setOrigin(0.5);
    const counter = { value: 0 };
    this.tweens.add({
      targets: counter,
      value: data.dg,
      duration: Math.min(1200, 350 + data.dg * 0.6),
      ease: 'Sine.easeOut',
      onUpdate: () => {
        dgText.setText(`${Math.round(counter.value)} ${CURRENCY}`);
      },
      onComplete: () => {
        dgText.setText(`${data.dg} ${CURRENCY}`);
      },
    });
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

    if (ranking) {
      this.drawRankingSection(data);
    }
  }

  // ----- scrolling (mirrors Dango Drop's shop screen) ----------------

  private setupScroll(contentHeight: number): void {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, GAME_WIDTH, contentHeight);
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      camera.scrollY -= pointer.y - pointer.prevPosition.y;
    });
    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _objects: Phaser.GameObjects.GameObject[],
        _dx: number,
        dy: number,
      ) => {
        camera.scrollY += dy * 0.5;
      },
    );
  }

  // ----- ranking -------------------------------------------------------

  private drawRankingSection(data: ResultData): void {
    headingText(this, GAME_WIDTH / 2, RANKING_TOP, 'RANKING', 32);

    // Tabs: WEEKLY first — a fresh board every week is the main one
    // (the family rule from Dango Drop's ranking, ADR-0013).
    const tabs: [BoardKind, string, number][] = [
      ['weekly', 'WEEKLY', GAME_WIDTH / 2 - 105],
      ['alltime', 'ALL TIME', GAME_WIDTH / 2 + 105],
    ];
    for (const [kind, label, x] of tabs) {
      const text = this.add
        .text(x, RANKING_TOP + 52, label, {
          fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
          fontSize: '21px',
          color: COLOR_TEXT,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      const line = this.add.rectangle(x, RANKING_TOP + 74, 120, 4, 0xe86a7a, 1);
      text.on('pointerup', () => {
        if (kind !== this.currentBoard) {
          this.currentBoard = kind;
          this.refreshTabs();
          this.loadBoard();
        }
      });
      this.tabTexts.set(kind, text);
      this.tabLines.set(kind, line);
    }
    this.refreshTabs();

    this.ownRankText = this.add
      .text(GAME_WIDTH / 2, RANKING_TOP + 104, '', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '19px',
        fontStyle: 'bold',
        color: COLOR_ACCENT,
      })
      .setOrigin(0.5);

    this.statusText = this.add
      .text(GAME_WIDTH / 2, BOARD_TOP + 40, 'Loading...', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '20px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5);

    makeButton(
      this,
      GAME_WIDTH / 2,
      CONTENT_HEIGHT_RANKING - 64,
      300,
      72,
      'PLAY AGAIN',
      () => {
        this.scene.start('GameScene');
      },
    );

    // The submission was fired by the GameScene; fill the rank in
    // when it lands.
    if (data.submission) {
      void data.submission.then((result) => {
        if (!this.alive) return;
        this.submitResult = result;
        this.refreshOwnRankLine();
        // The board may have been drawn before our own score was
        // registered; redraw so the YOU highlight is right.
        this.loadBoard();
      });
    }
    this.loadBoard();
  }

  private refreshTabs(): void {
    for (const [kind, text] of this.tabTexts) {
      const active = kind === this.currentBoard;
      text.setColor(active ? COLOR_ACCENT : COLOR_TEXT);
      this.tabLines.get(kind)?.setVisible(active);
    }
  }

  private refreshOwnRankLine(): void {
    if (!this.ownRankText || !this.submitResult) return;
    const { weekly, alltime, online } = this.submitResult;
    if (!online) {
      this.ownRankText.setText('');
      return;
    }
    const formatRank = (
      label: string,
      info: { rank: number | null; percentile: number | null } | null,
    ): string | null => {
      if (!info || info.rank == null) return null;
      const top =
        info.percentile != null ? ` (top ${info.percentile}%)` : '';
      return `${label} #${info.rank}${top}`;
    };
    const parts = [
      formatRank('WEEKLY', weekly),
      formatRank('ALL TIME', alltime),
    ].filter((part): part is string => part !== null);
    this.ownRankText.setText(
      parts.length > 0 ? `Your rank: ${parts.join('  ·  ')}` : '',
    );
  }

  private clearBoard(): void {
    for (const obj of this.boardObjects) obj.destroy();
    this.boardObjects = [];
  }

  private loadBoard(): void {
    const kind = this.currentBoard;
    this.clearBoard();
    this.statusText?.setText('Loading...').setVisible(true);
    void leaderboard.fetchLeaderboard(kind, 10).then((board) => {
      if (!this.alive || kind !== this.currentBoard) return;
      this.clearBoard();
      if (!board.online && board.entries.length === 0) {
        this.statusText?.setText('Could not load ranking').setVisible(true);
        return;
      }
      if (board.entries.length === 0) {
        this.statusText
          ?.setText('No scores yet — be the first!')
          .setVisible(true);
        return;
      }
      this.statusText?.setVisible(false);
      board.entries.forEach((entry, i) => {
        this.drawBoardRow(entry, BOARD_TOP + i * ROW_H, entry.is_you === true);
      });
      // Out of the top 10? Your own row goes under a divider, from
      // the submission's rank for this board (Dango Drop does the
      // same).
      const rankInfo =
        kind === 'weekly'
          ? this.submitResult?.weekly
          : this.submitResult?.alltime;
      const inTop = board.entries.some((e) => e.is_you === true);
      if (!inTop && rankInfo?.rank != null && rankInfo.rank > 10) {
        const y = BOARD_TOP + board.entries.length * ROW_H + 14;
        const divider = this.add.rectangle(
          GAME_WIDTH / 2,
          y - ROW_H / 2,
          420,
          2,
          0xc89b6a,
          1,
        );
        this.boardObjects.push(divider);
        this.drawBoardRow(
          {
            rank: rankInfo.rank,
            player_id: '',
            display_name: 'YOU',
            score: this.runDG,
            is_you: true,
          },
          y,
          true,
        );
      }
    });
  }

  private drawBoardRow(
    entry: LeaderboardEntry,
    y: number,
    highlight: boolean,
  ): void {
    const color = highlight ? COLOR_ACCENT : COLOR_TEXT;
    const rank = this.add
      .text(GAME_WIDTH / 2 - 200, y, `${entry.rank}.`, {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color,
      })
      .setOrigin(0, 0.5);
    const name = this.add
      .text(GAME_WIDTH / 2 - 150, y, entry.display_name, {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '20px',
        fontStyle: highlight ? 'bold' : 'normal',
        color,
      })
      .setOrigin(0, 0.5);
    const score = this.add
      .text(GAME_WIDTH / 2 + 200, y, `${entry.score} ${CURRENCY}`, {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color,
      })
      .setOrigin(1, 0.5);
    this.boardObjects.push(rank, name, score);
  }
}

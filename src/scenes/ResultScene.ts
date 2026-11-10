/**
 * Result screen (Dango Order) — "Today's Dango Shop".
 *
 * Like Dango Drop's "Today's Dango Shop", a finished shift is
 * reframed as a shop report: the skewers you served were sold, and
 * here is the total.
 *
 * v4 — redesigned after Dango Tower v3.7's result screen (which
 * follows Dango Drop's current one):
 *   - The report is a cream "receipt" panel (rounded, brown border,
 *     inner frame) with dango art on the stat rows and a customer
 *     animal peeking from its corner, a TOTAL row with a gold coin
 *     and a count-up, a BEST SCORE row, and a blinking gold
 *     "★ NEW RECORD! ★" when a record was broken.
 *   - PLAY AGAIN / TITLE live in a fixed header bar that stays on
 *     screen while the page scrolls (plus a PLAY AGAIN at the very
 *     bottom), the Dango Drop way.
 *   - The RANKING section is the shared RankingBoard panel — the
 *     same component as the title's RankingScene, name button and
 *     all. The score was already submitted by the GameScene without
 *     waiting; the board waits for that promise before its first
 *     load, and the rank line fills in when the reply arrives.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import { BACKGROUND_KEY, animalKey } from '../constants/assets';
import { FONT_BODY, FONT_HEADING } from '../constants/fonts';
import type { SubmitResult } from '../leaderboard';
import { bgm } from '../systems/bgm';
import { CURRENCY } from '../systems/EconomyConfig';
import { isRankingEnabled } from '../systems/LeaderboardClient';
import { sound } from '../systems/sound';
import { RankingBoard } from '../ui/RankingBoard';
import { COLOR_TEXT, addSoftPanel, headingText, makeButton } from './ui';

export const RESULT_SCENE_KEY = 'ResultScene';

export interface ResultData {
  /** Total DG for the run. */
  dg: number;
  /** Orders (customers) served during the shift. */
  served: number;
  /** Individual skewers served (display only; not a ranking stat). */
  skewersServed: number;
  /** Golden (VIP) skewers served during the shift. */
  goldenSkewers: number;
  /** Best combo reached during the shift. */
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

/** Depth of the fixed header (always above the scrolling page). */
const FIXED_UI_DEPTH = 200;

/** Page height when the ranking section is present. */
const CONTENT_HEIGHT_RANKING = 1330;

/** Receipt panel geometry (the sales report). */
const RECEIPT = { x: 30, y: 244, width: 480, height: 470, radius: 16 } as const;

/** Ranking panel geometry (shared RankingBoard). */
const RANKING = { x: 30, y: 754, width: 480, height: 466, maxRows: 10 } as const;

const COLOR = {
  border: 0x5a3a28,
  borderSoft: 0xc89b6a,
  goldText: '#d98a1c',
  totalText: '#c2434f',
  subText: '#a08060',
} as const;

const TOTAL_COUNT_UP_MS = 900;
const TOTAL_COUNT_UP_DELAY_MS = 250;

export class ResultScene extends Phaser.Scene {
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

    this.drawHeading();
    this.drawReceipt(data);
    if (ranking) {
      this.drawRankingSection(data);
      makeButton(
        this,
        GAME_WIDTH / 2,
        CONTENT_HEIGHT_RANKING - 54,
        300,
        72,
        'PLAY AGAIN',
        () => {
          this.scene.start('GameScene');
        },
      );
    }
    // Fixed header last: it floats above the scrolling page.
    this.drawFixedHeader();
  }

  // ----- heading -------------------------------------------------------

  private drawHeading(): void {
    addSoftPanel(this, GAME_WIDTH / 2, 168, 460, 148, 0.45);
    headingText(this, GAME_WIDTH / 2, 140, "Today's", 34);
    headingText(this, GAME_WIDTH / 2, 192, 'Dango Shop', 46);
  }

  // ----- fixed header (PLAY AGAIN / TITLE, always reachable) ----------

  private drawFixedHeader(): void {
    const buttonY = 48;
    const buttonW = 202;
    const buttonH = 46;
    const gap = 14;
    const barHeight = buttonY + buttonH / 2 + 14;

    const backing = this.add.graphics();
    backing.fillStyle(0xfff7e6, 0.92);
    backing.fillRect(0, 0, GAME_WIDTH, barHeight);
    backing.lineStyle(2, COLOR.borderSoft, 0.6);
    backing.lineBetween(0, barHeight, GAME_WIDTH, barHeight);
    backing.setScrollFactor(0).setDepth(FIXED_UI_DEPTH);

    const leftCenterX = GAME_WIDTH / 2 - (buttonW * 2 + gap) / 2 + buttonW / 2;
    this.drawFixedButton(
      leftCenterX,
      buttonY,
      buttonW,
      buttonH,
      'PLAY AGAIN',
      0xe86a7a,
      () => this.scene.start('GameScene'),
    );
    this.drawFixedButton(
      leftCenterX + buttonW + gap,
      buttonY,
      buttonW,
      buttonH,
      'TITLE',
      0x8a5a34,
      () => this.scene.start('TitleScene'),
    );
  }

  private drawFixedButton(
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    label: string,
    fillColor: number,
    onTap: () => void,
  ): void {
    // Flat fill, not a gradient: Phaser's canvas renderer washes
    // Graphics gradients out to near-white, and flat color matches
    // the menu buttons' look anyway.
    const frame = this.add.graphics();
    frame.fillStyle(fillColor, 1);
    frame.fillRoundedRect(centerX - width / 2, centerY - height / 2, width, height, 12);
    frame.lineStyle(2.5, COLOR.border);
    frame.strokeRoundedRect(centerX - width / 2, centerY - height / 2, width, height, 12);
    frame.setScrollFactor(0).setDepth(FIXED_UI_DEPTH);

    this.add
      .text(centerX, centerY, label, {
        fontFamily: FONT_HEADING,
        fontSize: '17px',
        color: '#ffffff',
        letterSpacing: 1,
      })
      .setOrigin(0.5)
      .setShadow(0, 2, 'rgba(0,0,0,0.28)', 2)
      .setScrollFactor(0)
      .setDepth(FIXED_UI_DEPTH);

    const hit = this.add
      .rectangle(centerX, centerY, width, height, 0xffffff, 0)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(FIXED_UI_DEPTH);
    this.bindTap(hit, onTap);
  }

  /** Tap = pointerup without a drag (scrolling must not fire buttons). */
  private bindTap(target: Phaser.GameObjects.GameObject, onTap: () => void): void {
    target.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 12) {
        sound.unlock();
        sound.click();
        onTap();
      }
    });
  }

  // ----- receipt (the sales report) -------------------------------------

  private drawReceipt(data: ResultData): void {
    const r = RECEIPT;

    // Cream paper with a brown border and a thin inner frame — the
    // shop-sign look from Dango Drop's receipt.
    const panel = this.add.graphics();
    panel.fillStyle(0xfff7e6, 0.97);
    panel.fillRoundedRect(r.x, r.y, r.width, r.height, r.radius);
    panel.lineStyle(4, COLOR.border);
    panel.strokeRoundedRect(r.x, r.y, r.width, r.height, r.radius);
    panel.lineStyle(1.5, COLOR.borderSoft, 0.55);
    panel.strokeRoundedRect(r.x + 8, r.y + 8, r.width - 16, r.height - 16, r.radius - 5);

    this.add
      .text(GAME_WIDTH / 2, r.y + 38, "TODAY'S SALES", {
        fontFamily: FONT_HEADING,
        fontSize: '22px',
        color: COLOR_TEXT,
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, r.y + 64, 'sold at the shop today!', {
        fontFamily: FONT_BODY,
        fontSize: '13px',
        fontStyle: 'bold',
        color: COLOR.subText,
      })
      .setOrigin(0.5);
    // A customer friend peeks from the receipt's corner — the shop's
    // regulars are part of the report now.
    this.add
      .image(r.x + r.width - 52, r.y + 44, animalKey('rabbit'))
      .setDisplaySize(62, 62);

    // Stat rows: little art on the left, label, value on the right.
    this.drawStatRow(r.y + 108, 'stack', 'Orders served', `${data.served}`);
    this.drawStatRow(r.y + 152, 'sakura', 'Skewers served', `${data.skewersServed}`);
    this.drawStatRow(r.y + 196, 'mitarashi', 'Max combo', `x${data.bestCombo}`);
    this.drawStatRow(
      r.y + 240,
      'golden',
      'Golden skewers',
      `${data.goldenSkewers}`,
      true,
    );

    const divider1 = this.add.graphics();
    divider1.lineStyle(2, COLOR.border, 0.65);
    divider1.lineBetween(r.x + 28, r.y + 276, r.x + r.width - 28, r.y + 276);
    this.drawTotalRow(data.dg, r.y + 312);

    const divider2 = this.add.graphics();
    divider2.lineStyle(1.5, COLOR.border, 0.35);
    divider2.lineBetween(r.x + 28, r.y + 354, r.x + r.width - 28, r.y + 354);
    this.drawBestRow(data, r.y + 384);
    this.add
      .text(
        GAME_WIDTH / 2,
        r.y + 412,
        `Best served ${data.bestServed}  ·  Best combo x${data.bestComboBest}`,
        {
          fontFamily: FONT_BODY,
          fontSize: '13px',
          fontStyle: 'bold',
          color: COLOR.subText,
        },
      )
      .setOrigin(0.5);

    if (data.isNewRecord) {
      const newRecord = this.add
        .text(GAME_WIDTH / 2, r.y + 440, '★ NEW RECORD! ★', {
          fontFamily: FONT_HEADING,
          fontSize: '16px',
          color: COLOR.goldText,
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: newRecord,
        alpha: 0.3,
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /**
   * One stat row. `art` picks the little picture on the left: a
   * mini stack of dango, one dango face, or the golden dango.
   */
  private drawStatRow(
    y: number,
    art: 'stack' | 'sakura' | 'mitarashi' | 'golden',
    label: string,
    value: string,
    isGold = false,
  ): void {
    const r = RECEIPT;
    const artX = r.x + 54;
    if (art === 'stack') {
      this.add.image(artX, y - 9, 'shiratama').setDisplaySize(26, 26);
      this.add.image(artX, y + 11, 'anko').setDisplaySize(26, 26);
    } else {
      this.add.image(artX, y, art).setDisplaySize(32, 32);
    }
    this.add
      .text(r.x + 88, y, label, {
        fontFamily: FONT_HEADING,
        fontSize: '17px',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(r.x + r.width - 28, y, value, {
        fontFamily: FONT_HEADING,
        fontSize: '20px',
        color: isGold ? COLOR.goldText : COLOR_TEXT,
      })
      .setOrigin(1, 0.5);
  }

  /** TOTAL row: a gold coin and the total counting up, register-style. */
  private drawTotalRow(totalDG: number, y: number): void {
    const r = RECEIPT;
    this.drawCoin(r.x + 54, y, 15);
    this.add
      .text(r.x + 82, y, 'TOTAL', {
        fontFamily: FONT_HEADING,
        fontSize: '20px',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0.5);

    const totalText = this.add
      .text(r.x + r.width - 28, y, `0 ${CURRENCY}`, {
        fontFamily: FONT_HEADING,
        fontSize: '34px',
        color: COLOR.totalText,
      })
      .setOrigin(1, 0.5);

    if (totalDG <= 0) {
      totalText.setText(`0 ${CURRENCY}`);
      return;
    }
    const counter = { value: 0 };
    this.tweens.add({
      targets: counter,
      value: totalDG,
      duration: TOTAL_COUNT_UP_MS,
      delay: TOTAL_COUNT_UP_DELAY_MS,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        totalText.setText(`${Math.floor(counter.value).toLocaleString()} ${CURRENCY}`);
      },
      onComplete: () => {
        totalText.setText(`${totalDG.toLocaleString()} ${CURRENCY}`);
        // A little hop when the register finishes.
        this.tweens.add({
          targets: totalText,
          scale: 1.12,
          duration: 140,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
      },
    });

    // Coins pop while the total counts up — DG being handed over.
    for (let i = 0; i < 5; i += 1) {
      this.time.delayedCall(TOTAL_COUNT_UP_DELAY_MS + i * 140, () => {
        if (this.alive) this.popCoin(r.x + 54, y);
      });
    }
  }

  private drawBestRow(data: ResultData, y: number): void {
    const r = RECEIPT;
    this.add
      .text(r.x + 28, y, 'BEST SCORE', {
        fontFamily: FONT_HEADING,
        fontSize: '17px',
        color: COLOR.subText,
      })
      .setOrigin(0, 0.5);
    this.add
      .text(r.x + r.width - 28, y, `${data.bestDG.toLocaleString()} ${CURRENCY}`, {
        fontFamily: FONT_HEADING,
        fontSize: '22px',
        color: COLOR.subText,
      })
      .setOrigin(1, 0.5);
  }

  /** One gold coin (gold body, pale highlight, darker rim). */
  private drawCoin(x: number, y: number, radius: number): Phaser.GameObjects.Container {
    const coin = this.add.container(x, y);
    const body = this.add.circle(0, 0, radius, 0xe8a832);
    const highlight = this.add.circle(-radius * 0.28, -radius * 0.3, radius * 0.55, 0xffe9a8, 0.85);
    const rim = this.add.circle(0, 0, radius).setStrokeStyle(2.5, 0xb47c1c);
    coin.add([body, highlight, rim]);
    return coin;
  }

  /** A coin floats up and fades — the "sold!" moment. */
  private popCoin(x: number, y: number): void {
    const coin = this.drawCoin(x, y, 12);
    const drift = Phaser.Math.Between(-26, 26);
    this.tweens.add({
      targets: coin,
      x: x + drift,
      y: y - 46,
      alpha: 0,
      scale: 0.6,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => coin.destroy(),
    });
  }

  // ----- ranking ---------------------------------------------------------

  private drawRankingSection(data: ResultData): void {
    const board = new RankingBoard(this, RANKING);
    if (!board.create(data.submission)) return;
    void data.submission
      ?.then((result) => {
        if (!this.alive) return;
        if (result.online) {
          board.applyMyRank({
            alltime: result.alltime,
            weekly: result.weekly,
            score: data.dg,
          });
        }
      })
      .catch(() => {});
  }

  // ----- scrolling (mirrors Dango Drop's shop screen) --------------------

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
}

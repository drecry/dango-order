/**
 * Game scene (Dango Order) — the full-screen play area.
 *
 * A 60-second shift at the dango shop. Customers arrive with a skewer
 * order (a sequence of dango). Tap the dango on the pad, bottom-up in
 * the exact order shown, to build the skewer, then serve it. Serve
 * correctly and quickly for a wait bonus; consecutive serves build a
 * combo. A Matcha order adds +3 seconds. A Golden order is a VIP worth
 * 2x sales. Later in the shift, 4-skewer orders appear.
 *
 * The play area fills the whole phone screen over the shop
 * illustration: a slim HUD on top (DG, time, served, combo, sound,
 * pause), the customer with their order in a speech bubble, your
 * skewer in the middle, and the dango pad resting on the counter.
 * Rules and introductions live on their own screens (Title -> How to
 * Play / Meet the Dango).
 *
 * All rules (orders, DG, patience, timer) come from the pure logic in
 * src/logic/order.ts and the JSON configs — this scene only renders.
 *
 * v2 polish: the customer is a dango friend who slides in, orders via
 * a speech bubble and reacts — happy when served, sad when they
 * leave, angry at a wrong tap (Shiratama / Sakura / Yomogi have
 * expression art; the others keep their usual face). Tapped dango
 * hop onto the skewer along a little arc; a finished skewer flies
 * to the customer with sparkles. Sounds and BGM are the v2 synth
 * set (systems/sound.ts, systems/bgm.ts), and the score goes to the
 * shared family ranking at closing time.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import type { DangoKind } from '../constants/assets';
import {
  ALL_DANGO_KINDS,
  BACKGROUND_KEY,
  DANGO_INFO,
  REGULAR_KINDS,
  expressionKey,
  hasExpressions,
} from '../constants/assets';
import {
  applyLeave,
  applyServe,
  hasMatcha,
  initialState,
  isVipOrder,
  rollOrder,
  tick,
  type Balance,
  type Economy,
  type Order,
  type OrderState,
} from '../logic/order';
import { saveBest } from '../logic/storage';
import { bgm } from '../systems/bgm';
import { CURRENCY, loadBalance, loadEconomy } from '../systems/EconomyConfig';
import { isRankingEnabled, leaderboard } from '../systems/LeaderboardClient';
import {
  buildScoreStats,
  toDurationSec,
} from '../systems/ScoreSubmission';
import { sound } from '../systems/sound';
import { COLOR_TEXT, addSoftPanel, makeIconButton } from './ui';

export const GAME_SCENE_KEY = 'GameScene';

const HUD_TOP = 20;
const PAD_KINDS: readonly DangoKind[] = ALL_DANGO_KINDS;

/** Where the customer stands (portrait center) inside the panel. */
const CUSTOMER_X = 92;
const CUSTOMER_Y = 205;
/** Skewer geometry (v1): stick center, plate, bottom dango slot. */
const SKEWER_X = GAME_WIDTH / 2;
const SKEWER_BOTTOM_Y = 552;
const SKEWER_STEP = 56;

/** What the last serve earned — read by the debug hook / playtests. */
export interface LastServe {
  order: DangoKind[];
  patienceLeft: number;
  combo: number;
  earnedDG: number;
  isVip: boolean;
  timeBonus: number;
}

interface PadCard {
  container: Phaser.GameObjects.Container;
  x: number;
  y: number;
}

export class GameScene extends Phaser.Scene {
  private economy: Economy = loadEconomy();
  private balance: Balance = loadBalance();
  private state: OrderState = initialState();
  private order: Order = [];
  private built: DangoKind[] = [];
  /** Dango currently flying to the skewer (tapped, not yet landed). */
  private inFlight = 0;
  /** Bumped per customer so stale flying dango can be discarded. */
  private customerSeq = 0;
  private customerKind: DangoKind = 'shiratama';
  private patience = 0;
  private paused = false;
  private over = false;
  private betweenCustomers = false;
  /** Real elapsed play time (for the ranking stats). */
  private playElapsedMs = 0;
  /** VIP (Golden) orders served this shift (ranking stats). */
  private goldenServed = 0;
  private lastServe: LastServe | null = null;
  /** Last whole second shown, for the countdown tick. */
  private lastWholeSec = -1;

  private dgText: Phaser.GameObjects.Text | null = null;
  private timeText: Phaser.GameObjects.Text | null = null;
  private servedText: Phaser.GameObjects.Text | null = null;
  private comboText: Phaser.GameObjects.Text | null = null;
  private customerText: Phaser.GameObjects.Text | null = null;
  private customerPortrait: Phaser.GameObjects.Image | null = null;
  private customerRing: Phaser.GameObjects.Arc | null = null;
  private patienceFill: Phaser.GameObjects.Rectangle | null = null;
  private patienceText: Phaser.GameObjects.Text | null = null;
  private messageText: Phaser.GameObjects.Text | null = null;
  private orderSlots: Phaser.GameObjects.Container | null = null;
  private bubbleGraphics: Phaser.GameObjects.Graphics | null = null;
  private skewer: Phaser.GameObjects.Container | null = null;
  private skewerImages: Phaser.GameObjects.Image[] = [];
  private customerPanel: Phaser.GameObjects.Container | null = null;
  private pauseOverlay: Phaser.GameObjects.Container | null = null;
  private soundText: Phaser.GameObjects.Text | null = null;
  private padCards = new Map<DangoKind, PadCard>();

  constructor() {
    super(GAME_SCENE_KEY);
  }

  create(): void {
    bgm.start('game');
    this.economy = loadEconomy();
    this.balance = loadBalance();
    this.state = initialState(this.balance);
    this.order = [];
    this.built = [];
    this.inFlight = 0;
    this.customerSeq = 0;
    this.patience = this.balance.patienceSeconds;
    this.paused = false;
    this.over = false;
    this.betweenCustomers = false;
    this.playElapsedMs = 0;
    this.goldenServed = 0;
    this.lastServe = null;
    this.lastWholeSec = -1;
    this.padCards.clear();
    this.skewerImages = [];

    // Shop background illustration (drawn first, behind everything).
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKGROUND_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    this.buildHud();
    this.buildCustomerPanel();
    this.buildSkewerArea();
    this.buildPad();
    this.buildPauseOverlay();
    this.newCustomer(true);

    // Debug hook for automated playtests (used by the headless
    // Chromium playtest; harmless in production). `setOrder` replaces
    // the current customer's order, `forceTimeLeft` jumps the clock,
    // and `getLastServe` reports the last serve for DG hand-checks.
    (
      window as unknown as {
        __dangoOrder?: {
          getOrder: () => DangoKind[];
          getBuilt: () => DangoKind[];
          getState: () => OrderState;
          getPatience: () => number;
          tap: (kind: DangoKind) => void;
          setOrder: (order: DangoKind[]) => void;
          forceTimeLeft: (seconds: number) => void;
          getLastServe: () => LastServe | null;
          getCustomerKind: () => DangoKind;
        };
      }
    ).__dangoOrder = {
      getOrder: () => [...this.order],
      getBuilt: () => [...this.built],
      getState: () => ({ ...this.state }),
      getPatience: () => this.patience,
      tap: (kind: DangoKind) => this.tapKind(kind),
      setOrder: (order: DangoKind[]) => this.debugSetOrder(order),
      forceTimeLeft: (seconds: number) => {
        this.state = { ...this.state, timeLeft: seconds };
      },
      getLastServe: () => this.lastServe,
      getCustomerKind: () => this.customerKind,
    };

    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-M', () => this.toggleSound());
    PAD_KINDS.forEach((kind, i) => {
      this.input.keyboard?.on(`keydown-${i + 1}`, () => this.tapKind(kind));
    });
  }

  update(_time: number, deltaMs: number): void {
    if (this.paused || this.over) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.playElapsedMs += dt * 1000;
    this.state = tick(this.state, dt, this.balance);
    if (!this.betweenCustomers) {
      this.patience = Math.max(0, this.patience - dt);
      this.updatePatienceBar();
      if (this.patience <= 0) {
        this.loseCustomer();
      }
    }
    this.updateTimeText();
    this.updateCountdown();
    if (this.state.over) {
      this.endGame();
    }
  }

  /** Last-10-seconds drama: a tick each second + a pulsing timer. */
  private updateCountdown(): void {
    const whole = Math.ceil(this.state.timeLeft);
    if (whole === this.lastWholeSec) return;
    this.lastWholeSec = whole;
    if (whole <= 10 && whole > 0 && !this.over) {
      sound.tick(whole <= 3);
      if (this.timeText) {
        this.tweens.killTweensOf(this.timeText);
        this.timeText.setScale(1.3);
        this.tweens.add({
          targets: this.timeText,
          scale: 1,
          duration: 220,
          ease: 'Sine.easeOut',
        });
      }
    }
  }

  // ----- customers ----------------------------------------------------

  private newCustomer(first = false): void {
    if (this.over) return;
    this.customerSeq += 1;
    this.order = rollOrder(this.state.served, this.economy, this.balance);
    this.built = [];
    this.inFlight = 0;
    this.patience = this.balance.patienceSeconds;
    this.betweenCustomers = false;
    // A random everyday friend walks in (cosmetic — the order itself
    // is rolled by the rules, independent of who asks for it).
    this.customerKind =
      REGULAR_KINDS[Math.floor(Math.random() * REGULAR_KINDS.length)];
    this.setPortrait('base');
    this.setMessage('', '#5a3a28');
    this.renderCustomer();
    this.renderSkewer();
    this.updatePatienceBar();
    // Slide in from the left (the shop door is by the noren).
    if (this.customerPanel) {
      this.tweens.killTweensOf(this.customerPanel);
      this.customerPanel.setAlpha(1);
      this.customerPanel.setX(-GAME_WIDTH);
      this.tweens.add({
        targets: this.customerPanel,
        x: 0,
        duration: first ? 450 : 320,
        ease: 'Back.easeOut',
      });
    }
  }

  /** Swap the customer's face (variants exist for 3 kinds only). */
  private setPortrait(face: 'base' | 'happy' | 'sad' | 'angry'): void {
    if (!this.customerPortrait) return;
    if (face !== 'base' && hasExpressions(this.customerKind)) {
      this.customerPortrait.setTexture(
        expressionKey(this.customerKind, face),
      );
    } else {
      this.customerPortrait.setTexture(this.customerKind);
    }
  }

  private tapKind(kind: DangoKind): void {
    if (this.paused || this.over || this.betweenCustomers) return;
    const progress = this.built.length + this.inFlight;
    // The skewer is already full (last dango still landing): ignore
    // extra taps rather than punishing a fast double-tap as "wrong".
    if (progress >= this.order.length) return;
    const want = this.order[progress];
    if (kind === want) {
      sound.pick(kind, progress);
      this.flyDangoToSkewer(kind, progress);
      return;
    }
    // Wrong dango: the customer loses patience.
    sound.wrong();
    this.patience = Math.max(
      0,
      this.patience - this.balance.wrongTapPenaltySeconds,
    );
    this.setMessage('Wrong dango! The customer is waiting...', '#e86a7a');
    this.updatePatienceBar();
    this.flashPadCard(kind, false);
    // The customer scowls (when they have the face for it).
    const seq = this.customerSeq;
    this.setPortrait('angry');
    if (this.customerPortrait) {
      this.tweens.add({
        targets: this.customerPortrait,
        x: CUSTOMER_X - 5,
        duration: 55,
        yoyo: true,
        repeat: 3,
        onComplete: () => this.customerPortrait?.setX(CUSTOMER_X),
      });
    }
    this.time.delayedCall(700, () => {
      if (seq === this.customerSeq && !this.betweenCustomers) {
        this.setPortrait('base');
      }
    });
    if (this.patience <= 0) {
      this.loseCustomer();
    }
  }

  /**
   * Juice: a tapped dango hops from its pad card onto the skewer
   * along a little arc, then squashes as it lands. The dango only
   * counts as built once it lands, but taps are validated against
   * built + in-flight, so fast play is never punished.
   */
  private flyDangoToSkewer(kind: DangoKind, slotIndex: number): void {
    const seq = this.customerSeq;
    this.inFlight += 1;
    const card = this.padCards.get(kind);
    const startX = card ? card.x : GAME_WIDTH / 2;
    const startY = card ? card.y - 28 : 700;
    const endX = SKEWER_X;
    const endY = SKEWER_BOTTOM_Y - slotIndex * SKEWER_STEP;
    const clone = this.add
      .image(startX, startY, kind)
      .setDisplaySize(64, 64)
      .setDepth(40);
    const baseScale = clone.scaleX;
    const midX = (startX + endX) / 2;
    const midY = Math.min(startY, endY) - 110;
    const flight = { t: 0 };
    this.tweens.add({
      targets: flight,
      t: 1,
      duration: 240,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const t = flight.t;
        const u = 1 - t;
        clone.setPosition(
          u * u * startX + 2 * u * t * midX + t * t * endX,
          u * u * startY + 2 * u * t * midY + t * t * endY,
        );
        // A little stretch along the hop (relative to display scale).
        const stretch = 1 + Math.sin(t * Math.PI) * 0.15;
        clone.setScale(baseScale * stretch, baseScale / stretch);
      },
      onComplete: () => {
        clone.destroy();
        if (seq !== this.customerSeq) return;
        this.inFlight = Math.max(0, this.inFlight - 1);
        if (this.betweenCustomers || this.over) return;
        this.built.push(kind);
        this.renderSkewer(true);
        this.renderCustomer();
        if (this.built.length === this.order.length) {
          this.serveOrder();
        }
      },
    });
    this.renderCustomer();
  }

  private serveOrder(): void {
    this.betweenCustomers = true;
    const patienceLeft = this.patience;
    const result = applyServe(
      this.state,
      this.order,
      patienceLeft,
      this.economy,
      this.balance,
    );
    this.state = result.state;
    this.lastServe = {
      order: [...this.order],
      patienceLeft,
      combo: this.state.combo,
      earnedDG: result.earnedDG,
      isVip: result.isVip,
      timeBonus: result.timeBonus,
    };
    if (result.isVip) {
      this.goldenServed += 1;
      sound.vip();
      this.setMessage(
        `VIP order! +${result.earnedDG} ${CURRENCY} (2x sales)`,
        '#c89b00',
      );
    } else {
      sound.serve(this.state.combo);
      this.setMessage(`Served! +${result.earnedDG} ${CURRENCY}`, '#5a8a4a');
    }
    if (result.timeBonus > 0) {
      sound.timeBonus();
    }
    // The customer beams, and the skewer flies over to them.
    this.setPortrait('happy');
    if (this.customerPortrait) {
      const base = this.customerPortrait.scaleX;
      this.tweens.add({
        targets: this.customerPortrait,
        scaleX: base * 1.14,
        scaleY: base * 1.14,
        duration: 150,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeOut',
        onComplete: () =>
          this.customerPortrait?.setScale(base, base),
      });
    }
    this.flySkewerToCustomer();
    this.sparkleAt(CUSTOMER_X, CUSTOMER_Y);
    this.floatText(
      GAME_WIDTH / 2,
      330,
      `+${result.earnedDG} ${CURRENCY}`,
      '#5a8a4a',
      26,
    );
    if (result.timeBonus > 0) {
      this.floatText(
        GAME_WIDTH / 2,
        372,
        `Matcha Time! +${result.timeBonus}s`,
        '#5a8a4a',
        19,
      );
    }
    this.popCombo();
    this.updateHud();
    this.time.delayedCall(640, () => this.newCustomer());
  }

  /** The finished skewer arcs over to the customer and is gone. */
  private flySkewerToCustomer(): void {
    if (!this.skewer) return;
    const skewer = this.skewer;
    // The skewer's children sit at absolute coordinates inside the
    // container, so the container offset must account for the
    // shrink: land the stack's anchor point (270, 480) on the
    // customer at the final scale.
    const finalScale = 0.55;
    const anchorX = SKEWER_X;
    const anchorY = 480;
    const targetX = CUSTOMER_X + 34;
    const targetY = CUSTOMER_Y + 12;
    this.tweens.add({
      targets: skewer,
      x: targetX - anchorX * finalScale,
      y: targetY - anchorY * finalScale,
      scale: finalScale,
      alpha: 0.25,
      duration: 420,
      ease: 'Sine.easeIn',
      onComplete: () => {
        skewer.setPosition(0, 0).setScale(1).setAlpha(1);
        this.built = [];
        this.renderSkewer();
      },
    });
  }

  /** A burst of happy sparkles around a point (serve celebration). */
  private sparkleAt(x: number, y: number): void {
    const colors = [0xf5c542, 0xf6a8b8, 0xfff7e6, 0x8fbf7f];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 52 + Math.random() * 46;
      const dot = this.add
        .circle(x, y, 4 + Math.random() * 4, colors[i % colors.length], 1)
        .setDepth(35);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist - 14,
        alpha: 0,
        scale: 0.4,
        duration: 480 + Math.random() * 220,
        ease: 'Sine.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  private loseCustomer(): void {
    if (this.betweenCustomers) return;
    this.betweenCustomers = true;
    sound.miss();
    this.setPortrait('sad');
    this.state = applyLeave(this.state).state;
    this.setMessage('The customer left... Next customer!', '#e86a7a');
    this.updateHud();
    // The disappointed customer slides away to the right.
    if (this.customerPanel) {
      this.tweens.killTweensOf(this.customerPanel);
      this.tweens.add({
        targets: this.customerPanel,
        x: GAME_WIDTH,
        alpha: 0,
        duration: 300,
        ease: 'Sine.easeIn',
      });
    }
    this.time.delayedCall(560, () => this.newCustomer());
  }

  private endGame(): void {
    if (this.over) return;
    this.over = true;
    sound.gameOver();
    const dg = this.state.totalDG;
    const { best, isNewRecord } = saveBest(
      dg,
      this.state.served,
      this.state.bestCombo,
    );
    // Ranking submission (the Dango Drop way, ADR-0013): fired
    // WITHOUT awaiting — the result screen opens immediately and
    // the rank is filled in when the reply arrives. Offline or
    // disabled, the promise still resolves.
    const submission = isRankingEnabled()
      ? leaderboard.submitScore(
          dg,
          buildScoreStats(
            {
              served: this.state.served,
              maxCombo: this.state.bestCombo,
              goldenCount: this.goldenServed,
            },
            toDurationSec(this.playElapsedMs),
          ),
        )
      : undefined;
    this.time.delayedCall(900, () => {
      this.scene.start('ResultScene', {
        dg,
        served: this.state.served,
        bestCombo: this.state.bestCombo,
        bestDG: best.bestDG,
        bestServed: best.bestServed,
        bestComboBest: best.bestCombo,
        isNewRecord,
        submission,
      });
    });
  }

  /** Playtest helper: swap the current customer's order in place. */
  private debugSetOrder(order: DangoKind[]): void {
    if (this.over || this.paused || this.betweenCustomers) return;
    this.order = [...order];
    this.built = [];
    this.inFlight = 0;
    this.customerSeq += 1;
    this.patience = this.balance.patienceSeconds;
    this.renderCustomer();
    this.renderSkewer();
    this.updatePatienceBar();
  }

  // ----- HUD ----------------------------------------------------------

  private buildHud(): void {
    addSoftPanel(this, GAME_WIDTH / 2, 42, 520, 86, 0.45).setDepth(10);
    this.dgText = this.add
      .text(16, HUD_TOP, `0 ${CURRENCY}`, {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '30px',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0)
      .setDepth(20);
    this.timeText = this.add
      .text(GAME_WIDTH / 2, HUD_TOP, '60', {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '32px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5, 0)
      .setDepth(20);
    this.servedText = this.add
      .text(16, HUD_TOP + 42, 'SERVED 0', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0)
      .setDepth(20);
    this.comboText = this.add
      .text(GAME_WIDTH / 2, HUD_TOP + 44, '', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#e86a7a',
      })
      .setOrigin(0.5, 0)
      .setDepth(20);

    const soundButton = makeIconButton(
      this,
      GAME_WIDTH - 36,
      HUD_TOP + 24,
      sound.isMuted ? 'OFF' : 'ON',
      () => this.toggleSound(),
    );
    soundButton.setDepth(20);
    this.soundText = soundButton.getAt(1) as Phaser.GameObjects.Text;

    const pauseButton = makeIconButton(
      this,
      GAME_WIDTH - 92,
      HUD_TOP + 24,
      'II',
      () => this.togglePause(),
    );
    pauseButton.setDepth(20);
  }

  private updateHud(): void {
    this.dgText?.setText(`${this.state.totalDG} ${CURRENCY}`);
    this.servedText?.setText(`SERVED ${this.state.served}`);
    this.comboText?.setText(
      this.state.combo > 1 ? `COMBO x${this.state.combo}` : '',
    );
    this.updateTimeText();
  }

  /** The combo counter pops — and grows a little — as combos climb. */
  private popCombo(): void {
    this.updateHud();
    if (!this.comboText || this.state.combo <= 1) return;
    this.comboText.setFontSize(Math.min(18 + this.state.combo, 30));
    this.tweens.killTweensOf(this.comboText);
    this.comboText.setScale(1.45);
    this.tweens.add({
      targets: this.comboText,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut',
    });
  }

  private updateTimeText(): void {
    const seconds = Math.ceil(this.state.timeLeft);
    this.timeText?.setText(`${seconds}`);
    this.timeText?.setColor(seconds <= 10 ? '#e86a7a' : COLOR_TEXT);
  }

  // ----- customer panel ------------------------------------------------

  private buildCustomerPanel(): void {
    this.customerPanel = this.add.container(0, 0).setDepth(5);
    const panel = this.add.rectangle(
      GAME_WIDTH / 2,
      200,
      500,
      204,
      0xfff7e6,
      0.94,
    );
    panel.setStrokeStyle(2, 0xc89b6a);
    this.customerPanel.add(panel);

    // The customer: a dango friend standing by the counter, ringed
    // in gold for VIP orders and green for Matcha orders.
    this.customerRing = this.add.circle(CUSTOMER_X, CUSTOMER_Y, 66, 0x000000, 0);
    this.customerRing.setStrokeStyle(4, 0xd8b98a);
    this.customerPanel.add(this.customerRing);
    this.customerPortrait = this.add
      .image(CUSTOMER_X, CUSTOMER_Y, this.customerKind)
      .setDisplaySize(118, 118);
    this.customerPanel.add(this.customerPortrait);
    this.tweens.add({
      targets: this.customerPortrait,
      y: CUSTOMER_Y - 5,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });

    this.customerText = this.add
      .text(168, 116, '', {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '20px',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0);
    this.customerPanel.add(this.customerText);

    // The speech bubble holding the order (drawn with graphics so
    // it can have a tail pointing at the customer).
    this.bubbleGraphics = this.add.graphics();
    this.customerPanel.add(this.bubbleGraphics);
    this.orderSlots = this.add.container(0, 0);
    this.customerPanel.add(this.orderSlots);

    // Patience bar (right of the customer, under the bubble).
    const barBg = this.add.rectangle(335, 258, 340, 14, 0xf0e0c8);
    this.customerPanel.add(barBg);
    this.patienceFill = this.add.rectangle(335 - 170, 258, 340, 14, 0x7fae5a);
    this.patienceFill.setOrigin(0, 0.5);
    this.customerPanel.add(this.patienceFill);
    this.patienceText = this.add
      .text(335, 270, '', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '14px',
        color: '#a08060',
      })
      .setOrigin(0.5, 0);
    this.customerPanel.add(this.patienceText);

    this.messageText = this.add
      .text(GAME_WIDTH / 2, 316, '', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '19px',
        fontStyle: 'bold',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5, 0)
      .setDepth(6);
  }

  private setMessage(text: string, color: string): void {
    this.messageText?.setText(text).setColor(color);
  }

  /** Draw the speech bubble: rounded box + tail toward the customer. */
  private drawBubble(slotCount: number): void {
    const g = this.bubbleGraphics;
    if (!g) return;
    g.clear();
    const spacing = 82;
    const width = Math.max(120, (slotCount - 1) * spacing + 96);
    const centerX = 335;
    const x = centerX - width / 2;
    const y = 140;
    const height = 96;
    g.fillStyle(0xffffff, 1);
    g.lineStyle(2, 0xd8b98a, 1);
    g.fillRoundedRect(x, y, width, height, 16);
    g.strokeRoundedRect(x, y, width, height, 16);
    // Tail: a little triangle from the bubble's left edge down-left
    // toward the customer's head.
    g.fillTriangle(x + 2, 196, x + 2, 168, x - 16, 188);
    g.lineStyle(2, 0xd8b98a, 1);
    g.lineBetween(x + 1, 168, x - 16, 188);
    g.lineBetween(x - 16, 188, x + 1, 196);
  }

  private renderCustomer(): void {
    const n = this.state.served + this.state.lost + 1;
    const vip = isVipOrder(this.order);
    const matcha = hasMatcha(this.order);
    const label = vip
      ? `CUSTOMER ${n}  —  VIP!`
      : matcha
        ? `CUSTOMER ${n}  —  Matcha order!`
        : `CUSTOMER ${n}`;
    this.customerText?.setText(label);
    this.customerText?.setColor(vip ? '#c89b00' : COLOR_TEXT);
    this.customerRing?.setStrokeStyle(
      4,
      vip ? 0xf5c542 : matcha ? 0x5a8a4a : 0xd8b98a,
    );

    this.drawBubble(this.order.length);
    this.orderSlots?.removeAll(true);
    const spacing = 82;
    const total = (this.order.length - 1) * spacing;
    const startX = 335 - total / 2;
    const progress = this.built.length + this.inFlight;
    this.order.forEach((kind, i) => {
      const x = startX + i * spacing;
      const built = i < this.built.length;
      const ring = this.add.circle(x, 180, 33, 0xfffaf0, 1);
      ring.setStrokeStyle(3, built ? 0x5a8a4a : 0xd8b98a);
      const img = this.add
        .image(x, 180, kind)
        .setDisplaySize(52, 52)
        .setAlpha(built ? 1 : 0.55);
      const num = this.add
        .text(x, 216, `${i + 1}`, {
          fontFamily: '"Zen Maru Gothic", sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: built ? '#5a8a4a' : '#a08060',
        })
        .setOrigin(0.5, 0);
      this.orderSlots?.add([ring, img, num]);
      // The next slot to fill gently pulses, so the eye knows where
      // the skewer is up to (bottom-up order stays obvious).
      if (i === progress && !this.betweenCustomers) {
        this.tweens.add({
          targets: ring,
          scale: 1.12,
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      }
    });
  }

  private updatePatienceBar(): void {
    const ratio = Math.max(0, this.patience / this.balance.patienceSeconds);
    this.patienceFill?.setSize(340 * ratio, 14);
    // Green while relaxed, amber when hurried, red at the edge.
    const color = ratio > 0.5 ? 0x7fae5a : ratio > 0.3 ? 0xe3a008 : 0xe0653a;
    this.patienceFill?.setFillStyle(color, 1);
    this.patienceText?.setText(
      `Customer patience: ${Math.ceil(this.patience)}s — serve before it runs out!`,
    );
  }

  // ----- skewer + pad ---------------------------------------------------

  private buildSkewerArea(): void {
    this.add
      .text(GAME_WIDTH / 2, 348, 'YOUR SKEWER', {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '20px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5, 0);
    this.skewer = this.add.container(0, 0).setDepth(8);
  }

  private renderSkewer(squashTop = false): void {
    this.skewer?.removeAll(true);
    this.skewerImages = [];
    // Bamboo stick + plate.
    const stick = this.add.rectangle(SKEWER_X, 480, 6, 190, 0xc89b6a);
    const plate = this.add.ellipse(SKEWER_X, 580, 150, 18, 0xe0aa7a);
    this.skewer?.add([stick, plate]);
    // Built dango stack bottom-up: first tap sits at the bottom.
    this.built.forEach((kind, i) => {
      const y = SKEWER_BOTTOM_Y - i * SKEWER_STEP;
      const img = this.add.image(SKEWER_X, y, kind).setDisplaySize(56, 56);
      this.skewer?.add(img);
      this.skewerImages.push(img);
    });
    // Landing squash: the just-landed dango squashes and rebounds.
    if (squashTop && this.skewerImages.length > 0) {
      const top = this.skewerImages[this.skewerImages.length - 1];
      const base = top.scaleX;
      top.setScale(base * 1.3, base * 0.7);
      this.tweens.add({
        targets: top,
        scaleX: base,
        scaleY: base,
        duration: 260,
        ease: 'Back.easeOut',
      });
    }
  }

  private buildPad(): void {
    const rows: DangoKind[][] = [PAD_KINDS.slice(0, 4), PAD_KINDS.slice(4)];
    rows.forEach((row, r) => {
      const y = 648 + r * 134;
      const spacing = 120;
      const total = (row.length - 1) * spacing;
      const startX = GAME_WIDTH / 2 - total / 2;
      row.forEach((kind, i) => {
        const x = startX + i * spacing;
        const info = DANGO_INFO[kind];
        const container = this.add.container(x, y).setDepth(8);
        const bg = this.add.rectangle(0, 0, 104, 128, 0xffffff, 1);
        bg.setStrokeStyle(2, 0xf0d9b5);
        bg.setInteractive({ useHandCursor: true });
        const img = this.add.image(0, -28, kind).setDisplaySize(64, 64);
        const name = this.add
          .text(0, 14, info.name, {
            fontFamily: '"Zen Maru Gothic", sans-serif',
            fontSize: '15px',
            fontStyle: 'bold',
            color: COLOR_TEXT,
          })
          .setOrigin(0.5, 0);
        const price = this.add
          .text(0, 36, `${this.economy.prices[kind]} DG`, {
            fontFamily: '"Zen Maru Gothic", sans-serif',
            fontSize: '14px',
            color: '#a08060',
          })
          .setOrigin(0.5, 0);
        container.add([bg, img, name, price]);
        this.padCards.set(kind, { container, x, y });
        bg.on('pointerdown', () => {
          sound.unlock();
          container.setScale(0.94);
          this.tapKind(kind);
        });
        bg.on('pointerup', () => container.setScale(1));
        bg.on('pointerout', () => container.setScale(1));
      });
    });
    // The hint rests on the counter top painted in the background.
    this.add
      .text(
        GAME_WIDTH / 2,
        856,
        'Tap the dango in order — bottom of the skewer first!',
        {
          fontFamily: '"Zen Maru Gothic", sans-serif',
          fontSize: '14px',
          fontStyle: 'bold',
          color: '#7a4a26',
        },
      )
      .setOrigin(0.5, 0);
  }

  /** Feedback on the tapped card: happy pop, or red flash + shake. */
  private flashPadCard(kind: DangoKind, ok: boolean): void {
    const card = this.padCards.get(kind);
    if (!card) return;
    if (ok) return;
    const flash = this.add
      .rectangle(card.x, card.y, 104, 128, 0xe0653a, 0.35)
      .setDepth(30);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 280,
      onComplete: () => flash.destroy(),
    });
    const baseX = card.x;
    this.tweens.add({
      targets: card.container,
      x: baseX - 5,
      duration: 50,
      yoyo: true,
      repeat: 3,
      onComplete: () => card.container.setX(baseX),
    });
  }

  // ----- pause / sound / helpers ---------------------------------------

  private buildPauseOverlay(): void {
    this.pauseOverlay = this.add
      .container(0, 0)
      .setDepth(50)
      .setVisible(false);
    const dim = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.45,
    );
    const panel = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      380,
      300,
      0xfff7e6,
      1,
    );
    panel.setStrokeStyle(3, 0xc89b6a);
    const title = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 90, 'PAUSED', {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '40px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5);
    this.pauseOverlay.add([dim, panel, title]);
    const resume = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, 'RESUME', {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '26px',
        color: '#ffffff',
        backgroundColor: '#f6a8b8',
        padding: { x: 36, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(51)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    resume.on('pointerup', () => this.togglePause());
    const quit = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 70, 'QUIT TO TITLE', {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#c89b6a',
        padding: { x: 24, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(51)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    quit.on('pointerup', () => this.scene.start('TitleScene'));
    this.pauseOverlay.setData('resumeButton', resume);
    this.pauseOverlay.setData('quitButton', quit);
  }

  private toggleSound(): void {
    const muted = sound.toggleMuted();
    this.soundText?.setText(muted ? 'OFF' : 'ON');
  }

  private togglePause(): void {
    if (this.over) return;
    this.paused = !this.paused;
    this.pauseOverlay?.setVisible(this.paused);
    const resume = this.pauseOverlay?.getData(
      'resumeButton',
    ) as Phaser.GameObjects.Text | undefined;
    const quit = this.pauseOverlay?.getData(
      'quitButton',
    ) as Phaser.GameObjects.Text | undefined;
    resume?.setVisible(this.paused);
    quit?.setVisible(this.paused);
  }

  private floatText(
    x: number,
    y: number,
    message: string,
    color: string,
    fontSize = 22,
  ): void {
    const text = this.add
      .text(x, y, message, {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: `${fontSize}px`,
        color,
        stroke: '#fff7e6',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: text,
      y: y - 44,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy(),
    });
  }
}

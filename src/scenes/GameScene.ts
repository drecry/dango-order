/**
 * Game scene (Dango Order) — the full-screen play area, v3.
 *
 * A 60-second shift at the dango shop. The customers are cute
 * ANIMALS now (rabbit, cat, bear, panda, fox, hamster — a random
 * one walks in each time, purely cosmetic). The animal's order
 * shows in a speech bubble as MINI SKEWERS: 1 skewer normally, and
 * once the shift warms up sometimes 3 at once. Each mini skewer is
 * drawn threaded, as it is served: dango on a stick whose shaft
 * runs THROUGH them, handle hanging below the bottom dango.
 *
 * Build the skewer framed in pink by tapping the 2x4 pad (seven
 * dango + SERVE): the big skewer is ONE bamboo stick — shaft
 * running down through the stack, handle below, and its top end
 * always hidden INSIDE the topmost dango, so the top dango caps
 * the skewer. Each correct dango rides to the top and slides DOWN
 * ALONG THE SHAFT, piercing onto the top of the stack — first
 * tapped at the bottom. A finished
 * skewer gets a green check in the bubble; when every skewer is
 * done, SERVE lights up and one press serves the whole order.
 * Serve fast for a wait bonus; serves in a row build a combo; each
 * Matcha skewer adds +3 seconds at serve; a skewer with a Golden
 * dango sells for 2x (VIP). Wrong taps cost patience (-1.5 s); an
 * empty patience bar loses the order and resets the combo.
 *
 * All rules (orders, DG, patience, timer) come from the pure logic
 * in src/logic/order.ts and the JSON configs — this scene renders.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import type { AnimalKind, DangoKind } from '../constants/assets';
import {
  ALL_DANGO_KINDS,
  ANIMAL_KINDS,
  BACKGROUND_KEY,
  DANGO_INFO,
  animalKey,
} from '../constants/assets';
import { FONT_BODY, FONT_HEADING } from '../constants/fonts';
import {
  applyLeave,
  applyServeOrder,
  initialState,
  patienceForOrder,
  rollCustomerOrder,
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

/* Customer cluster (left), matching the approved v3 mockup. */
const CUSTOMER_X = 100;
const CUSTOMER_Y = 218;
const PORTRAIT_SIZE = 184;
const RING_GOLD = 0xf5c542;
const RING_BAMBOO = 0xd8b98a;
const RING_MATCHA = 0x5a8a4a;

/* Speech bubble (right of the portrait). */
const BUBBLE_X = 225;
const BUBBLE_Y = 120;
const BUBBLE_W = 297;
const BUBBLE_H = 238;
const BUBBLE_INNER_X = 240;
const BUBBLE_INNER_W = 267;

/* Building skewer: ONE full bamboo skewer — a shaft running down
 * THROUGH the dango stack, and the rounded handle end resting
 * toward the counter. The shaft's top end always finishes INSIDE
 * the topmost dango (it tracks a sliding dango as it descends),
 * so no stick ever shows above the top dango: the dango caps the
 * skewer. Seated dango nestle (centres ~13% closer than the dango
 * diameter) so the column reads as pierced, not stacked. RISE_Y
 * is where a tapped dango arrives above the stack before its
 * descent — and the standing height of an untouched bare stick. */
const SKEWER_X = 190;
const SLOT_BOTTOM_Y = 590;
const SLOT_STEP = 80;
const BUILD_DANGO_SIZE = 92;
const RISE_Y = 296;
const STICK_BOTTOM_Y = 742;
const STICK_PIVOT_Y = (RISE_Y + STICK_BOTTOM_Y) / 2;

/* The 2x4 pad: [SHIRATAMA ANKO SAKURA MITARASHI] / [YOMOGI MATCHA GOLDEN SERVE]. */
const PAD_X0 = 19;
const PAD_Y0 = 773;
const CELL_W = 121;
const CELL_H = 79;
const CELL_GAP = 6;
const SERVE_ENABLED = 0xe86a7a;
const SERVE_DISABLED = 0xdcb9be;

/** What the last serve earned — read by the debug hook / playtests. */
export interface LastServe {
  skewers: DangoKind[][];
  patienceLeft: number;
  combo: number;
  earnedDG: number;
  goldenSkewers: number;
  matchaSkewers: number;
  timeBonus: number;
  isVip: boolean;
}

interface PadCard {
  container: Phaser.GameObjects.Container;
  x: number;
  y: number;
}

declare global {
  interface Window {
    __dangoOrder?: {
      getSkewers: () => DangoKind[][];
      getOrder: () => DangoKind[];
      getBuilt: () => DangoKind[];
      getCurrentSkewer: () => number;
      isServeEnabled: () => boolean;
      getState: () => OrderState;
      getPatience: () => number;
      tap: (kind: DangoKind) => void;
      serve: () => void;
      setOrder: (order: DangoKind[] | DangoKind[][]) => void;
      setPatience: (seconds: number) => void;
      forceTimeLeft: (seconds: number) => void;
      getLastServe: () => LastServe | null;
      getCustomerKind: () => AnimalKind;
      getCustomerAnimal: () => AnimalKind;
    };
  }
}

export class GameScene extends Phaser.Scene {
  private economy: Economy = loadEconomy();
  private balance: Balance = loadBalance();
  private state: OrderState = initialState();
  /** The current customer's order: 1 or 3 skewers. */
  private skewers: Order[] = [];
  private currentSkewer = 0;
  private completed: boolean[] = [];
  private built: DangoKind[] = [];
  /** Dango currently flying to the skewer (tapped, not yet landed). */
  private inFlight = 0;
  /** True during the brief fade-out after a skewer is completed. */
  private skewerTransition = false;
  /** Bumped per customer so stale flying dango can be discarded. */
  private customerSeq = 0;
  private animal: AnimalKind = 'rabbit';
  private patienceMax = 0;
  private patience = 0;
  private paused = false;
  private over = false;
  private betweenCustomers = false;
  /** Real elapsed play time (for the ranking stats). */
  private playElapsedMs = 0;
  /** Golden SKEWERS served this shift (ranking stats). */
  private goldenServed = 0;
  /** Total skewers served this shift (result screen display only). */
  private skewersServed = 0;
  private lastServe: LastServe | null = null;
  /** Last whole second shown, for the countdown tick. */
  private lastWholeSec = -1;

  private dgText: Phaser.GameObjects.Text | null = null;
  private timeText: Phaser.GameObjects.Text | null = null;
  private servedText: Phaser.GameObjects.Text | null = null;
  private comboText: Phaser.GameObjects.Text | null = null;
  private customerPanel: Phaser.GameObjects.Container | null = null;
  private portrait: Phaser.GameObjects.Image | null = null;
  private ring: Phaser.GameObjects.Arc | null = null;
  private ringBadge: Phaser.GameObjects.Text | null = null;
  private bubbleArt: Phaser.GameObjects.Graphics | null = null;
  private orderColumns: Phaser.GameObjects.Container | null = null;
  private orderTitle: Phaser.GameObjects.Text | null = null;
  private orderCount: Phaser.GameObjects.Text | null = null;
  private customerLabel: Phaser.GameObjects.Text | null = null;
  private customerTag: Phaser.GameObjects.Text | null = null;
  private patienceFill: Phaser.GameObjects.Rectangle | null = null;
  private patienceText: Phaser.GameObjects.Text | null = null;
  private sweatDrop: Phaser.GameObjects.Image | null = null;
  private messageText: Phaser.GameObjects.Text | null = null;
  private skewer: Phaser.GameObjects.Container | null = null;
  private stickGfx: Phaser.GameObjects.Graphics | null = null;
  /** Dango clones currently sliding down the shaft (phase 2). */
  private sliders = new Set<Phaser.GameObjects.Image>();
  private padCards = new Map<DangoKind, PadCard>();
  private serveBg: Phaser.GameObjects.Rectangle | null = null;
  private serveText: Phaser.GameObjects.Text | null = null;
  private serveContainer: Phaser.GameObjects.Container | null = null;
  private pauseOverlay: Phaser.GameObjects.Container | null = null;
  private soundText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  create(): void {
    bgm.start('game');
    this.economy = loadEconomy();
    this.balance = loadBalance();
    this.state = initialState(this.balance);
    this.skewers = [];
    this.currentSkewer = 0;
    this.completed = [];
    this.built = [];
    this.sliders.clear();
    this.inFlight = 0;
    this.skewerTransition = false;
    this.customerSeq = 0;
    this.patienceMax = this.balance.patienceSeconds;
    this.patience = this.balance.patienceSeconds;
    this.paused = false;
    this.over = false;
    this.betweenCustomers = false;
    this.playElapsedMs = 0;
    this.goldenServed = 0;
    this.skewersServed = 0;
    this.lastServe = null;
    this.lastWholeSec = -1;
    this.padCards.clear();

    // Shop background illustration (drawn first, behind everything).
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, BACKGROUND_KEY)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT);

    this.makeFxTextures();
    this.buildHud();
    this.buildCustomerPanel();
    this.buildSkewerArea();
    this.buildPad();
    this.buildPauseOverlay();
    this.newCustomer(true);
    this.installDebugHook();

    this.input.keyboard?.on('keydown-P', () => this.togglePause());
    this.input.keyboard?.on('keydown-M', () => this.toggleSound());
    this.input.keyboard?.on('keydown-ENTER', () => this.pressServe());
    this.input.keyboard?.on('keydown-SPACE', () => this.pressServe());
    ALL_DANGO_KINDS.forEach((kind, i) => {
      this.input.keyboard?.on(`keydown-${i + 1}`, () => this.tapKind(kind));
    });
  }

  /** Tiny drawn shapes used for reactions (heart / sweat drop). */
  private makeFxTextures(): void {
    if (!this.textures.exists('fx-heart')) {
      const g = this.add.graphics();
      g.fillStyle(0xf2798f, 1);
      g.fillCircle(7, 8, 6);
      g.fillCircle(17, 8, 6);
      g.fillTriangle(1, 11, 23, 11, 12, 23);
      g.generateTexture('fx-heart', 24, 24);
      g.destroy();
    }
    if (!this.textures.exists('fx-drop')) {
      const g = this.add.graphics();
      g.fillStyle(0x7ec8e3, 1);
      g.fillTriangle(3, 12, 13, 12, 8, 1);
      g.fillCircle(8, 14, 6);
      g.generateTexture('fx-drop', 16, 22);
      g.destroy();
    }
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

  /** Customer number (1-based) of the customer being served now. */
  private customerNumber(): number {
    return this.state.served + this.state.lost + 1;
  }

  private newCustomer(first = false): void {
    if (this.over) return;
    this.customerSeq += 1;
    this.skewers = rollCustomerOrder(
      this.state.served,
      this.customerNumber(),
      this.economy,
      this.balance,
    );
    this.completed = this.skewers.map(() => false);
    this.currentSkewer = 0;
    this.built = [];
    this.sliders.clear();
    this.inFlight = 0;
    this.skewerTransition = false;
    if (this.skewer) {
      this.tweens.killTweensOf(this.skewer);
      this.skewer.setAlpha(1).setY(0);
    }
    this.patienceMax = patienceForOrder(this.skewers.length, this.balance);
    this.patience = this.patienceMax;
    this.betweenCustomers = false;

    // A random animal walks in (cosmetic — the order itself is
    // rolled by the rules, independent of who asks for it).
    this.animal =
      ANIMAL_KINDS[Math.floor(Math.random() * ANIMAL_KINDS.length)];
    this.portrait?.setTexture(animalKey(this.animal));
    this.portrait?.clearTint();
    this.sweatDrop?.setVisible(false);

    const anyGolden = this.skewers.some((s) => s.includes('golden'));
    const anyMatcha = this.skewers.some((s) => s.includes('matcha'));
    this.ring?.setStrokeStyle(
      7,
      anyGolden ? RING_GOLD : anyMatcha ? RING_MATCHA : RING_BAMBOO,
    );
    this.ringBadge?.setVisible(anyGolden);
    this.customerLabel?.setText(`CUSTOMER ${this.customerNumber()}`);
    this.customerTag?.setText(
      anyGolden ? 'VIP order!' : anyMatcha ? 'Matcha order!' : '',
    );
    this.customerTag?.setColor(anyGolden ? '#c89b00' : '#5a8a4a');

    this.setMessage('', COLOR_TEXT);
    this.renderBubble();
    this.renderSkewer();
    this.updatePatienceBar();
    this.updateServeCell();
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

  private tapKind(kind: DangoKind): void {
    if (
      this.paused ||
      this.over ||
      this.betweenCustomers ||
      this.skewerTransition
    ) {
      return;
    }
    const current = this.skewers[this.currentSkewer];
    if (!current) return;
    // Queue-safe: what is already built PLUS what is still flying
    // counts as progress, so fast taps never cause false penalties.
    const progress = this.built.length + this.inFlight;
    if (progress >= current.length) return;
    const want = current[progress];
    if (kind === want) {
      // Pitch ladder follows the position within the CURRENT skewer.
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
    this.flashPadCard(kind);
    // The animal shakes its head (no angry-face art for animals).
    if (this.portrait) {
      this.tweens.add({
        targets: this.portrait,
        x: CUSTOMER_X - 6,
        duration: 55,
        yoyo: true,
        repeat: 3,
        onComplete: () => this.portrait?.setX(CUSTOMER_X),
      });
    }
    if (this.patience <= 0) {
      this.loseCustomer();
    }
  }

  /**
   * The skewering animation: the dango hops off its pad card and
   * rises to the top of the bamboo skewer, then slides straight
   * DOWN ALONG THE SHAFT and pierces onto the top of the stack —
   * the shaft is drawn behind it, and its top end tracks INSIDE
   * the sliding dango for the whole descent, so the stick visibly
   * threads it yet never pokes out above it. Stretched while it
   * slides, squash on landing, a wobble of the stick and a tiny
   * settle dip of the whole skewer. The dango only counts as
   * built once it lands.
   */
  private flyDangoToSkewer(kind: DangoKind, slotIndex: number): void {
    const seq = this.customerSeq;
    const skewerIndex = this.currentSkewer;
    this.inFlight += 1;
    this.renderBubble();
    const card = this.padCards.get(kind);
    const startX = card ? card.x : SKEWER_X;
    const startY = card ? card.y - 30 : 700;
    const targetY = SLOT_BOTTOM_Y - slotIndex * SLOT_STEP;
    // Threading always starts at the top, however deep the slot:
    // the dango rides to the top of the shaft first.
    const aboveY = RISE_Y;
    const clone = this.add
      .image(startX, startY, kind)
      .setDisplaySize(BUILD_DANGO_SIZE, BUILD_DANGO_SIZE)
      .setDepth(40);
    const baseScale = clone.scaleX;
    // Phase 1: rise to the top, centred on the skewer axis.
    this.tweens.add({
      targets: clone,
      x: SKEWER_X,
      y: aboveY,
      duration: 190,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (!clone.active) return;
        // Phase 2: the pierce — straight down the shaft, stretching.
        // The shaft's top end tracks inside this dango as it slides.
        this.tweens.add({
          targets: clone,
          y: targetY,
          duration: Phaser.Math.Clamp(
            Math.round((targetY - aboveY) * 0.8),
            130,
            240,
          ),
          ease: 'Quad.easeIn',
          onStart: () => {
            this.sliders.add(clone);
            this.refreshStickTop();
          },
          onUpdate: () => {
            clone.setScale(baseScale * 0.94, baseScale * 1.13);
            this.refreshStickTop();
          },
          onComplete: () => {
            this.sliders.delete(clone);
            clone.destroy();
            if (seq !== this.customerSeq) return;
            this.inFlight = Math.max(0, this.inFlight - 1);
            if (
              this.betweenCustomers ||
              this.over ||
              skewerIndex !== this.currentSkewer
            ) {
              return;
            }
            this.built.push(kind);
            this.renderSkewer(true);
            this.wiggleStick();
            this.settleSkewer();
            if (this.built.length >= (this.skewers[skewerIndex]?.length ?? 0)) {
              this.completeSkewer();
            } else {
              this.renderBubble();
            }
          },
        });
      },
    });
  }

  /** A tiny wobble of the bamboo skewer when a dango lands. */
  private wiggleStick(): void {
    if (!this.stickGfx || !this.stickGfx.active) return;
    const stick = this.stickGfx;
    this.tweens.add({
      targets: stick,
      angle: 1.6,
      duration: 55,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
      onComplete: () => stick.setAngle(0),
    });
  }

  /**
   * A 3px dip-and-spring of the whole skewer as a dango seats: it
   * should feel pushed ONTO the stick, not dropped on top of it.
   */
  private settleSkewer(): void {
    if (!this.skewer) return;
    this.tweens.add({
      targets: this.skewer,
      y: 3,
      duration: 60,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  /**
   * The current skewer is fully built: it gets its green check in
   * the bubble, sparkles, and clears away; the next skewer becomes
   * current (or SERVE lights up when it was the last one).
   */
  private completeSkewer(): void {
    this.completed[this.currentSkewer] = true;
    this.sparkleAt(SKEWER_X, SLOT_BOTTOM_Y - SLOT_STEP);
    this.floatText(SKEWER_X, 470, 'Skewer ready!', '#5a8a4a', 19);
    this.built = [];
    this.skewerTransition = true;
    this.renderBubble();
    this.updateServeCell();
    if (!this.skewer) {
      this.skewerTransition = false;
      return;
    }
    this.tweens.add({
      targets: this.skewer,
      alpha: 0,
      y: -14,
      duration: 240,
      delay: 200,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.skewer?.setAlpha(1).setY(0);
        this.skewerTransition = false;
        if (this.betweenCustomers || this.over) return;
        while (
          this.currentSkewer < this.skewers.length &&
          this.completed[this.currentSkewer]
        ) {
          this.currentSkewer += 1;
        }
        // The finished skewer clears the building area either way;
        // the next skewer (if any) becomes current.
        this.renderSkewer();
        this.renderBubble();
      },
    });
  }

  /** SERVE pressed (pad cell, keyboard, or the debug hook). */
  pressServe(): void {
    if (
      this.paused ||
      this.over ||
      this.betweenCustomers ||
      !this.allComplete()
    ) {
      return;
    }
    this.serveOrder();
  }

  private serveOrder(): void {
    this.betweenCustomers = true;
    // Cancel any in-flight completion fade: the order leaves now.
    if (this.skewer) {
      this.tweens.killTweensOf(this.skewer);
      this.skewer.setAlpha(1).setY(0);
    }
    this.skewerTransition = false;
    const patienceLeft = this.patience;
    const result = applyServeOrder(
      this.state,
      this.skewers,
      patienceLeft,
      this.economy,
      this.balance,
    );
    this.state = result.state;
    this.goldenServed += result.goldenSkewers;
    this.skewersServed += this.skewers.length;
    this.lastServe = {
      skewers: this.skewers.map((s) => [...s]),
      patienceLeft,
      combo: this.state.combo,
      earnedDG: result.earnedDG,
      goldenSkewers: result.goldenSkewers,
      matchaSkewers: result.matchaSkewers,
      timeBonus: result.timeBonus,
      isVip: result.isVip,
    };
    if (result.isVip) {
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
    this.updateServeCell();
    // The animal beams (a happy bounce — animals have one face),
    // hearts drift up, and the finished skewers cascade over.
    if (this.portrait) {
      const base = this.portrait.scaleX;
      this.tweens.add({
        targets: this.portrait,
        scaleX: base * 1.14,
        scaleY: base * 1.14,
        duration: 150,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeOut',
        onComplete: () => this.portrait?.setScale(base, base),
      });
    }
    this.spawnServeFlyers();
    this.sparkleAt(CUSTOMER_X, CUSTOMER_Y);
    this.spawnHearts();
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
    this.time.delayedCall(820, () => this.newCustomer());
  }

  /** Mini skewers flying from their bubble columns to the customer. */
  private spawnServeFlyers(): void {
    const { size, spacing, topY, stick } = this.miniGeom();
    const n = this.skewers.length;
    this.skewers.forEach((skewer, i) => {
      const cx = this.colX(i, n);
      const flyer = this.add.container(cx, topY).setDepth(45);
      const bottomLocal = (skewer.length - 1) * spacing;
      const g = this.add.graphics();
      // Shaft ends inside the top dango (local y 0) — no tip above.
      g.lineStyle(5, 0xb27c4a, 1);
      g.lineBetween(0, 0, 0, bottomLocal + size / 2 + stick);
      g.fillStyle(0xb27c4a, 1);
      g.fillCircle(0, bottomLocal + size / 2 + stick, 3.5);
      const parts: Phaser.GameObjects.GameObject[] = [g];
      skewer.forEach((kind, j) => {
        parts.push(
          this.add
            .image(0, (skewer.length - 1 - j) * spacing, kind)
            .setDisplaySize(size, size),
        );
      });
      flyer.add(parts);
      this.tweens.add({
        targets: flyer,
        x: CUSTOMER_X + 24,
        y: CUSTOMER_Y - 10,
        scaleX: 0.72,
        scaleY: 0.72,
        alpha: 0.25,
        delay: i * 90,
        duration: 380,
        ease: 'Sine.easeIn',
        onComplete: () => flyer.destroy(),
      });
    });
  }

  /** A few little hearts drifting up from a happy customer. */
  private spawnHearts(): void {
    for (let i = 0; i < 4; i++) {
      const heart = this.add
        .image(
          CUSTOMER_X + Phaser.Math.Between(-56, 56),
          CUSTOMER_Y - 84,
          'fx-heart',
        )
        .setDisplaySize(20, 20)
        .setDepth(35)
        .setAlpha(0.95);
      this.tweens.add({
        targets: heart,
        y: heart.y - Phaser.Math.Between(34, 58),
        x: heart.x + Phaser.Math.Between(-14, 14),
        alpha: 0,
        duration: 750,
        delay: i * 90,
        ease: 'Sine.easeOut',
        onComplete: () => heart.destroy(),
      });
    }
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
    this.state = applyLeave(this.state).state;
    this.setMessage('The customer left... Next customer!', '#e86a7a');
    // The animal greys out, works up a sweat drop, and leaves.
    this.portrait?.setTint(0x9a9a9a);
    this.sweatDrop?.setVisible(true);
    this.updateHud();
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
        skewersServed: this.skewersServed,
        goldenSkewers: this.goldenServed,
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
  private debugSetOrder(order: DangoKind[] | DangoKind[][]): void {
    if (this.over || this.paused || this.betweenCustomers) return;
    const skewers: DangoKind[][] =
      order.length > 0 && Array.isArray(order[0])
        ? (order as DangoKind[][]).map((s) => [...s])
        : [order as DangoKind[]];
    this.skewers = skewers;
    this.completed = skewers.map(() => false);
    this.currentSkewer = 0;
    this.built = [];
    this.sliders.clear();
    this.inFlight = 0;
    this.skewerTransition = false;
    this.customerSeq += 1;
    this.patienceMax = patienceForOrder(skewers.length, this.balance);
    this.patience = this.patienceMax;
    const anyGolden = skewers.some((s) => s.includes('golden'));
    const anyMatcha = skewers.some((s) => s.includes('matcha'));
    this.ring?.setStrokeStyle(
      7,
      anyGolden ? RING_GOLD : anyMatcha ? RING_MATCHA : RING_BAMBOO,
    );
    this.ringBadge?.setVisible(anyGolden);
    this.customerTag?.setText(
      anyGolden ? 'VIP order!' : anyMatcha ? 'Matcha order!' : '',
    );
    this.renderBubble();
    this.renderSkewer();
    this.updatePatienceBar();
    this.updateServeCell();
  }

  private installDebugHook(): void {
    window.__dangoOrder = {
      getSkewers: () => this.skewers.map((s) => [...s]),
      getOrder: () => [...(this.skewers[this.currentSkewer] ?? [])],
      getBuilt: () => [...this.built],
      getCurrentSkewer: () => this.currentSkewer,
      isServeEnabled: () => this.allComplete(),
      getState: () => ({ ...this.state }),
      getPatience: () => this.patience,
      tap: (kind: DangoKind) => this.tapKind(kind),
      serve: () => this.pressServe(),
      setOrder: (order: DangoKind[] | DangoKind[][]) =>
        this.debugSetOrder(order),
      setPatience: (seconds: number) => {
        this.patience = Math.max(0.1, seconds);
        this.updatePatienceBar();
      },
      forceTimeLeft: (seconds: number) => {
        this.state = { ...this.state, timeLeft: seconds };
      },
      getLastServe: () => this.lastServe,
      getCustomerKind: () => this.animal,
      getCustomerAnimal: () => this.animal,
    };
  }

  // ----- HUD ----------------------------------------------------------

  private buildHud(): void {
    addSoftPanel(this, GAME_WIDTH / 2, 42, 520, 86, 0.45).setDepth(10);
    this.dgText = this.add
      .text(16, HUD_TOP, `0 ${CURRENCY}`, {
        fontFamily: FONT_HEADING,
        fontSize: '30px',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0)
      .setDepth(20);
    this.timeText = this.add
      .text(GAME_WIDTH / 2, HUD_TOP, '60', {
        fontFamily: FONT_HEADING,
        fontSize: '32px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5, 0)
      .setDepth(20);
    this.servedText = this.add
      .text(16, HUD_TOP + 42, 'SERVED 0', {
        fontFamily: FONT_BODY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0)
      .setDepth(20);
    this.comboText = this.add
      .text(GAME_WIDTH / 2, HUD_TOP + 44, '', {
        fontFamily: FONT_BODY,
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

  // ----- customer panel -------------------------------------------------

  private buildCustomerPanel(): void {
    this.customerPanel = this.add.container(0, 0).setDepth(5);

    // The customer: an animal portrait in a ring — gold when the
    // order has a Golden skewer (VIP), green for a Matcha order.
    this.ring = this.add
      .circle(CUSTOMER_X, CUSTOMER_Y, 96, 0xfff7e6)
      .setStrokeStyle(7, RING_BAMBOO);
    this.portrait = this.add
      .image(CUSTOMER_X, CUSTOMER_Y, animalKey(this.animal))
      .setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE);
    this.customerPanel.add([this.ring, this.portrait]);
    this.tweens.add({
      targets: this.portrait,
      y: CUSTOMER_Y - 5,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    this.ringBadge = this.add
      .text(CUSTOMER_X + 68, CUSTOMER_Y - 68, '★', {
        fontFamily: FONT_BODY,
        fontSize: '30px',
        color: '#f5c542',
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.customerPanel.add(this.ringBadge);
    this.sweatDrop = this.add
      .image(CUSTOMER_X + 76, CUSTOMER_Y - 80, 'fx-drop')
      .setDisplaySize(22, 30)
      .setVisible(false);
    this.customerPanel.add(this.sweatDrop);

    // The speech bubble (drawn, with a tail) + the mini skewers.
    this.bubbleArt = this.add.graphics();
    this.orderColumns = this.add.container(0, 0);
    this.orderTitle = this.add
      .text(BUBBLE_X + 18, BUBBLE_Y + 20, 'ORDER', {
        fontFamily: FONT_HEADING,
        fontSize: '19px',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0.5);
    this.orderCount = this.add
      .text(BUBBLE_X + BUBBLE_W - 16, BUBBLE_Y + 20, '', {
        fontFamily: FONT_HEADING,
        fontSize: '22px',
        color: '#e86a7a',
      })
      .setOrigin(1, 0.5);
    this.customerPanel.add([
      this.bubbleArt,
      this.orderColumns,
      this.orderTitle,
      this.orderCount,
    ]);

    this.customerLabel = this.add
      .text(CUSTOMER_X, 330, '', {
        fontFamily: FONT_BODY,
        fontSize: '16px',
        fontStyle: 'bold',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5, 0);
    this.customerTag = this.add
      .text(CUSTOMER_X, 352, '', {
        fontFamily: FONT_BODY,
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#5a8a4a',
      })
      .setOrigin(0.5, 0);
    this.customerPanel.add([this.customerLabel, this.customerTag]);

    // Patience bar under the bubble: ONE per order (longer for a
    // 3-skewer order).
    const barBg = this.add
      .rectangle(BUBBLE_X + 14, 384, BUBBLE_W - 28, 18, 0xe8d9bd)
      .setOrigin(0, 0.5);
    this.patienceFill = this.add
      .rectangle(BUBBLE_X + 14, 384, BUBBLE_W - 28, 18, 0x7fae5a)
      .setOrigin(0, 0.5);
    this.patienceText = this.add
      .text(BUBBLE_X + BUBBLE_W / 2, 402, '', {
        fontFamily: FONT_BODY,
        fontSize: '13px',
        color: '#a08060',
      })
      .setOrigin(0.5, 0);
    this.customerPanel.add([barBg, this.patienceFill, this.patienceText]);

    this.messageText = this.add
      .text(GAME_WIDTH / 2, 424, '', {
        fontFamily: FONT_BODY,
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

  /** Column center x for skewer `i` of `n` inside the bubble. */
  private colX(i: number, n: number): number {
    return BUBBLE_INNER_X + (BUBBLE_INNER_W * (i + 0.5)) / n;
  }

  /** Mini-skewer geometry, shared by the bubble and serve flyers. */
  private miniGeom(): {
    size: number;
    spacing: number;
    topY: number;
    stick: number;
  } {
    const maxLen = Math.max(1, ...this.skewers.map((s) => s.length));
    return maxLen >= 4
      ? { size: 42, spacing: 36, topY: 190, stick: 26 }
      : { size: 48, spacing: 41, topY: 198, stick: 30 };
  }

  /**
   * Redraw the bubble: box + tail, then one mini skewer per ordered
   * skewer — dango threaded on a shaft that ends inside the top
   * dango, handle below. Done skewers dim with a green check; the
   * current one is framed pink and its next dango pulses; the rest
   * wait quietly.
   */
  private renderBubble(): void {
    const g = this.bubbleArt;
    if (!g || !this.orderColumns) return;
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.lineStyle(2, 0xd8b98a, 1);
    g.fillRoundedRect(BUBBLE_X, BUBBLE_Y, BUBBLE_W, BUBBLE_H, 16);
    g.strokeRoundedRect(BUBBLE_X, BUBBLE_Y, BUBBLE_W, BUBBLE_H, 16);
    // Tail: a little triangle from the bubble's left edge toward
    // the customer's head.
    g.fillTriangle(BUBBLE_X + 2, 224, BUBBLE_X + 2, 262, BUBBLE_X - 26, 243);
    g.lineStyle(2, 0xd8b98a, 1);
    g.lineBetween(BUBBLE_X + 2, 224, BUBBLE_X - 26, 243);
    g.lineBetween(BUBBLE_X - 26, 243, BUBBLE_X + 2, 262);

    this.orderColumns.removeAll(true);
    const n = this.skewers.length;
    this.orderCount?.setText(n > 1 ? `x${n}` : '');
    if (n === 0) return;
    const { size, spacing, topY, stick } = this.miniGeom();
    const pulseIndex = this.built.length + this.inFlight;
    this.skewers.forEach((skewer, i) => {
      const cx = this.colX(i, n);
      const done = this.completed[i];
      const isCurrent = i === this.currentSkewer && !done;
      const bottomY = topY + (skewer.length - 1) * spacing;
      // The stick: ONE shaft THROUGH the dango column, ending
      // INSIDE the top dango (nothing shows above it) with the
      // handle below the bottom one. It is drawn on the bubble
      // graphics, i.e. BEHIND the dango images, so the dango hide
      // it where they sit on it and it reads as piercing, not
      // perching.
      g.lineStyle(5, 0xb27c4a, done ? 0.5 : 0.95);
      g.lineBetween(cx, topY, cx, bottomY + size / 2 + stick);
      g.fillStyle(0xb27c4a, done ? 0.5 : 0.95);
      g.fillCircle(cx, bottomY + size / 2 + stick, 3.5);
      // Pink frame around the skewer being built.
      if (isCurrent) {
        g.lineStyle(3, 0xe86a7a, 1);
        g.strokeRoundedRect(
          cx - size / 2 - 10,
          topY - size / 2 - 9,
          size + 20,
          (skewer.length - 1) * spacing + size + stick + 18,
          10,
        );
      }
      skewer.forEach((kind, j) => {
        // j = 0 is the FIRST tapped dango: it sits at the BOTTOM.
        const cy = topY + (skewer.length - 1 - j) * spacing;
        const img = this.add
          .image(cx, cy, kind)
          .setDisplaySize(size, size)
          .setAlpha(
            done ? 0.5 : isCurrent ? (j < this.built.length ? 1 : 0.55) : 0.9,
          );
        if (
          isCurrent &&
          j === pulseIndex &&
          !this.betweenCustomers &&
          !this.skewerTransition
        ) {
          this.tweens.add({
            targets: img,
            scaleX: img.scaleX * 1.16,
            scaleY: img.scaleY * 1.16,
            duration: 380,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
        }
        this.orderColumns?.add(img);
      });
      // Green check badge on a finished skewer.
      if (done) {
        const bx = cx + size / 2 - 2;
        const by = topY - size / 2 + 2;
        g.fillStyle(0x6ec378, 1);
        g.lineStyle(2, 0x5a3a28, 1);
        g.fillCircle(bx, by, 12);
        g.strokeCircle(bx, by, 12);
        g.lineStyle(3, 0xffffff, 1);
        g.lineBetween(bx - 5, by, bx - 1.5, by + 4);
        g.lineBetween(bx - 1.5, by + 4, bx + 5.5, by - 4);
      }
    });
  }

  private updatePatienceBar(): void {
    if (!this.patienceFill || this.patienceMax <= 0) return;
    const ratio = Math.max(0, this.patience / this.patienceMax);
    this.patienceFill.setSize((BUBBLE_W - 28) * ratio, 18);
    // Green while relaxed, amber when hurried, red at the edge.
    const color = ratio > 0.5 ? 0x7fae5a : ratio > 0.3 ? 0xe3a008 : 0xe0653a;
    this.patienceFill.setFillStyle(color, 1);
    this.patienceText?.setText(
      `Customer patience: ${Math.ceil(this.patience)}s`,
    );
  }

  // ----- skewer + pad ---------------------------------------------------

  private buildSkewerArea(): void {
    // The building skewer's shadow rests on the counter.
    this.add
      .ellipse(SKEWER_X, 758, 190, 22, 0x5a3a28, 0.16)
      .setDepth(3);
    this.skewer = this.add.container(0, 0).setDepth(10);
  }

  /**
   * Where the shaft's top end sits: always INSIDE the topmost
   * dango, so nothing of the stick ever shows above it. While a
   * dango slides down the shaft, the end tracks inside THAT
   * dango; otherwise it rests inside the top seated dango. An
   * untouched skewer (no dango involved yet) just stands at the
   * standing height.
   */
  private stickTopY(): number {
    let top: number | null = null;
    if (this.built.length > 0) {
      top = SLOT_BOTTOM_Y - (this.built.length - 1) * SLOT_STEP;
    }
    this.sliders.forEach((s) => {
      if (s.active) top = top === null ? s.y : Math.min(top, s.y);
    });
    return top ?? RISE_Y;
  }

  /**
   * Redraw the bamboo shaft with its top end at `topY` (scene
   * coordinates): the shaft body, a lighter centre stripe, and
   * the rounded handle end toward the counter. The top end is
   * simply rounded — it is hidden inside a dango whenever one is
   * involved, so there is no tip to show.
   */
  private drawStick(topY: number): void {
    const g = this.stickGfx;
    if (!g) return;
    const yTop = topY - STICK_PIVOT_Y;
    const yBot = STICK_BOTTOM_Y - STICK_PIVOT_Y;
    g.clear();
    g.fillStyle(0xb27c4a, 1);
    g.fillRect(-5, yTop + 4, 10, yBot - yTop - 4);
    g.fillEllipse(0, yTop + 4, 10, 8);
    g.fillStyle(0xc79a63, 1);
    g.fillRect(-1.5, yTop + 6, 3, yBot - yTop - 8);
    g.fillStyle(0xb27c4a, 1);
    g.fillCircle(0, yBot + 2, 8);
  }

  /** Re-aim the shaft's top end (called as a sliding dango moves). */
  private refreshStickTop(): void {
    if (this.stickGfx?.active) this.drawStick(this.stickTopY());
  }

  /**
   * Redraw the big building skewer: ONE bamboo stick — shaft
   * running down through the stack, rounded handle end toward
   * the counter, and the top end capped by the top dango (see
   * stickTopY). The stick is drawn FIRST, so seated dango cover
   * the shaft where they sit on it: it disappears into each
   * dango's underside. `built[0]` is the bottom dango, just
   * above the handle section.
   */
  private renderSkewer(squashLast = false): void {
    if (!this.skewer) return;
    this.skewer.removeAll(true);
    const g = this.add.graphics();
    g.setPosition(SKEWER_X, STICK_PIVOT_Y);
    this.stickGfx = g;
    this.skewer.add([g]);
    this.drawStick(this.stickTopY());
    this.built.forEach((kind, i) => {
      const img = this.add
        .image(SKEWER_X, SLOT_BOTTOM_Y - i * SLOT_STEP, kind)
        .setDisplaySize(BUILD_DANGO_SIZE, BUILD_DANGO_SIZE);
      if (squashLast && i === this.built.length - 1) {
        const base = img.scaleX;
        img.setScale(base * 1.3, base * 0.7);
        this.tweens.add({
          targets: img,
          scaleX: base,
          scaleY: base,
          duration: 260,
          ease: 'Back.easeOut',
        });
      }
      this.skewer?.add(img);
    });
  }

  private buildPad(): void {
    ALL_DANGO_KINDS.forEach((kind, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      const x = PAD_X0 + col * (CELL_W + CELL_GAP) + CELL_W / 2;
      const y = PAD_Y0 + row * (CELL_H + CELL_GAP) + CELL_H / 2;
      const container = this.add.container(x, y).setDepth(20);
      const bg = this.add.rectangle(0, 0, CELL_W, CELL_H, 0xffffff, 1);
      bg.setStrokeStyle(3, 0xf0d9b5);
      bg.setInteractive({ useHandCursor: true });
      const img = this.add.image(0, -13, kind).setDisplaySize(44, 44);
      const name = this.add
        .text(0, 25, DANGO_INFO[kind].name.toUpperCase(), {
          fontFamily: FONT_BODY,
          fontSize: '14px',
          fontStyle: 'bold',
          color: COLOR_TEXT,
        })
        .setOrigin(0.5);
      container.add([bg, img, name]);
      this.padCards.set(kind, { container, x, y });
      bg.on('pointerdown', () => {
        sound.unlock();
        container.setScale(0.96);
        this.tapKind(kind);
      });
      bg.on('pointerup', () => container.setScale(1));
      bg.on('pointerout', () => container.setScale(1));
    });

    // SERVE: the 8th cell, bottom-right. Pale until every skewer of
    // the order is complete, then full pink and live.
    const sx = PAD_X0 + 3 * (CELL_W + CELL_GAP) + CELL_W / 2;
    const sy = PAD_Y0 + (CELL_H + CELL_GAP) + CELL_H / 2;
    this.serveContainer = this.add.container(sx, sy).setDepth(20);
    this.serveBg = this.add
      .rectangle(0, 0, CELL_W, CELL_H, SERVE_DISABLED, 1)
      .setStrokeStyle(3, 0xc08552)
      .setInteractive({ useHandCursor: true });
    this.serveText = this.add
      .text(0, 0, 'SERVE!', {
        fontFamily: FONT_HEADING,
        fontSize: '21px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.serveContainer.add([this.serveBg, this.serveText]);
    this.serveBg.on('pointerdown', () => {
      sound.unlock();
      if (!this.allComplete()) {
        // Not ready: a soft nudge, no penalty.
        this.tweens.add({
          targets: this.serveContainer,
          x: sx + 4,
          duration: 45,
          yoyo: true,
          repeat: 3,
          onComplete: () => this.serveContainer?.setX(sx),
        });
        return;
      }
      this.serveContainer?.setScale(0.96);
      this.pressServe();
    });
    this.serveBg.on('pointerup', () => this.serveContainer?.setScale(1));
    this.serveBg.on('pointerout', () => this.serveContainer?.setScale(1));
  }

  private allComplete(): boolean {
    return this.skewers.length > 0 && this.completed.every((done) => done);
  }

  private updateServeCell(): void {
    const ready = this.allComplete();
    this.serveBg?.setFillStyle(ready ? SERVE_ENABLED : SERVE_DISABLED, 1);
    this.serveText?.setAlpha(ready ? 1 : 0.8);
  }

  /** Feedback on the tapped card: red flash + shake. */
  private flashPadCard(kind: DangoKind): void {
    const card = this.padCards.get(kind);
    if (!card) return;
    const flash = this.add
      .rectangle(card.x, card.y, CELL_W, CELL_H, 0xe0653a, 0.35)
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
        fontFamily: FONT_HEADING,
        fontSize: '40px',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5);
    this.pauseOverlay.add([dim, panel, title]);
    const resume = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, 'RESUME', {
        fontFamily: FONT_HEADING,
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
        fontFamily: FONT_HEADING,
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
        fontFamily: FONT_HEADING,
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

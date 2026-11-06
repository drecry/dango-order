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
 * The play area fills the whole phone screen: only a slim HUD sits on
 * top (DG, time, served, combo, sound, pause). Rules and introductions
 * live on their own screens (Title -> How to Play / Meet the Dango).
 *
 * All rules (orders, DG, patience, timer) come from the pure logic in
 * src/logic/order.ts and the JSON configs — this scene only renders.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dimensions';
import type { DangoKind } from '../constants/assets';
import { ALL_DANGO_KINDS, DANGO_INFO } from '../constants/assets';
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
import { CURRENCY, loadBalance, loadEconomy } from '../systems/EconomyConfig';
import { sound } from '../systems/sound';
import { COLOR_TEXT, makeIconButton } from './ui';

export const GAME_SCENE_KEY = 'GameScene';

const HUD_TOP = 20;
const PAD_KINDS: readonly DangoKind[] = ALL_DANGO_KINDS;

export class GameScene extends Phaser.Scene {
  private economy: Economy = loadEconomy();
  private balance: Balance = loadBalance();
  private state: OrderState = initialState();
  private order: Order = [];
  private built: DangoKind[] = [];
  private patience = 0;
  private paused = false;
  private over = false;
  private betweenCustomers = false;

  private dgText: Phaser.GameObjects.Text | null = null;
  private timeText: Phaser.GameObjects.Text | null = null;
  private servedText: Phaser.GameObjects.Text | null = null;
  private comboText: Phaser.GameObjects.Text | null = null;
  private customerText: Phaser.GameObjects.Text | null = null;
  private patienceFill: Phaser.GameObjects.Rectangle | null = null;
  private patienceText: Phaser.GameObjects.Text | null = null;
  private messageText: Phaser.GameObjects.Text | null = null;
  private orderSlots: Phaser.GameObjects.Container | null = null;
  private skewer: Phaser.GameObjects.Container | null = null;
  private customerPanel: Phaser.GameObjects.Container | null = null;
  private pauseOverlay: Phaser.GameObjects.Container | null = null;
  private soundText: Phaser.GameObjects.Text | null = null;

  constructor() {
    super(GAME_SCENE_KEY);
  }

  create(): void {
    this.economy = loadEconomy();
    this.balance = loadBalance();
    this.state = initialState(this.balance);
    this.order = [];
    this.built = [];
    this.patience = this.balance.patienceSeconds;
    this.paused = false;
    this.over = false;
    this.betweenCustomers = false;

    this.buildHud();
    this.buildCustomerPanel();
    this.buildSkewerArea();
    this.buildPad();
    this.buildPauseOverlay();
    this.newCustomer();

    // Read-only debug hook for automated playtests (used by the
    // headless Chromium playtest; harmless in production).
    (
      window as unknown as {
        __dangoOrder?: {
          getOrder: () => DangoKind[];
          getBuilt: () => DangoKind[];
          getState: () => OrderState;
          getPatience: () => number;
          tap: (kind: DangoKind) => void;
        };
      }
    ).__dangoOrder = {
      getOrder: () => [...this.order],
      getBuilt: () => [...this.built],
      getState: () => ({ ...this.state }),
      getPatience: () => this.patience,
      tap: (kind: DangoKind) => this.tapKind(kind),
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
    this.state = tick(this.state, dt, this.balance);
    if (!this.betweenCustomers) {
      this.patience = Math.max(0, this.patience - dt);
      this.updatePatienceBar();
      if (this.patience <= 0) {
        this.loseCustomer();
      }
    }
    this.updateTimeText();
    if (this.state.over) {
      this.endGame();
    }
  }

  // ----- customers ----------------------------------------------------

  private newCustomer(): void {
    if (this.over) return;
    this.order = rollOrder(this.state.served, this.economy, this.balance);
    this.built = [];
    this.patience = this.balance.patienceSeconds;
    this.betweenCustomers = false;
    this.setMessage('', '#5a3a28');
    this.renderCustomer();
    this.renderSkewer();
    this.updatePatienceBar();
  }

  private tapKind(kind: DangoKind): void {
    if (this.paused || this.over || this.betweenCustomers) return;
    const want = this.order[this.built.length];
    if (kind === want) {
      sound.pick();
      this.built.push(kind);
      this.renderCustomer();
      this.renderSkewer();
      if (this.built.length === this.order.length) {
        this.serveOrder();
      }
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
    if (this.customerPanel) {
      this.tweens.add({
        targets: this.customerPanel,
        x: 6,
        duration: 60,
        yoyo: true,
        repeat: 3,
        onComplete: () => this.customerPanel?.setX(0),
      });
    }
  }

  private serveOrder(): void {
    this.betweenCustomers = true;
    const result = applyServe(
      this.state,
      this.order,
      this.patience,
      this.economy,
      this.balance,
    );
    this.state = result.state;
    if (result.isVip) {
      sound.vip();
      this.setMessage(
        `VIP order! +${result.earnedDG} ${CURRENCY} (2x sales)`,
        '#c89b00',
      );
    } else {
      sound.serve();
      this.setMessage(`Served! +${result.earnedDG} ${CURRENCY}`, '#5a8a4a');
    }
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
    this.updateHud();
    this.time.delayedCall(500, () => this.newCustomer());
  }

  private loseCustomer(): void {
    if (this.betweenCustomers) return;
    this.betweenCustomers = true;
    sound.miss();
    this.state = applyLeave(this.state).state;
    this.setMessage('The customer left... Next customer!', '#e86a7a');
    this.updateHud();
    this.time.delayedCall(500, () => this.newCustomer());
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
    this.time.delayedCall(900, () => {
      this.scene.start('ResultScene', {
        dg,
        served: this.state.served,
        bestCombo: this.state.bestCombo,
        bestDG: best.bestDG,
        bestServed: best.bestServed,
        bestComboBest: best.bestCombo,
        isNewRecord,
      });
    });
  }

  // ----- HUD ----------------------------------------------------------

  private buildHud(): void {
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

  private updateTimeText(): void {
    const seconds = Math.ceil(this.state.timeLeft);
    this.timeText?.setText(`${seconds}`);
    this.timeText?.setColor(seconds <= 10 ? '#e86a7a' : COLOR_TEXT);
  }

  // ----- customer panel ------------------------------------------------

  private buildCustomerPanel(): void {
    this.customerPanel = this.add.container(0, 0);
    const panel = this.add.rectangle(
      GAME_WIDTH / 2,
      194,
      480,
      184,
      0xfff7e6,
      1,
    );
    panel.setStrokeStyle(2, 0xc89b6a);
    this.customerPanel.add(panel);
    this.customerText = this.add
      .text(50, 120, '', {
        fontFamily: '"Mochiy Pop One", "Zen Maru Gothic", sans-serif',
        fontSize: '21px',
        color: COLOR_TEXT,
      })
      .setOrigin(0, 0);
    this.customerPanel.add(this.customerText);
    this.orderSlots = this.add.container(0, 0);
    this.customerPanel.add(this.orderSlots);
    // Patience bar.
    const barBg = this.add.rectangle(GAME_WIDTH / 2, 254, 440, 14, 0xf0e0c8);
    this.customerPanel.add(barBg);
    this.patienceFill = this.add.rectangle(
      GAME_WIDTH / 2 - 220,
      254,
      440,
      14,
      0x7fae5a,
    );
    this.patienceFill.setOrigin(0, 0.5);
    this.customerPanel.add(this.patienceFill);
    this.patienceText = this.add
      .text(GAME_WIDTH / 2, 268, '', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '15px',
        color: '#a08060',
      })
      .setOrigin(0.5, 0);
    this.customerPanel.add(this.patienceText);
    this.messageText = this.add
      .text(GAME_WIDTH / 2, 308, '', {
        fontFamily: '"Zen Maru Gothic", sans-serif',
        fontSize: '19px',
        fontStyle: 'bold',
        color: COLOR_TEXT,
      })
      .setOrigin(0.5, 0);
  }

  private setMessage(text: string, color: string): void {
    this.messageText?.setText(text).setColor(color);
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

    this.orderSlots?.removeAll(true);
    const spacing = 100;
    const total = (this.order.length - 1) * spacing;
    const startX = GAME_WIDTH / 2 - total / 2;
    this.order.forEach((kind, i) => {
      const x = startX + i * spacing;
      const built = i < this.built.length;
      const ring = this.add.circle(x, 186, 36, 0xfffaf0, 1);
      ring.setStrokeStyle(3, built ? 0x5a8a4a : 0xd8b98a);
      const img = this.add
        .image(x, 186, kind)
        .setDisplaySize(56, 56)
        .setAlpha(built ? 1 : 0.55);
      const num = this.add
        .text(x, 226, `${i + 1}`, {
          fontFamily: '"Zen Maru Gothic", sans-serif',
          fontSize: '15px',
          fontStyle: 'bold',
          color: built ? '#5a8a4a' : '#a08060',
        })
        .setOrigin(0.5, 0);
      this.orderSlots?.add([ring, img, num]);
    });
  }

  private updatePatienceBar(): void {
    const ratio = Math.max(0, this.patience / this.balance.patienceSeconds);
    this.patienceFill?.setSize(440 * ratio, 14);
    this.patienceFill?.setFillStyle(ratio < 0.35 ? 0xe0653a : 0x7fae5a, 1);
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
    this.skewer = this.add.container(0, 0);
  }

  private renderSkewer(): void {
    this.skewer?.removeAll(true);
    // Bamboo stick + plate.
    const stick = this.add.rectangle(GAME_WIDTH / 2, 480, 6, 190, 0xc89b6a);
    const plate = this.add.ellipse(GAME_WIDTH / 2, 580, 150, 18, 0xe0aa7a);
    this.skewer?.add([stick, plate]);
    // Built dango stack bottom-up: first tap sits at the bottom.
    this.built.forEach((kind, i) => {
      const y = 552 - i * 56;
      const img = this.add
        .image(GAME_WIDTH / 2, y, kind)
        .setDisplaySize(56, 56);
      this.skewer?.add(img);
    });
  }

  private buildPad(): void {
    const rows: DangoKind[][] = [PAD_KINDS.slice(0, 4), PAD_KINDS.slice(4)];
    rows.forEach((row, r) => {
      const y = 660 + r * 150;
      const spacing = 120;
      const total = (row.length - 1) * spacing;
      const startX = GAME_WIDTH / 2 - total / 2;
      row.forEach((kind, i) => {
        const x = startX + i * spacing;
        const info = DANGO_INFO[kind];
        const container = this.add.container(x, y);
        const bg = this.add.rectangle(0, 0, 104, 138, 0xffffff, 1);
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
        bg.on('pointerdown', () => {
          sound.unlock();
          container.setScale(0.94);
          this.tapKind(kind);
        });
        bg.on('pointerup', () => container.setScale(1));
        bg.on('pointerout', () => container.setScale(1));
      });
    });
    this.add
      .text(
        GAME_WIDTH / 2,
        926,
        'Tap the dango in order — bottom of the skewer first!',
        {
          fontFamily: '"Zen Maru Gothic", sans-serif',
          fontSize: '15px',
          color: '#a08060',
        },
      )
      .setOrigin(0.5, 0);
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

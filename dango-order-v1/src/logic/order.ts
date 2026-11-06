/**
 * Dango Order — pure game rules (no Phaser, no DOM).
 *
 * Everything that decides the game lives here so Vitest can check it in
 * Node without a browser: which order a customer wants, whether a tap is
 * the right dango, and how many DG a served order earns. The Phaser
 * scenes only render this state.
 *
 * DG formula (PROPOSED — not yet confirmed by the user; see README.md):
 * money earned IS the score, like Dango Drop — every served skewer is
 * sold at the shop.
 *
 *   DG for one served order
 *     = sum(menu prices of the ordered dango) x SELL_MULTIPLIER (x3)
 *     x VIP_MULTIPLIER (x2, only when the order has a Golden dango)
 *     + WAIT_BONUS (floor(patience seconds left) x 2 DG)
 *     + COMBO_BONUS (5 DG x combo, consecutive serves in a row)
 *
 * A Matcha order adds +3 seconds to the clock when served. A Golden
 * order is a VIP customer worth 2x sales. Wrong taps cost patience
 * (1.5 s). A customer whose patience runs out leaves and resets the
 * combo. The shift lasts 60 seconds.
 */
import type { DangoKind } from '../constants/assets';
import { REGULAR_KINDS } from '../constants/assets';

/** Menu price of each dango in DG (from dango-economy.json). */
export interface Economy {
  prices: Record<DangoKind, number>;
  /** Chance the last slot of an order is Golden (0.12). */
  goldenRate: number;
  /** Chance the last slot of an order is Matcha (0.16). */
  matchaRate: number;
  /** Multiplier applied to the menu price when an order is sold. */
  sellMultiplier: number;
  /** Sales multiplier for a VIP (Golden) order. */
  vipMultiplier: number;
  /** DG per whole patience second left when an order is served. */
  waitBonusPerSecond: number;
  /** DG per combo step on a serve. */
  comboBonus: number;
  /** Extra clock seconds for serving a Matcha order. */
  matchaBonusSeconds: number;
}

/** Feel settings (from game-balance.json). */
export interface Balance {
  /** Length of one shift in seconds. */
  shiftSeconds: number;
  /** Clock cap in seconds (Matcha bonus cannot push past this). */
  maxTimeSeconds: number;
  /** Seconds a customer waits before leaving. */
  patienceSeconds: number;
  /** Patience lost on a wrong tap. */
  wrongTapPenaltySeconds: number;
  /** Dango per order early in the shift. */
  earlyOrderLength: number;
  /** Dango per order once the shift gets busy. */
  lateOrderLength: number;
  /** Orders served before the longer orders appear. */
  lateAfterServed: number;
}

/** Sensible defaults matching the shipped JSON configs. */
export const DEFAULT_ECONOMY: Economy = {
  prices: {
    shiratama: 1,
    anko: 2,
    sakura: 3,
    mitarashi: 4,
    yomogi: 5,
    matcha: 10,
    golden: 100,
  },
  goldenRate: 0.12,
  matchaRate: 0.16,
  sellMultiplier: 3,
  vipMultiplier: 2,
  waitBonusPerSecond: 2,
  comboBonus: 5,
  matchaBonusSeconds: 3,
};

export const DEFAULT_BALANCE: Balance = {
  shiftSeconds: 60,
  maxTimeSeconds: 99,
  patienceSeconds: 12,
  wrongTapPenaltySeconds: 1.5,
  earlyOrderLength: 3,
  lateOrderLength: 4,
  lateAfterServed: 5,
};

/** An order is the dango sequence a customer wants, in tap order. */
export type Order = readonly DangoKind[];

/** A Golden dango in the order makes it a VIP order (2x sales). */
export const isVipOrder = (order: Order): boolean =>
  order.includes('golden');

/** A Matcha dango in the order adds time when it is served. */
export const hasMatcha = (order: Order): boolean =>
  order.includes('matcha');

/**
 * Roll one customer's order. The length is 3 early in the shift and 4
 * once `servedCount` reaches the late threshold. The last slot is
 * special: Golden (VIP) or Matcha (time bonus), rarely. `random` is
 * injectable so tests can use a seeded RNG.
 */
export const rollOrder = (
  servedCount: number,
  economy: Economy = DEFAULT_ECONOMY,
  balance: Balance = DEFAULT_BALANCE,
  random: () => number = Math.random,
): Order => {
  const length =
    servedCount >= balance.lateAfterServed
      ? balance.lateOrderLength
      : balance.earlyOrderLength;
  const order: DangoKind[] = [];
  for (let i = 0; i < length; i++) {
    const index = Math.floor(random() * REGULAR_KINDS.length);
    order.push(REGULAR_KINDS[index]);
  }
  const special = random();
  if (special < economy.goldenRate) {
    order[length - 1] = 'golden';
  } else if (special < economy.goldenRate + economy.matchaRate) {
    order[length - 1] = 'matcha';
  }
  return order;
};

/**
 * DG earned by serving one order.
 * `patienceLeftSeconds` is the customer's remaining patience (0..12).
 * `combo` counts consecutive serves INCLUDING this one (1+).
 */
export const serveDG = (
  order: Order,
  patienceLeftSeconds: number,
  combo: number,
  economy: Economy = DEFAULT_ECONOMY,
): number => {
  const sold = order.reduce((sum, kind) => sum + economy.prices[kind], 0);
  const base = sold * economy.sellMultiplier;
  const vip = isVipOrder(order) ? base * economy.vipMultiplier : base;
  const wait =
    Math.max(0, Math.floor(patienceLeftSeconds)) *
    economy.waitBonusPerSecond;
  const comboBonus = economy.comboBonus * combo;
  return vip + wait + comboBonus;
};

/** Minimal per-shift state, driven by the pure rules above. */
export interface OrderState {
  served: number;
  lost: number;
  combo: number;
  bestCombo: number;
  totalDG: number;
  timeLeft: number;
  over: boolean;
}

export const initialState = (
  balance: Balance = DEFAULT_BALANCE,
): OrderState => ({
  served: 0,
  lost: 0,
  combo: 0,
  bestCombo: 0,
  totalDG: 0,
  timeLeft: balance.shiftSeconds,
  over: false,
});

/**
 * Apply one served order and return the new state plus what happened.
 * Pure: no mutation of the input state.
 */
export const applyServe = (
  state: OrderState,
  order: Order,
  patienceLeftSeconds: number,
  economy: Economy = DEFAULT_ECONOMY,
  balance: Balance = DEFAULT_BALANCE,
): {
  state: OrderState;
  earnedDG: number;
  isVip: boolean;
  timeBonus: number;
} => {
  const combo = state.combo + 1;
  const earnedDG = serveDG(order, patienceLeftSeconds, combo, economy);
  const timeBonus = hasMatcha(order) ? economy.matchaBonusSeconds : 0;
  const timeLeft = Math.min(
    balance.maxTimeSeconds,
    state.timeLeft + timeBonus,
  );
  return {
    state: {
      ...state,
      served: state.served + 1,
      combo,
      bestCombo: Math.max(state.bestCombo, combo),
      totalDG: state.totalDG + earnedDG,
      timeLeft,
    },
    earnedDG,
    isVip: isVipOrder(order),
    timeBonus,
  };
};

/** A customer whose patience ran out leaves; the combo resets. */
export const applyLeave = (state: OrderState): { state: OrderState } => ({
  state: { ...state, lost: state.lost + 1, combo: 0 },
});

/** Advance the shift clock. Returns the state with `over` set at 0. */
export const tick = (
  state: OrderState,
  dtSeconds: number,
  balance: Balance = DEFAULT_BALANCE,
): OrderState => {
  void balance;
  if (state.over) return state;
  const timeLeft = Math.max(0, state.timeLeft - dtSeconds);
  return { ...state, timeLeft, over: timeLeft <= 0 };
};

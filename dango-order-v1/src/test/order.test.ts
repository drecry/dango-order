/**
 * Tests for the Dango Order rules engine (src/logic/order.ts).
 * Pure logic — no Phaser, no browser — so Vitest runs them in Node.
 */
import { describe, expect, it } from 'vitest';
import {
  applyLeave,
  applyServe,
  DEFAULT_BALANCE,
  DEFAULT_ECONOMY,
  hasMatcha,
  initialState,
  isVipOrder,
  rollOrder,
  serveDG,
  tick,
} from '../logic/order';

describe('rollOrder', () => {
  it('rolls 3 dango early in the shift, 4 after 5 served', () => {
    const early = rollOrder(0, DEFAULT_ECONOMY, DEFAULT_BALANCE, () => 0.5);
    expect(early).toHaveLength(3);
    const late = rollOrder(5, DEFAULT_ECONOMY, DEFAULT_BALANCE, () => 0.5);
    expect(late).toHaveLength(4);
    const justBefore = rollOrder(
      4,
      DEFAULT_ECONOMY,
      DEFAULT_BALANCE,
      () => 0.5,
    );
    expect(justBefore).toHaveLength(3);
  });

  it('rolls a golden last slot below the golden rate', () => {
    // random() = 0.05: regular picks (index 2 = sakura) + special 0.05 < 0.12.
    const order = rollOrder(0, DEFAULT_ECONOMY, DEFAULT_BALANCE, () => 0.05);
    expect(order[order.length - 1]).toBe('golden');
    expect(isVipOrder(order)).toBe(true);
  });

  it('rolls a matcha last slot between the golden and combined rates', () => {
    // special 0.2: >= 0.12 and < 0.12 + 0.16 = 0.28.
    const order = rollOrder(0, DEFAULT_ECONOMY, DEFAULT_BALANCE, () => 0.2);
    expect(order[order.length - 1]).toBe('matcha');
    expect(hasMatcha(order)).toBe(true);
    expect(isVipOrder(order)).toBe(false);
  });

  it('rolls a plain order above the combined special rate', () => {
    const order = rollOrder(0, DEFAULT_ECONOMY, DEFAULT_BALANCE, () => 0.5);
    expect(order).toEqual(['sakura', 'sakura', 'sakura']);
    expect(isVipOrder(order)).toBe(false);
    expect(hasMatcha(order)).toBe(false);
  });
});

describe('serveDG — DG is the score, every order is sold', () => {
  it('sells at 3x the summed menu price, plus wait and combo bonuses', () => {
    // Shiratama 1 + Anko 2 + Sakura 3 = 6, x3 = 18. Patience 10s left:
    // +20 wait. Combo 1: +5. Total 43.
    expect(serveDG(['shiratama', 'anko', 'sakura'], 10, 1)).toBe(43);
    // No patience left, first serve: 18 + 0 + 5 = 23.
    expect(serveDG(['shiratama', 'anko', 'sakura'], 0, 1)).toBe(23);
    // Combo 3: 18 + 0 + 15 = 33.
    expect(serveDG(['shiratama', 'anko', 'sakura'], 0, 3)).toBe(33);
  });

  it('doubles the sold sum for a VIP (Golden) order', () => {
    // Shiratama 1 + Anko 2 + Golden 100 = 103, x3 = 309, x2 VIP = 618.
    // Patience 8s: +16. Combo 1: +5. Total 639.
    expect(serveDG(['shiratama', 'anko', 'golden'], 8, 1)).toBe(639);
  });

  it('counts only whole patience seconds for the wait bonus', () => {
    // 10.9s left counts as 10s: 18 + 20 + 5 = 43.
    expect(serveDG(['shiratama', 'anko', 'sakura'], 10.9, 1)).toBe(43);
  });
});

describe('applyServe / applyLeave / tick — full shift flow', () => {
  it('serves orders, builds a combo, adds matcha time', () => {
    let state = initialState();
    expect(state.timeLeft).toBe(60);
    const r1 = applyServe(state, ['shiratama', 'anko', 'sakura'], 10);
    expect(r1.earnedDG).toBe(43);
    expect(r1.isVip).toBe(false);
    expect(r1.timeBonus).toBe(0);
    state = r1.state;
    expect(state.served).toBe(1);
    expect(state.combo).toBe(1);
    expect(state.totalDG).toBe(43);

    // A matcha order adds +3 seconds and keeps the combo going.
    const r2 = applyServe(state, ['anko', 'sakura', 'matcha'], 12);
    expect(r2.timeBonus).toBe(3);
    expect(r2.state.timeLeft).toBe(63);
    expect(r2.state.combo).toBe(2);
    state = r2.state;
    expect(state.bestCombo).toBe(2);

    // A customer leaving resets the combo but keeps the sales.
    state = applyLeave(state).state;
    expect(state.lost).toBe(1);
    expect(state.combo).toBe(0);
    expect(state.totalDG).toBe(r1.earnedDG + r2.earnedDG);
  });

  it('the clock runs out after 60 seconds', () => {
    let state = initialState();
    state = tick(state, 59.9);
    expect(state.over).toBe(false);
    state = tick(state, 0.2);
    expect(state.timeLeft).toBe(0);
    expect(state.over).toBe(true);
    // Ticking further does nothing once over.
    expect(tick(state, 5)).toBe(state);
  });

  it('a served matcha order cannot push the clock past the cap', () => {
    let state = { ...initialState(), timeLeft: 98 };
    const r = applyServe(state, ['shiratama', 'anko', 'matcha'], 5);
    expect(r.state.timeLeft).toBe(99);
  });
});

describe('simulated play-through — a 60-second shift with a seeded RNG', () => {
  it('plays a whole shift: DG accrues, customers are served, shift ends', () => {
    // Deterministic pseudo-random generator (mulberry32).
    let seed = 7;
    const random = (): number => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    let state = initialState();
    let ordersSeen = 0;
    // Each "customer" takes 4 seconds of shift time: tap the order
    // instantly (patience 10s left) and serve.
    while (!state.over) {
      const order = rollOrder(state.served, DEFAULT_ECONOMY, DEFAULT_BALANCE, random);
      ordersSeen += 1;
      const r = applyServe(state, order, 10);
      state = r.state;
      state = tick(state, 4);
    }
    expect(ordersSeen).toBeGreaterThan(5);
    expect(state.served).toBe(ordersSeen);
    expect(state.totalDG).toBeGreaterThan(100);
    expect(state.timeLeft).toBe(0);
    expect(state.over).toBe(true);
    expect(state.bestCombo).toBe(state.served);
  });
});

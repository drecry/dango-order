/**
 * Economy / balance config loaders (Dango Order).
 *
 * Money and feel settings live in JSON, never hard-coded in game code —
 * the Dango Drop rule ("economy settings live outside the code"). Balance
 * tweaks are a JSON edit, not a code change.
 */
import economyJson from '../config/dango-economy.json';
import balanceJson from '../config/game-balance.json';
import type { Balance, Economy } from '../logic/order';
import type { DangoKind } from '../constants/assets';

interface EconomyJson {
  currency: string;
  prices: Record<DangoKind, number>;
  specialRates: { golden: number; matcha: number };
  order: {
    sellMultiplier: number;
    vipMultiplier: number;
    waitBonusPerSecond: number;
    comboBonus: number;
    matchaBonusSeconds: number;
  };
}

interface BalanceJson {
  shift: { seconds: number; maxTimeSeconds: number };
  patience: { seconds: number; wrongTapPenaltySeconds: number };
  order: {
    earlyLength: number;
    lateLength: number;
    lateAfterServed: number;
  };
}

/** The DG currency of this game (always "DG", shared with Dango Drop). */
export const CURRENCY = (economyJson as EconomyJson).currency;

export const loadEconomy = (): Economy => {
  const json = economyJson as EconomyJson;
  return {
    prices: json.prices,
    goldenRate: json.specialRates.golden,
    matchaRate: json.specialRates.matcha,
    sellMultiplier: json.order.sellMultiplier,
    vipMultiplier: json.order.vipMultiplier,
    waitBonusPerSecond: json.order.waitBonusPerSecond,
    comboBonus: json.order.comboBonus,
    matchaBonusSeconds: json.order.matchaBonusSeconds,
  };
};

export const loadBalance = (): Balance => {
  const json = balanceJson as BalanceJson;
  return {
    shiftSeconds: json.shift.seconds,
    maxTimeSeconds: json.shift.maxTimeSeconds,
    patienceSeconds: json.patience.seconds,
    wrongTapPenaltySeconds: json.patience.wrongTapPenaltySeconds,
    earlyOrderLength: json.order.earlyLength,
    lateOrderLength: json.order.lateLength,
    lateAfterServed: json.order.lateAfterServed,
  };
};

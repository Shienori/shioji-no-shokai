import type { ContractRewardBreakdown, Gold } from "./types";
import { EXPENSE_RATE, MINIMUM_NET_PROFIT } from "../data/gameConstants";

export function calculateCargoValue(unitPrice: number, quantity: number): Gold {
  return Math.round(unitPrice * quantity);
}

export function calculateVoyageDistanceAllowance(distance: number): Gold {
  if (distance <= 30) return 20;
  if (distance <= 60) return 35;
  return 60;
}

export function calculateCargoQ(
  totalWeightTons: number,
  totalVolumeCubicMeters: number,
  rewardMultiplier: number,
): number {
  const baseQ = Math.max(totalWeightTons, totalVolumeCubicMeters);
  return baseQ * rewardMultiplier;
}

export function calculateCPlanReward(
  cargoQ: number,
  baseDistanceNm: number,
): Gold {
  const baseTimeHours = baseDistanceNm / 6;
  return Math.round(
    cargoQ * (20 + 35 * baseTimeHours + baseDistanceNm),
  );
}

export function calculateExpense(receivedReward: Gold): Gold {
  return Math.ceil(receivedReward * EXPENSE_RATE);
}

export function calculateNetProfit(receivedReward: Gold, expense: Gold): Gold {
  return receivedReward - expense;
}

export function applyMinimumProfitGuarantee(netProfit: Gold, isOnTime: boolean) {
  if (!isOnTime || netProfit >= MINIMUM_NET_PROFIT) {
    return { netProfit, guaranteeAmount: 0 };
  }
  return { netProfit: MINIMUM_NET_PROFIT, guaranteeAmount: MINIMUM_NET_PROFIT - netProfit };
}

export function createRewardBreakdown(cargoValue: Gold, voyageDistanceAllowance: Gold): ContractRewardBreakdown {
  const offeredReward = cargoValue + voyageDistanceAllowance;
  return { cargoValue, voyageDistanceAllowance, otherAdjustment: 0, offeredReward };
}

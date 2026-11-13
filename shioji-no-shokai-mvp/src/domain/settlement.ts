import type { AcceptedContract, Gold, Voyage } from "./types";
import { applyMinimumProfitGuarantee, calculateExpense, calculateNetProfit } from "./reward";
import { LATE_PENALTY_RATE_PER_HOUR, FUEL_PRICE_GOLD_PER_TON } from "../data/gameConstants";

export interface SettlementResult {
  lateHours: number;
  isOnTime: boolean;
  offeredReward: Gold;
  latePenalty: Gold;
  receivedReward: Gold;
  expense: Gold;
  rawNetProfit: Gold;
  guaranteeAmount: Gold;
  finalPayout: Gold;
  reputationChange: number;
  fuelRefundGold: Gold;
  fuelCostGold: Gold;
}

export function calculateLatePenalty(offeredReward: Gold, lateHours: number): Gold {
  if (lateHours <= 0) return 0;
  return Math.floor(offeredReward * LATE_PENALTY_RATE_PER_HOUR * lateHours);
}

export function settleContract(contract: AcceptedContract, voyage: Voyage): SettlementResult {
  const lateHours = voyage.arrivalLateHours;
  const isOnTime = voyage.isOnTime;
  const latePenalty = calculateLatePenalty(contract.reward.offeredReward, lateHours);
  const receivedReward = Math.max(0, contract.reward.offeredReward - latePenalty);
  const expense = calculateExpense(receivedReward);
  const rawNetProfit = calculateNetProfit(receivedReward, expense);
  const guaranteed = applyMinimumProfitGuarantee(rawNetProfit, isOnTime);
  const fuelRefundGold = voyage.fuelPrepayment?.status === "pending"
    ? voyage.fuelPrepayment.prepaidGold - voyage.fuelPrepayment.consumedGold
    : 0;
  const fuelCostGold = voyage.fuelNavigation?.fuelCostGold ??
    (voyage.fuelNavigation
      ? Math.ceil(voyage.fuelNavigation.fuelConsumedTons * FUEL_PRICE_GOLD_PER_TON)
      : 0);

  return {
    lateHours,
    isOnTime,
    offeredReward: contract.reward.offeredReward,
    latePenalty,
    receivedReward,
    expense,
    rawNetProfit,
    guaranteeAmount: guaranteed.guaranteeAmount,
    finalPayout: guaranteed.netProfit,
    reputationChange: isOnTime ? 0.25 : -0.25,
    fuelRefundGold,
    fuelCostGold,
  };
}

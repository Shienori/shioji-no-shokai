import type { AcceptedContract, Gold, Voyage } from "./types";
import { applyMinimumProfitGuarantee, calculateExpense, calculateNetProfit } from "./reward";
import { LATE_PENALTY_RATE_PER_HOUR } from "../data/gameConstants";

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
}

export function calculateLateHours(unloadingCompletedAt: number, deadlineAt: number): number {
  if (unloadingCompletedAt <= deadlineAt) return 0;
  return Math.floor((unloadingCompletedAt - deadlineAt) / (60 * 60 * 1000));
}

export function calculateLatePenalty(offeredReward: Gold, lateHours: number): Gold {
  if (lateHours <= 0) return 0;
  return Math.floor(offeredReward * LATE_PENALTY_RATE_PER_HOUR * lateHours);
}

export function settleContract(contract: AcceptedContract, voyage: Voyage): SettlementResult {
  const unloadingCompletedAt = voyage.unloadingCompletedAt ?? voyage.estimatedArrivalAt;
  const lateHours = calculateLateHours(unloadingCompletedAt, contract.deadlineAt);
  const isOnTime = lateHours <= 0;
  const latePenalty = calculateLatePenalty(contract.reward.offeredReward, lateHours);
  const receivedReward = Math.max(0, contract.reward.offeredReward - latePenalty);
  const expense = calculateExpense(receivedReward);
  const rawNetProfit = calculateNetProfit(receivedReward, expense);
  const guaranteed = applyMinimumProfitGuarantee(rawNetProfit, isOnTime);

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
    reputationChange: isOnTime ? 0.25 : -0.25
  };
}

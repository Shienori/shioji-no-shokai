import { getCargoLotById } from "../data/cargoLots";
import { calculateCargoLotRequirements } from "./cargoLotUnits";

export interface OfferedRewardInput {
  cargoId: string;
  quantityLots: number;
  baseDistanceNm: number;
}

/** Call when generating a new offer, never when displaying or settling one.
 * baseDistanceNm must come from getShortestRouteDistanceNm.
 * Existing offers retain their stored offeredReward.
 */
export function calculateOfferedReward(input: OfferedRewardInput): number {
  const { cargoId, quantityLots, baseDistanceNm } = input;
  if (!Number.isFinite(baseDistanceNm) || baseDistanceNm <= 0) {
    throw new RangeError("Invalid base route distance");
  }
  const lot = getCargoLotById(cargoId);
  const totals = calculateCargoLotRequirements(lot, quantityLots);
  if (!Number.isFinite(lot.rewardMultiplier) || lot.rewardMultiplier <= 0) {
    throw new RangeError("Invalid cargo reward multiplier");
  }
  const cargoQ = Math.max(totals.totalWeightTons, totals.totalVolumeM3) * lot.rewardMultiplier;
  const baseTimeHours = baseDistanceNm / 6;
  const amount = Math.round(cargoQ * (20 + 35 * baseTimeHours + baseDistanceNm));
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError("Invalid offered reward");
  }
  return amount;
}

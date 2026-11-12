import type { AcceptedContract, Cargo, ContractTemplate, ContractRewardBreakdown, OfferedContract, Route } from "./types";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { ceilTo30Minutes } from "./time";
import { calculateCargoQ, calculateCPlanReward } from "./reward";
import { createContractInstanceId } from "./contractIdentity";
import { createContractWindForecast } from "./contractWindForecast";
import { getCargoLotById } from "../data/cargoLots";
import { createCargoLotSnapshot } from "./cargoLotUnits";
import type { LotAcceptedContract } from "./lotContract";

const HOUR_MS = 60 * 60 * 1000;
const BASE_SPEED_KNOTS = 6;
const OFFER_BUFFER_HOURS = 1;
const TIME_ALLOWANCE_RANGES = {
  hard: [1, 1.5],
  normal: [1.5, 2.5],
  easy: [2.5, 3]
} as const;

export interface ContractSchedule {
  voyageDurationMs: number;
  estimatedArrivalAt: number;
  deadlineAt: number;
}

export function calculateCPlanOfferedReward(
  template: ContractTemplate,
  cargo: Cargo,
  route: Route,
): number {
  const cargoQ = calculateCargoQ(
    template.quantity * cargo.weightPerUnit,
    template.quantity * cargo.unitVolume,
    cargo.rewardMultiplier ?? 1,
  );

  return calculateCPlanReward(cargoQ, route.distance);
}

export function createOfferedContract(
  template: ContractTemplate,
  route: Route,
  generatedAt: number,
): OfferedContract {
  const [minimum, maximum] = TIME_ALLOWANCE_RANGES[template.difficulty ?? "normal"];
  const upperBound = template.difficulty === "easy" ? maximum : maximum - Number.EPSILON * maximum;
  const timeAllowanceRatio = Math.min(upperBound, minimum + Math.random() * (maximum - minimum));
  const baseVoyageHours = route.distance / BASE_SPEED_KNOTS;
  const deadlineHours = baseVoyageHours * timeAllowanceRatio + OFFER_BUFFER_HOURS;
  const cargo = getCargoLotById(template.cargoId);

  return {
    id: createContractInstanceId("offer"),
    templateId: template.id,
    generatedAt,
    deadlineAt: ceilTo30Minutes(generatedAt + deadlineHours * HOUR_MS / GAME_TIME_MULTIPLIER),
    timeAllowanceRatio,
    offeredReward: calculateCPlanOfferedReward(
      template,
      { ...cargo, unitPrice: cargo.unitPrice },
      route,
    ),
  };
}

export function calculateContractSchedule(
  contract: Pick<ContractTemplate, "deadlineHours">,
  route: Route,
  now: number,
): ContractSchedule {
  const voyageDurationMs =
    route.baseVoyageHours * HOUR_MS / GAME_TIME_MULTIPLIER;
  const deadlineDurationMs =
    contract.deadlineHours * HOUR_MS / GAME_TIME_MULTIPLIER;

  return {
    voyageDurationMs,
    estimatedArrivalAt: now + voyageDurationMs,
    deadlineAt: ceilTo30Minutes(now + deadlineDurationMs),
  };
}

export function createContractReward(
  contract: ContractTemplate,
  cargo: Cargo,
  route: Route,
  offeredReward: number,
): ContractRewardBreakdown {
  return {
    cargoValue: offeredReward,
    voyageDistanceAllowance: 0,
    otherAdjustment: 0,
    offeredReward,
  };
}

export function createAcceptedContract(
  template: ContractTemplate,
  route: Route,
  cargo: Cargo,
  acceptedAt: number,
  deadlineAt: number,
  offeredReward: number,
): LotAcceptedContract {
  if (cargo.id !== template.cargoId) throw new Error("Cargo identity mismatch");
  const cargoLotSnapshot = createCargoLotSnapshot(getCargoLotById(template.cargoId), template.quantity);
  const windForecastSnapshot = createContractWindForecast(route, acceptedAt);
  return {
    id: createContractInstanceId("accepted"),
    templateId: template.id,
    shipperId: template.shipperId,
    routeId: template.routeId,
    cargoId: template.cargoId,
    quantity: template.quantity,
    reward: createContractReward(template, { ...cargo, unitPrice: cargoLotSnapshot.unitPrice }, route, offeredReward),
    acceptedAt,
    deadlineAt,
    windForecastSnapshot,
    cargoLotSnapshot,
  };
}

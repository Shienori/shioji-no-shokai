import type { AcceptedContract, Cargo, ContractTemplate, ContractRewardBreakdown, OfferedContract, Route } from "./types";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { ceilTo30Minutes } from "./time";
import { calculateCargoValue, calculateVoyageDistanceAllowance } from "./reward";
import { createContractInstanceId } from "./contractIdentity";

const HOUR_MS = 60 * 60 * 1000;
const BASE_SPEED_KNOTS = 6;
const OFFER_BUFFER_HOURS = 1;

export interface ContractSchedule {
  voyageDurationMs: number;
  estimatedArrivalAt: number;
  deadlineAt: number;
}

export function createOfferedContract(
  template: ContractTemplate,
  route: Route,
  generatedAt: number,
): OfferedContract {
  const timeAllowanceRatio = 1 + Math.random() * 2;
  const baseVoyageHours = route.distance / BASE_SPEED_KNOTS;
  const deadlineHours = baseVoyageHours * timeAllowanceRatio + OFFER_BUFFER_HOURS;

  return {
    id: createContractInstanceId("offer"),
    templateId: template.id,
    generatedAt,
    deadlineAt: ceilTo30Minutes(generatedAt + deadlineHours * HOUR_MS / GAME_TIME_MULTIPLIER),
    timeAllowanceRatio
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
): ContractRewardBreakdown {
  const cargoValue = calculateCargoValue(cargo.unitPrice, contract.quantity);
  const voyageDistanceAllowance = calculateVoyageDistanceAllowance(route.distance);
  return {
    cargoValue,
    voyageDistanceAllowance,
    otherAdjustment: contract.offeredReward - cargoValue - voyageDistanceAllowance,
    offeredReward: contract.offeredReward,
  };
}

export function createAcceptedContract(
  template: ContractTemplate,
  route: Route,
  cargo: Cargo,
  acceptedAt: number,
  deadlineAt: number,
): AcceptedContract {
  return {
    id: createContractInstanceId("accepted"),
    templateId: template.id,
    shipperId: template.shipperId,
    routeId: template.routeId,
    cargoId: template.cargoId,
    quantity: template.quantity,
    reward: createContractReward(template, cargo, route),
    acceptedAt,
    deadlineAt,
  };
}

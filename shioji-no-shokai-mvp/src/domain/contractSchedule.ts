import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { ceilTo30Minutes } from "./time";
import type {
  AcceptedContract,
  Cargo,
  ContractRewardBreakdown,
  ContractTemplate,
  Route,
} from "./types";
import {
  calculateCargoValue,
  calculateVoyageDistanceAllowance,
} from "./reward";

const HOUR_MS = 60 * 60 * 1000;

export interface ContractSchedule {
  voyageDurationMs: number;
  estimatedArrivalAt: number;
  deadlineAt: number;
}

export function calculateContractSchedule(
  contract: Pick<ContractTemplate, "deadlineHours" | "quantity">,
  route: Route,
  cargo: Cargo,
  now: number,
): ContractSchedule {
  const loadingDurationOperationMs =
    cargo.loadingTimeMsPerUnit * contract.quantity;
  const voyageDurationOperationMs =
    route.baseVoyageHours * HOUR_MS;

  const deadlineDurationRealMs =
    contract.deadlineHours * HOUR_MS / GAME_TIME_MULTIPLIER;

  return {
    voyageDurationMs:
      voyageDurationOperationMs / GAME_TIME_MULTIPLIER,
    estimatedArrivalAt:
      now
      + (loadingDurationOperationMs + voyageDurationOperationMs)
        / GAME_TIME_MULTIPLIER,
    deadlineAt: ceilTo30Minutes(
      now + deadlineDurationRealMs,
    ),
  };
}

export function createContractReward(
  contract: ContractTemplate,
  cargo: Cargo,
  route: Route,
): ContractRewardBreakdown {
  const cargoValue = calculateCargoValue(
    cargo.unitPrice,
    contract.quantity,
  );

  const voyageDistanceAllowance =
    calculateVoyageDistanceAllowance(route.distance);

  return {
    cargoValue,
    voyageDistanceAllowance,
    otherAdjustment:
      contract.offeredReward
      - cargoValue
      - voyageDistanceAllowance,
    offeredReward: contract.offeredReward,
  };
}

export function createAcceptedContract(
  template: ContractTemplate,
  route: Route,
  cargo: Cargo,
  acceptedAt: number,
): AcceptedContract {
  const schedule = calculateContractSchedule(
    template,
    route,
    cargo,
    acceptedAt,
  );

  return {
    id: template.id,
    templateId: template.id,
    shipperId: template.shipperId,
    routeId: template.routeId,
    cargoId: template.cargoId,
    quantity: template.quantity,
    reward: createContractReward(template, cargo, route),
    acceptedAt,
    deadlineAt: schedule.deadlineAt,
  };
}

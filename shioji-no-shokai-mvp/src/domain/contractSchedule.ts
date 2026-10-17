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
import { getRouteHexIds } from "./routePath";
import { createRouteSeaForecast } from "./seaCondition";
import { getHexById } from "../data/hexMap";

const HOUR_MS = 60 * 60 * 1000;

export interface ContractSchedule {
  voyageDurationMs: number;
  estimatedArrivalAt: number;
  deadlineAt: number;
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

function getRouteSeaHexIds(route: Route): string[] {
  const routeHexIds = getRouteHexIds(
    route.fromPortId,
    route.toPortId,
  );

  if (!routeHexIds) {
    return [];
  }

  return routeHexIds.filter((hexId) => {
    return getHexById(hexId).kind === "sea";
  });
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
    acceptedAt,
  );

  const seaForecast = createRouteSeaForecast(
    template.routeId,
    getRouteSeaHexIds(route),
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
    seaForecast,
  };
}

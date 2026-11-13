import type {
  AcceptedContract,
  ContractTemplate,
  Gold,
  Route,
  Ship,
  Voyage,
} from "./types";
import { getCargoById } from "../data/cargos";
import { getRouteById } from "../data/routes";
import {
  calculateCPlanOfferedReward,
  createAcceptedContract,
} from "./contractSchedule";
import { createVoyage } from "./voyage";
import { createCoalVoyageNavigation } from "./coalVoyage";
import { getHeavyLoadSpeedFactor } from "./voyage";

export function createAcceptedContractWithCPlanReward(
  template: ContractTemplate,
  route: Route,
  acceptedAt: number,
  deadlineAt: number,
  offeredReward?: Gold,
): AcceptedContract {
  const cargo = getCargoById(template.cargoId);

  const reward =
    offeredReward ??
    calculateCPlanOfferedReward(
      template,
      cargo,
      route,
    );

  return createAcceptedContract(
    template,
    route,
    cargo,
    acceptedAt,
    deadlineAt,
    reward,
  );
}

export function createVoyageForContract(
  contract: AcceptedContract,
  ship: Ship,
  operationTime: number,
  currentRealTime: number,
): Voyage {
  const voyage = createVoyage(
    contract,
    ship,
    operationTime,
    currentRealTime,
  );

  if (ship.kind === "powered") {
    voyage.fuelNavigation = createCoalVoyageNavigation(
      ship,
      getRouteById(contract.routeId),
      getHeavyLoadSpeedFactor(contract, ship),
      ship.cruisingSpeedKnots,
    );
  }

  return voyage;
}

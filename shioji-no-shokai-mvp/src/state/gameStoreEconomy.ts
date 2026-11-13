import type {
  AcceptedContract,
  ContractTemplate,
  GameState,
  Gold,
  Route,
  Ship,
  Voyage,
} from "../domain/types";
import {
  createAcceptedContractWithCPlanReward,
  createVoyageForContract,
} from "../domain/contractAcceptanceFlow";
import { handleFuelDepletion } from "../domain/fuelDepletion";
import { purchaseSecondShip } from "../domain/fleetPurchase";

export function acceptContractWithCPlanReward(
  template: ContractTemplate,
  route: Route,
  currentRealTime: number,
  deadlineAt: number,
  offeredReward: Gold | undefined,
): AcceptedContract {
  return createAcceptedContractWithCPlanReward(
    template,
    route,
    currentRealTime,
    deadlineAt,
    offeredReward,
  );
}

export function createVoyageForAcceptedContract(
  contract: AcceptedContract,
  ship: Ship,
  operationTime: number,
  currentRealTime: number,
): Voyage {
  return createVoyageForContract(
    contract,
    ship,
    operationTime,
    currentRealTime,
  );
}

export function applyFuelDepletion(
  state: GameState,
  contract: AcceptedContract,
  voyage: Voyage,
  ship: Ship,
  stoppedHexId: string,
): GameState {
  return handleFuelDepletion(
    state,
    contract,
    voyage,
    ship,
    stoppedHexId,
  );
}

export function purchaseSecondShipAction(
  state: GameState,
): GameState {
  return purchaseSecondShip(state);
}

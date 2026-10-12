import type { AcceptedContract, Route, Ship, Voyage } from "./types";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";

export function createVoyage(contract: AcceptedContract, ship: Ship, operationTime: number): Voyage {
  const cargo = getCargoById(contract.cargoId);
  const route = getRouteById(contract.routeId);
  const loadingDurationMs = cargo.loadingTimeMsPerUnit * contract.quantity;
  const loadingCompletedAt = operationTime + loadingDurationMs;
  const voyageDurationMs = route.baseVoyageHours * 60 * 60 * 1000;

  return {
    id: `voyage_${contract.id}`,
    shipId: ship.id,
    contractId: contract.id,
    phase: "loading",
    loadingStartedAt: operationTime,
    loadingCompletedAt,
    departedAt: loadingCompletedAt,
    estimatedArrivalAt: loadingCompletedAt + voyageDurationMs,
    arrivedAt: null,
    unloadingStartedAt: null,
    unloadingCompletedAt: null,
    completedAtWorldTime: null,
    settled: false
  };
}

export function progressVoyage(voyage: Voyage, contract: AcceptedContract, operationTime: number, currentRealTime: number): Voyage {
  let result = progressLoading(voyage, operationTime);
  result = progressSailing(result, operationTime);
  result = progressUnloading(result, contract, operationTime, currentRealTime);
  return result;
}

function progressLoading(voyage: Voyage, operationTime: number): Voyage {
  if (voyage.phase !== "loading" || operationTime < voyage.loadingCompletedAt) return voyage;
  return { ...voyage, phase: "sailing", departedAt: voyage.loadingCompletedAt };
}

function progressSailing(voyage: Voyage, operationTime: number): Voyage {
  if (voyage.phase !== "sailing" || operationTime < voyage.estimatedArrivalAt) return voyage;
  return { ...voyage, phase: "unloading", arrivedAt: voyage.estimatedArrivalAt, unloadingStartedAt: voyage.estimatedArrivalAt };
}

function progressUnloading(voyage: Voyage, contract: AcceptedContract, operationTime: number, currentRealTime: number): Voyage {
  if (voyage.phase !== "unloading") return voyage;
  const cargo = getCargoById(contract.cargoId);
  const unloadingCompletedAt = (voyage.unloadingStartedAt ?? 0) + cargo.unloadingTimeMsPerUnit * contract.quantity;
  if (operationTime < unloadingCompletedAt) return voyage;

  const elapsedOperationTime = unloadingCompletedAt - voyage.loadingStartedAt;
  const completedAtWorldTime = contract.acceptedAt + elapsedOperationTime / 6;

  return {
    ...voyage,
    phase: "completed",
    unloadingCompletedAt,
    completedAtWorldTime,
    settled: false
  };
}

export function calculateVoyageProgress(voyage: Voyage, contract: AcceptedContract, operationTime: number): number {
  if (voyage.phase === "loading") {
    const total = voyage.loadingCompletedAt - voyage.loadingStartedAt;
    return Math.min(1, Math.max(0, (operationTime - voyage.loadingStartedAt) / total));
  }
  if (voyage.phase === "sailing") {
    const total = voyage.estimatedArrivalAt - voyage.departedAt;
    return Math.min(1, Math.max(0, (operationTime - voyage.departedAt) / total));
  }
  if (voyage.phase === "unloading") {
    const cargo = getCargoById(contract.cargoId);
    const total = cargo.unloadingTimeMsPerUnit * contract.quantity;
    return Math.min(1, Math.max(0, (operationTime - (voyage.unloadingStartedAt ?? 0)) / total));
  }
  return 1;
}
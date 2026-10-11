import type { AcceptedContract, Route, Ship, Voyage } from "./types";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";

export function createVoyage(contract: AcceptedContract, ship: Ship, currentGameTime: number): Voyage {
  const cargo = getCargoById(contract.cargoId);
  const route = getRouteById(contract.routeId);
  const loadingDurationMs = cargo.loadingTimeMsPerUnit * contract.quantity;
  const loadingCompletedAt = currentGameTime + loadingDurationMs;
  const voyageDurationMs = route.baseVoyageHours * 60 * 60 * 1000;

  return {
    id: `voyage_${contract.id}`,
    shipId: ship.id,
    contractId: contract.id,
    phase: "loading",
    loadingStartedAt: currentGameTime,
    loadingCompletedAt,
    departedAt: loadingCompletedAt,
    estimatedArrivalAt: loadingCompletedAt + voyageDurationMs,
    arrivedAt: null,
    unloadingStartedAt: null,
    unloadingCompletedAt: null,
    settled: false
  };
}

export function progressVoyage(voyage: Voyage, contract: AcceptedContract, currentGameTime: number): Voyage {
  let result = progressLoading(voyage, currentGameTime);
  result = progressSailing(result, currentGameTime);
  result = progressUnloading(result, contract, currentGameTime);
  return result;
}

function progressLoading(voyage: Voyage, currentGameTime: number): Voyage {
  if (voyage.phase !== "loading" || currentGameTime < voyage.loadingCompletedAt) return voyage;
  return { ...voyage, phase: "sailing", departedAt: voyage.loadingCompletedAt };
}

function progressSailing(voyage: Voyage, currentGameTime: number): Voyage {
  if (voyage.phase !== "sailing" || currentGameTime < voyage.estimatedArrivalAt) return voyage;
  return { ...voyage, phase: "unloading", arrivedAt: voyage.estimatedArrivalAt, unloadingStartedAt: voyage.estimatedArrivalAt };
}

function progressUnloading(voyage: Voyage, contract: AcceptedContract, currentGameTime: number): Voyage {
  if (voyage.phase !== "unloading") return voyage;
  const cargo = getCargoById(contract.cargoId);
  const unloadingCompletedAt = (voyage.unloadingStartedAt ?? 0) + cargo.unloadingTimeMsPerUnit * contract.quantity;
  if (currentGameTime < unloadingCompletedAt) return voyage;
  return { ...voyage, phase: "completed", unloadingCompletedAt, settled: false };
}

export function calculateVoyageProgress(voyage: Voyage, currentGameTime: number): number {
  if (voyage.phase === "loading") {
    const total = voyage.loadingCompletedAt - voyage.loadingStartedAt;
    return Math.min(1, Math.max(0, (currentGameTime - voyage.loadingStartedAt) / total));
  }
  if (voyage.phase === "sailing") {
    const total = voyage.estimatedArrivalAt - voyage.departedAt;
    return Math.min(1, Math.max(0, (currentGameTime - voyage.departedAt) / total));
  }
  if (voyage.phase === "unloading") {
    const cargo = getCargoById(getContractCargoId(voyage.contractId));
    const total = cargo.unloadingTimeMsPerUnit * getContractQuantity(voyage.contractId);
    return Math.min(1, Math.max(0, (currentGameTime - (voyage.unloadingStartedAt ?? 0)) / total));
  }
  return 1;
}

function getContractCargoId(contractId: string): string {
  return "cargo_wheat";
}

function getContractQuantity(contractId: string): number {
  return 10;
}

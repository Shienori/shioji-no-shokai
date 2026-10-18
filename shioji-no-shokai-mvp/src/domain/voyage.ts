import type { AcceptedContract, Route, Ship, Voyage } from "./types";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { getRouteHexIds } from "./routePath";
import { getHexById, HEX_DISTANCE_NM, seaConditionSpeedMultiplier } from "../data/hexMap";
import {
  SEA_CONDITION_SLOT_MS,
  calculateEstimatedArrivalAt,
  getSeaConditionAt,
  getSeaConditionForecastAt,
} from "./seaCondition";

const HOUR_MS = 60 * 60 * 1000;

function getRouteSeaHexIds(route: Route): string[] {
  const routeHexIds = getRouteHexIds(route.fromPortId, route.toPortId) ?? [];

  return routeHexIds.filter((hexId) => {
    return getHexById(hexId).kind === "sea";
  });
}

export function createVoyage(
  contract: AcceptedContract,
  ship: Ship,
  operationTime: number,
  currentRealTime: number,
): Voyage {
  const cargo = getCargoById(contract.cargoId);
  const route = getRouteById(contract.routeId);
  const loadingDurationMs = cargo.loadingTimeMsPerUnit * contract.quantity;
  const loadingCompletedAt = operationTime + loadingDurationMs;
  const departedRealTime = currentRealTime + loadingDurationMs / GAME_TIME_MULTIPLIER;
  const seaHexIds = getRouteSeaHexIds(route);
  const forecastEtaRealTime = calculateEstimatedArrivalAt(
    seaHexIds,
    departedRealTime,
    ship.cruisingSpeedKnots,
  );
  const arrivalDeadlineAt = operationTime + (contract.deadlineAt - contract.acceptedAt) * GAME_TIME_MULTIPLIER;

  return {
    id: `voyage_${contract.id}`,
    shipId: ship.id,
    contractId: contract.id,
    phase: "loading",
    loadingStartedAt: operationTime,
    loadingCompletedAt,
    departedAt: loadingCompletedAt,
    departedRealTime,
    lastProcessedRealTime: departedRealTime,
    currentSeaHexIndex: 0,
    distanceIntoHexNm: 0,
    shipSpeedKnots: ship.cruisingSpeedKnots,
    forecastEtaRealTime,
    estimatedArrivalAt: loadingCompletedAt + (forecastEtaRealTime - departedRealTime) * GAME_TIME_MULTIPLIER,
    arrivalDeadlineAt,
    arrivedAt: null,
    arrivalLateHours: 0,
    isOnTime: true,
    unloadingStartedAt: null,
    unloadingCompletedAt: null,
    completedAtWorldTime: null,
    settled: false
  };
}

export function progressVoyage(voyage: Voyage, contract: AcceptedContract, operationTime: number, currentRealTime: number): Voyage {
  let result = progressLoading(voyage, operationTime);
  result = progressSailing(result, contract, operationTime, currentRealTime);
  result = progressUnloading(result, contract, operationTime, currentRealTime);
  return result;
}

function progressLoading(voyage: Voyage, operationTime: number): Voyage {
  if (voyage.phase !== "loading" || operationTime < voyage.loadingCompletedAt) return voyage;
  return { ...voyage, phase: "sailing", departedAt: voyage.loadingCompletedAt };
}

function progressSailing(voyage: Voyage, contract: AcceptedContract, operationTime: number, currentRealTime: number): Voyage {
  if (voyage.phase !== "sailing" || operationTime < voyage.departedAt) return voyage;

  const route = getRouteById(contract.routeId);
  const seaHexIds = getRouteSeaHexIds(route);
  if (seaHexIds.length === 0) return voyage;

  let processedRealTime = Math.max(voyage.lastProcessedRealTime, voyage.departedRealTime);
  if (currentRealTime <= processedRealTime) return voyage;

  let seaHexIndex = Math.min(voyage.currentSeaHexIndex, seaHexIds.length - 1);
  let distanceIntoHexNm = voyage.distanceIntoHexNm;

  while (processedRealTime < currentRealTime && seaHexIndex < seaHexIds.length) {
    const hexId = seaHexIds[seaHexIndex];
    const condition = getSeaConditionAt(hexId, processedRealTime);
    const effectiveSpeedKnots = voyage.shipSpeedKnots * seaConditionSpeedMultiplier[condition];
    const realMsPerNm = 3600000 / (effectiveSpeedKnots * GAME_TIME_MULTIPLIER);
    const nextSlotRealTime = (Math.floor(processedRealTime / SEA_CONDITION_SLOT_MS) + 1) * SEA_CONDITION_SLOT_MS;
    const hexExitRealTime = processedRealTime + (HEX_DISTANCE_NM - distanceIntoHexNm) * realMsPerNm;
    const targetRealTime = Math.min(nextSlotRealTime, hexExitRealTime, currentRealTime);

    distanceIntoHexNm += (targetRealTime - processedRealTime) / realMsPerNm;
    processedRealTime = targetRealTime;

    if (distanceIntoHexNm >= HEX_DISTANCE_NM - 0.0001) {
      seaHexIndex += 1;
      distanceIntoHexNm = 0;
    }

    if (seaHexIndex >= seaHexIds.length) {
      const arrivedAt = operationTime + (targetRealTime - currentRealTime) * GAME_TIME_MULTIPLIER;
      const arrivalLateHours = calculateArrivalLateHours(arrivedAt, voyage.arrivalDeadlineAt);

      return {
        ...voyage,
        phase: "unloading",
        arrivedAt,
        estimatedArrivalAt: arrivedAt,
        arrivalLateHours,
        isOnTime: arrivalLateHours <= 0,
        unloadingStartedAt: arrivedAt,
        lastProcessedRealTime: targetRealTime,
        currentSeaHexIndex: seaHexIndex,
        distanceIntoHexNm
      };
    }
  }

  const currentHexId = seaHexIds[seaHexIndex];
  const currentCondition = getSeaConditionAt(currentHexId, processedRealTime);
  const currentEffectiveSpeedKnots = voyage.shipSpeedKnots * seaConditionSpeedMultiplier[currentCondition];
  let remainingGameHours = (HEX_DISTANCE_NM - distanceIntoHexNm) / currentEffectiveSpeedKnots;
  let forecastRealTime = processedRealTime;

  for (let index = seaHexIndex + 1; index < seaHexIds.length; index += 1) {
    const condition = getSeaConditionForecastAt(seaHexIds[index], forecastRealTime);
    const effectiveSpeedKnots = voyage.shipSpeedKnots * seaConditionSpeedMultiplier[condition];
    const transitHours = HEX_DISTANCE_NM / effectiveSpeedKnots;

    forecastRealTime += transitHours * 3600000 / GAME_TIME_MULTIPLIER;
    remainingGameHours += transitHours;
  }

  return {
    ...voyage,
    lastProcessedRealTime: currentRealTime,
    currentSeaHexIndex: seaHexIndex,
    distanceIntoHexNm,
    estimatedArrivalAt: operationTime + remainingGameHours * HOUR_MS
  };
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

export function calculateArrivalLateHours(arrivedAt: number, arrivalDeadlineAt: number): number {
  if (arrivedAt <= arrivalDeadlineAt) return 0;
  return (arrivedAt - arrivalDeadlineAt) / HOUR_MS;
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

import type { AcceptedContract, Ship, Voyage } from "./types";
import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import { getRouteById } from "../data/routes";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { getCargoForContract } from "./lotContract";
import { getHeavyLoadSpeedFactor } from "./voyage";
import { buildVoyagePlanRoute } from "./voyagePlanRoute";
import { predictVoyagePlan } from "./voyagePlanPrediction";
import { calculateFuelPrepaymentSummary } from "./fuelPrepayment";
import { createPlannedVoyageState } from "./plannedVoyageState";

export interface ConfirmedPlanVoyageInput {
  contract: AcceptedContract;
  ship: Ship;
  route: ConfirmedVoyageRoute;
  selectedSpeedKnots: number;
  operationTime: number;
}
/** Candidate only: acceptance checks, atomic saving and runtime activation belong to the caller. */
export function createConfirmedPlanVoyage(input: ConfirmedPlanVoyageInput): Voyage {
  const { contract, ship, route, selectedSpeedKnots, operationTime } = input;
  if (!contract.id || !Number.isSafeInteger(contract.acceptedAt) ||
      !Number.isFinite(contract.deadlineAt) || contract.deadlineAt <= contract.acceptedAt ||
      !Number.isFinite(operationTime) || operationTime < 0) throw new Error("Invalid contract or operation time");
  if (ship.status !== "docked" || ship.activeContractId !== null ||
      ship.currentPortId !== route.departurePortId || !ship.fuel || ship.fuel.remainingTons <= 0) throw new Error("Ship cannot start a planned voyage");
  const endpoints = getRouteById(contract.routeId);
  if (route.schemaVersion !== 1 || route.departurePortId !== endpoints.fromPortId ||
      route.destinationPortId !== endpoints.toPortId) throw new Error("Contract route endpoints mismatch");
  const rebuilt = buildVoyagePlanRoute({ departurePortId: endpoints.fromPortId, destinationPortId: endpoints.toPortId }, {
    stops: route.sections.slice(0, -1).map(section => ({ portId: section.toPortId, refuelTargetPercent: section.refuelTargetPercent! })),
    legs: route.sections.map(section => ({ waypointHexIds: [...section.waypointHexIds] })),
  });
  if (!rebuilt.ok || rebuilt.route.sections.length !== route.sections.length ||
      rebuilt.route.sections.some((section, index) => {
        const original = route.sections[index];
        return section.fromPortId !== original.fromPortId || section.toPortId !== original.toPortId ||
          section.refuelTargetPercent !== original.refuelTargetPercent || section.hexIds.length !== original.hexIds.length ||
          section.hexIds.some((id, position) => id !== original.hexIds[position]);
      })) throw new Error("Confirmed route differs from validated route");
  const cargo = getCargoForContract(contract);
  const loadingDurationOperationMs = cargo.loadingTimeMsPerUnit * contract.quantity;
  const prediction = predictVoyagePlan({ route: rebuilt.route, ship, selectedSpeedKnots,
    baseRealTime: contract.acceptedAt, loadingDurationOperationMs });
  const prepayment = calculateFuelPrepaymentSummary(rebuilt.route, ship, prediction);
  const loadingCompletedAt = operationTime + loadingDurationOperationMs;
  const estimatedArrivalAt = operationTime + (prediction.plannedEtaRealTime - contract.acceptedAt) * GAME_TIME_MULTIPLIER;
  const arrivalDeadlineAt = operationTime + (contract.deadlineAt - contract.acceptedAt) * GAME_TIME_MULTIPLIER;
  if (![loadingCompletedAt, estimatedArrivalAt, arrivalDeadlineAt].every(Number.isFinite)) throw new RangeError("Voyage time overflow");
  const voyage: Voyage = {
    id: `voyage_${contract.id}`, shipId: ship.id, contractId: contract.id, phase: "loading",
    loadingStartedAt: operationTime, loadingCompletedAt, departedAt: loadingCompletedAt,
    departedRealTime: prediction.departureRealTime, lastProcessedRealTime: prediction.departureRealTime,
    currentSeaHexIndex: 0, distanceIntoHexNm: 0, shipSpeedKnots: selectedSpeedKnots,
    forecastEtaRealTime: prediction.plannedEtaRealTime, estimatedArrivalAt, arrivalDeadlineAt,
    arrivedAt: null, arrivalLateHours: 0, isOnTime: true, unloadingStartedAt: null,
    unloadingCompletedAt: null, completedAtWorldTime: null, settled: false,
    fuelPrepaymentGold: prepayment.totalPrepaymentGold,
  };
  voyage.plannedNavigation = createPlannedVoyageState({ voyage, ship, route: rebuilt.route,
    selectedSpeedKnots, loadSpeedFactor: getHeavyLoadSpeedFactor(contract, ship) });
  return voyage;
}

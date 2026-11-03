import type { ContractTemplate, Ship } from "./types";
import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import type { VoyagePlanPrediction } from "./voyagePlanPrediction";
import { predictVoyagePlan } from "./voyagePlanPrediction";
import { getCargoForContract } from "./lotContract";
import { getRouteById } from "../data/routes";
import { ceilTo1Minute } from "./time";

export interface ConfirmedPlanReview {
  offerId: string;
  templateId: string;
  shipId: string;
  selectedSpeedKnots: number;
  baseRealTime: number;
  deadlineAt: number;
  route: ConfirmedVoyageRoute;
  prediction: VoyagePlanPrediction;
  signature: string;
}
export type PlanAcceptanceResult = { kind: "accepted" } | { kind: "reviewRequired"; review: ConfirmedPlanReview };
/** Snapshot for confirmation, not an authorization token. Store always rechecks live conditions.
 * Time changes are compared at the displayed one-minute ceiling, never by a stale raw ETA.
 */
export function createConfirmedPlanReview(
  offerId: string, contract: ContractTemplate, ship: Ship, route: ConfirmedVoyageRoute,
  selectedSpeedKnots: number, baseRealTime: number, deadlineAt: number,
): ConfirmedPlanReview {
  const endpoints = getRouteById(contract.routeId);
  if (!offerId || route.departurePortId !== endpoints.fromPortId || route.destinationPortId !== endpoints.toPortId ||
      !Number.isFinite(deadlineAt) || deadlineAt <= baseRealTime) throw new Error("Invalid plan review references");
  const ownedRoute: ConfirmedVoyageRoute = { schemaVersion: route.schemaVersion,
    departurePortId: route.departurePortId, destinationPortId: route.destinationPortId,
    sections: route.sections.map(section => ({ fromPortId: section.fromPortId, toPortId: section.toPortId,
      hexIds: [...section.hexIds], waypointHexIds: [...section.waypointHexIds],
      ...(section.refuelTargetPercent === undefined ? {} : { refuelTargetPercent: section.refuelTargetPercent }) })) };
  const cargo = getCargoForContract(contract);
  const prediction = predictVoyagePlan({ route: ownedRoute, ship, selectedSpeedKnots, baseRealTime,
    loadingDurationOperationMs: cargo.loadingTimeMsPerUnit * contract.quantity });
  const signature = JSON.stringify({ offerId, contract, ship, route: ownedRoute, cargo, selectedSpeedKnots,
    deadlineDisplay: ceilTo1Minute(deadlineAt), departureDisplay: ceilTo1Minute(prediction.departureRealTime),
    etaDisplay: ceilTo1Minute(prediction.plannedEtaRealTime),
    totalRequiredFuelTons: prediction.totalRequiredFuelTons, finalFuelTons: prediction.finalFuelTons,
    assessments: prediction.sections.map(section => section.fuelAssessment) });
  return { offerId, templateId: contract.id, shipId: ship.id, selectedSpeedKnots, baseRealTime, deadlineAt,
    route: ownedRoute, prediction, signature };
}

import type { AcceptedContract, Ship, Voyage } from "./types";
import { advanceConfirmedPlanNavigation } from "./confirmedPlanNavigation";
import { advancePlannedVoyage } from "./plannedVoyage";
import { buildRouteWindLegs } from "./routeWind";
import { getRouteById } from "../data/routes";
import { getPortHexId } from "../data/hexMap";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";

/** Read-only presentation from the saved path and checkpoint. No route search, weather ETA or save. */
export function getPlannedShipPresentation(ship: Ship, voyage: Voyage, contract: AcceptedContract) {
  const plan = voyage.plannedNavigation;
  if (!plan || contract.id !== voyage.contractId) throw new Error("Missing or invalid confirmed plan");
  if (!["loading", "sailing", "unloading", "completed"].includes(voyage.phase)) throw new Error("Invalid planned phase");
  advanceConfirmedPlanNavigation({ ...voyage, phase: "loading" }, ship, plan.checkpoint.processedRealTime);
  const endpoints = getRouteById(contract.routeId);
  if (plan.route.departurePortId !== endpoints.fromPortId || plan.route.destinationPortId !== endpoints.toPortId) throw new Error("Contract endpoints mismatch");
  const checkpoint = plan.checkpoint;
  const checked = advancePlannedVoyage({ route: plan.route, settings: plan.settings, checkpoint, fuel: ship.fuel!,
    untilRealTime: checkpoint.processedRealTime, readActualWind: () => { throw new Error("Presentation must not advance navigation"); } });
  if (JSON.stringify(checked.checkpoint) !== JSON.stringify(checkpoint) || checked.fuel.remainingTons !== ship.fuel!.remainingTons) throw new Error("Invalid transitional checkpoint");
  const allLegs = plan.route.sections.map(section => buildRouteWindLegs(section.hexIds));
  const distances = allLegs.map(legs => legs.reduce((sum, leg) => sum + leg.distanceNm, 0));
  const totalDistanceNm = distances.reduce((sum, distance) => sum + distance, 0);
  const arrived = voyage.phase === "unloading" || voyage.phase === "completed";
  if (arrived !== (checked.status === "arrived")) throw new Error("Arrival phase mismatch");
  if (voyage.phase === "loading" && (checkpoint.currentSectionIndex !== 0 || checkpoint.legIndex !== 0 ||
      checkpoint.distanceIntoLegNm !== 0 || checkpoint.totalFuelUsedTons !== 0 || checkpoint.portCalls.length !== 0)) throw new Error("Loading progress mismatch");
  const currentLegs = allLegs[checkpoint.currentSectionIndex];
  const traveledDistanceNm = voyage.phase === "loading" ? 0 : arrived ? totalDistanceNm :
    distances.slice(0, checkpoint.currentSectionIndex).reduce((sum, distance) => sum + distance, 0) +
    currentLegs.slice(0, checkpoint.legIndex).reduce((sum, leg) => sum + leg.distanceNm, 0) + checkpoint.distanceIntoLegNm;
  if (!Number.isFinite(traveledDistanceNm) || traveledDistanceNm < 0 || traveledDistanceNm > totalDistanceNm) throw new Error("Invalid traveled distance");
  const expectedHexId = voyage.phase === "loading" ? getPortHexId(plan.route.departurePortId) : arrived
    ? getPortHexId(plan.route.destinationPortId) : currentLegs[checkpoint.legIndex].hexId;
  if (ship.currentHexId !== expectedHexId) throw new Error("Ship position mismatch");
  if (!Number.isFinite(voyage.forecastEtaRealTime) || Math.abs(voyage.forecastEtaRealTime) > 8.64e15) throw new Error("Invalid fixed ETA");
  const actualArrivalRealTime = arrived && voyage.arrivedAt !== null
    ? voyage.departedRealTime + (voyage.arrivedAt - voyage.departedAt) / GAME_TIME_MULTIPLIER : null;
  if (arrived && (actualArrivalRealTime === null || !Number.isFinite(actualArrivalRealTime) ||
      Math.abs(actualArrivalRealTime - checkpoint.processedRealTime) > 1e-3)) throw new Error("Actual arrival mismatch");
  return {
    totalDistanceNm, traveledDistanceNm, progress: traveledDistanceNm / totalDistanceNm,
    routeHexIds: plan.route.sections.flatMap((section, index) => index === 0 ? [...section.hexIds] : section.hexIds.slice(1)),
    currentHexId: expectedHexId, currentSectionIndex: checkpoint.currentSectionIndex,
    currentSection: plan.route.sections[checkpoint.currentSectionIndex],
    nextPortId: arrived ? null : plan.route.sections[checkpoint.currentSectionIndex].toPortId,
    plannedEtaRealTime: voyage.forecastEtaRealTime, actualArrivalRealTime,
    selectedSpeedKnots: plan.settings.selectedSpeedKnots, processedRealTime: checkpoint.processedRealTime,
    fuelRemainingTons: ship.fuel!.remainingTons, fuelConsumedTons: checkpoint.totalFuelUsedTons,
    portCalls: checkpoint.portCalls.map(record => ({ ...record })),
    sections: plan.route.sections.map((section, index) => ({ ...section, distanceNm: distances[index] })),
  };
}

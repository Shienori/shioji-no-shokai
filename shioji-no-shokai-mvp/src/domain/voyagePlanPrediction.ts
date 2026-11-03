import type { Ship } from "./types";
import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import type { VoyagePlanForecast } from "./voyagePlanForecast";
import { voyagePlanSectionKey } from "./voyagePlanForecast";
import { isValidContractWindForecast } from "./contractWindForecast";
import { isValidShipFuel } from "./coalFuel";
import { buildRouteWindLegs } from "./routeWind";
import { getHexById } from "../data/hexMap";
import { estimateSavedWindArrival } from "./windNavigation";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";

export interface VoyagePlanPredictionInput {
  route: ConfirmedVoyageRoute;
  forecast: VoyagePlanForecast | null;
  ship: Ship;
  selectedSpeedKnots: number;
  loadSpeedFactor: number;
  baseRealTime: number;
  // Operation-time milliseconds; caller derives this from cargo exactly once.
  loadingDurationOperationMs: number;
}
export interface SectionPrediction {
  sectionIndex: number;
  departureRealTime: number;
  arrivalRealTime: number;
  fuelUsedTons: number;
  arrivalFuelTons: number;
  refuelAddedTons: number;
  departureAfterRefuelTons: number;
}
export type VoyagePlanPrediction = {
  status: "arrived" | "missingForecast" | "invalidForecast" | "outsideForecast" | "forecastHorizon" | "insufficientFuel" | "windUnavailable";
  departureRealTime: number;
  etaRealTime: number | null;
  totalFuelUsedTons: number;
  totalRefuelAddedTons: number;
  finalFuelTons: number | null;
  completedSections: SectionPrediction[];
  stoppedSectionIndex: number | null;
};
function validTime(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 8.64e15;
}
/** Sailing ETA excludes unloading. Pure preview; no actual fuel or storage writes. */
export function predictVoyagePlan(input: VoyagePlanPredictionInput): VoyagePlanPrediction {
  const { route, ship, selectedSpeedKnots: speed, loadSpeedFactor: load, forecast } = input;
  if (ship.kind !== "powered" || !isValidShipFuel(ship.fuel)) throw new RangeError("Valid powered ship fuel required");
  if (!Number.isSafeInteger(speed) || !Number.isSafeInteger(ship.cruisingSpeedKnots) ||
      !Number.isSafeInteger(ship.maxSpeedKnots) || ship.cruisingSpeedKnots <= 0 ||
      speed < ship.cruisingSpeedKnots || speed > ship.maxSpeedKnots) throw new RangeError("Speed outside ship limits");
  if (!Number.isFinite(load) || load <= 0 || load > 1) throw new RangeError("Invalid load factor");
  if (!Number.isSafeInteger(input.baseRealTime) || !validTime(input.baseRealTime) ||
      !Number.isFinite(input.loadingDurationOperationMs) || input.loadingDurationOperationMs < 0) throw new RangeError("Invalid plan time");
  if (route.schemaVersion !== 1 || route.sections.length === 0 || !route.departurePortId ||
      route.departurePortId === route.destinationPortId) throw new Error("Invalid route");
  const seenStops = new Set<string>();
  const legsBySection = route.sections.map((section, index) => {
    const final = index === route.sections.length - 1;
    if (section.fromPortId !== (index === 0 ? route.departurePortId : route.sections[index - 1].toPortId) ||
        (final && section.toPortId !== route.destinationPortId)) throw new Error("Disconnected route");
    const first = getHexById(section.hexIds[0]);
    const last = getHexById(section.hexIds[section.hexIds.length - 1]);
    if (first.portId !== section.fromPortId || last.portId !== section.toPortId) throw new Error("Endpoint mismatch");
    if (final) {
      if (section.refuelTargetPercent !== undefined) throw new Error("Final destination cannot refuel in this plan");
    } else {
      if (section.toPortId === route.departurePortId || section.toPortId === route.destinationPortId || seenStops.has(section.toPortId)) throw new Error("Invalid intermediate stop");
      seenStops.add(section.toPortId);
      const target = section.refuelTargetPercent;
      if (target === undefined || !Number.isInteger(target) || target < 0 || target > 100) throw new RangeError("Invalid refuel target");
    }
    return buildRouteWindLegs(section.hexIds);
  });
  const departureRealTime = input.baseRealTime + input.loadingDurationOperationMs / GAME_TIME_MULTIPLIER;
  if (!validTime(departureRealTime)) throw new RangeError("Departure overflow");
  let currentTime = departureRealTime;
  let remaining = ship.fuel.remainingTons;
  let used = 0;
  let added = 0;
  const completedSections: SectionPrediction[] = [];
  const finish = (status: VoyagePlanPrediction["status"], index: number | null): VoyagePlanPrediction => ({
    status, departureRealTime, etaRealTime: status === "arrived" ? currentTime : null,
    totalFuelUsedTons: used, totalRefuelAddedTons: added,
    finalFuelTons: status === "arrived" ? remaining : null,
    completedSections, stoppedSectionIndex: index,
  });
  if (!forecast) return finish("missingForecast", 0);
  if (!Number.isSafeInteger(forecast.capturedAt) || forecast.capturedAt > input.baseRealTime ||
      forecast.sections.length !== route.sections.length) return finish("invalidForecast", 0);
  // Validate the entire edition before calculating any section.
  for (let i = 0; i < route.sections.length; i++) {
    const snapshot = forecast.sections[i];
    const legs = legsBySection[i];
    if (!isValidContractWindForecast(snapshot, voyagePlanSectionKey(route, i), forecast.capturedAt) ||
        snapshot.seaHexIds.length !== legs.length || snapshot.seaHexIds.some((id, n) => id !== legs[n].hexId) ||
        snapshot.issuedAt !== forecast.sections[0].issuedAt) return finish("invalidForecast", i);
  }
  for (let i = 0; i < route.sections.length; i++) {
    const snapshot = forecast.sections[i];
    if (currentTime < snapshot.validFrom || currentTime > snapshot.validTo) return finish("outsideForecast", i);
    const result = estimateSavedWindArrival({
      legs: legsBySection[i],
      state: { processedRealTime: currentTime, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: remaining, totalFuelUsed: used },
      selectedSpeedKnots: speed, loadSpeedFactor: load,
      referenceFuelPerVoyageHour: ship.fuel.referenceConsumptionTonsPerVoyageHour,
      referenceSpeedKnots: ship.fuel.referenceSpeedKnots,
    }, snapshot);
    used = result.state.totalFuelUsed;
    remaining = result.state.fuelRemaining;
    if (result.status !== "arrived") return finish(
      result.status === "fuelDepleted" ? "insufficientFuel" : result.status === "timeReached" ? "forecastHorizon" : "windUnavailable", i,
    );
    const arrivalFuelTons = remaining;
    const target = route.sections[i].refuelTargetPercent;
    const refuelAddedTons = target === undefined ? 0 : Math.max(0, ship.fuel.capacityTons * (target / 100) - remaining);
    remaining += refuelAddedTons;
    added += refuelAddedTons;
    const previousUsed = completedSections.reduce((n, section) => n + section.fuelUsedTons, 0);
    completedSections.push({ sectionIndex: i, departureRealTime: currentTime,
      arrivalRealTime: result.arrivalRealTime!, fuelUsedTons: used - previousUsed,
      arrivalFuelTons, refuelAddedTons, departureAfterRefuelTons: remaining });
    currentTime = result.arrivalRealTime!;
  }
  return finish("arrived", null);
}

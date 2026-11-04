import type { ShipFuelState } from "./types";
import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import { buildRouteWindLegs } from "./routeWind";
import { getHexById } from "../data/hexMap";
import { isValidShipFuel } from "./coalFuel";
import { advanceWindNavigation } from "./windNavigation";
import type { WindNavigationInput } from "./windNavigation";
import { calculateFuelRate } from "./shipPerformance";
import { calculateVoyagePortRefuel } from "./voyagePortCall";
import type { VoyagePortCallRecord } from "./voyagePortCall";

export interface PlannedVoyageSettings {
  selectedSpeedKnots: number;
  loadSpeedFactor: number;
  fuelCapacityTons: number;
  referenceSpeedKnots: number;
  referenceConsumptionTonsPerVoyageHour: number;
}
/** Checkpoint excludes fuel balance: ship.fuel remains the balance source. */
export interface PlannedVoyageCheckpoint {
  schemaVersion: 1;
  currentSectionIndex: number;
  processedRealTime: number;
  legIndex: number;
  distanceIntoLegNm: number;
  totalFuelUsedTons: number;
  portCalls: VoyagePortCallRecord[];
}
export interface PlannedVoyageAdvanceInput {
  route: ConfirmedVoyageRoute;
  settings: PlannedVoyageSettings;
  checkpoint: PlannedVoyageCheckpoint;
  fuel: ShipFuelState;
  untilRealTime: number;
  // Required actual-wind reader; no saved forecast or clock lookup here.
  readActualWind: WindNavigationInput["readWind"];
}
export interface PlannedVoyageAdvanceResult {
  status: "sailing" | "arrived" | "fuelDepleted" | "windUnavailable";
  checkpoint: PlannedVoyageCheckpoint;
  fuel: ShipFuelState;
  arrivalRealTime: number | null;
}
function requireTime(value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > 8.64e15) throw new RangeError("Invalid time");
}
function routeLegs(route: ConfirmedVoyageRoute) {
  if (route.schemaVersion !== 1 || route.sections.length === 0 || !route.departurePortId ||
      !route.destinationPortId || route.departurePortId === route.destinationPortId) throw new Error("Invalid route");
  const stops = new Set<string>();
  return route.sections.map((section, index) => {
    const final = index === route.sections.length - 1;
    if (section.fromPortId !== (index === 0 ? route.departurePortId : route.sections[index - 1].toPortId) ||
        (final && section.toPortId !== route.destinationPortId)) throw new Error("Disconnected route");
    const legs = buildRouteWindLegs(section.hexIds);
    if (getHexById(section.hexIds[0]).portId !== section.fromPortId ||
        getHexById(section.hexIds[section.hexIds.length - 1]).portId !== section.toPortId) throw new Error("Endpoint mismatch");
    if (final) {
      if (section.refuelTargetPercent !== undefined) throw new Error("Final refuel not allowed");
    } else {
      if (section.toPortId === route.departurePortId || section.toPortId === route.destinationPortId || stops.has(section.toPortId)) throw new Error("Invalid intermediate stop");
      stops.add(section.toPortId);
      const target = section.refuelTargetPercent;
      if (target === undefined || !Number.isInteger(target) || target < 0 || target > 100) throw new RangeError("Invalid target");
    }
    return legs;
  });
}
/** Call only after loading. Caller validates ship/contract IDs and engine limits. */
export function createPlannedVoyageCheckpoint(route: ConfirmedVoyageRoute, departureRealTime: number): PlannedVoyageCheckpoint {
  routeLegs(route);
  requireTime(departureRealTime);
  return { schemaVersion: 1, currentSectionIndex: 0, processedRealTime: departureRealTime,
    legIndex: 0, distanceIntoLegNm: 0, totalFuelUsedTons: 0, portCalls: [] };
}
/** Pure advance. Returns fuel and checkpoint together; never saves or settles. */
export function advancePlannedVoyage(input: PlannedVoyageAdvanceInput): PlannedVoyageAdvanceResult {
  const { route, settings } = input;
  const allLegs = routeLegs(route);
  const original = input.checkpoint;
  requireTime(original.processedRealTime);
  requireTime(input.untilRealTime);
  if (input.untilRealTime < original.processedRealTime) throw new RangeError("Cannot rewind");
  if (original.schemaVersion !== 1 || !Number.isSafeInteger(original.currentSectionIndex) ||
      original.currentSectionIndex < 0 || original.currentSectionIndex >= allLegs.length) throw new Error("Invalid section index");
  if (!isValidShipFuel(input.fuel) || input.fuel.capacityTons !== settings.fuelCapacityTons ||
      input.fuel.referenceSpeedKnots !== settings.referenceSpeedKnots ||
      input.fuel.referenceConsumptionTonsPerVoyageHour !== settings.referenceConsumptionTonsPerVoyageHour) throw new Error("Fuel settings mismatch");
  if (!Number.isFinite(settings.loadSpeedFactor) || settings.loadSpeedFactor <= 0 || settings.loadSpeedFactor > 1) throw new RangeError("Invalid load factor");
  calculateFuelRate(settings.selectedSpeedKnots, settings.referenceConsumptionTonsPerVoyageHour, settings.referenceSpeedKnots);
  if (!Number.isFinite(original.totalFuelUsedTons) || original.totalFuelUsedTons < 0) throw new RangeError("Invalid consumed fuel");
  if (original.portCalls.length !== original.currentSectionIndex) throw new Error("Checkpoint history mismatch");
  let previousTime = -Infinity;
  for (const [index, record] of original.portCalls.entries()) {
    const section = route.sections[index];
    requireTime(record.arrivedAtRealTime);
    if (record.sectionIndex !== index || record.portId !== section.toPortId ||
        record.targetPercent !== section.refuelTargetPercent || record.arrivedAtRealTime < previousTime ||
        record.arrivedAtRealTime > original.processedRealTime) throw new Error("Invalid port call history");
    const checked = calculateVoyagePortRefuel({ ...input.fuel, remainingTons: record.arrivalFuelTons }, record.targetPercent);
    if (checked.addedFuelTons !== record.addedFuelTons || checked.departureFuelTons !== record.departureFuelTons) throw new Error("Invalid historical fuel");
    previousTime = record.arrivedAtRealTime;
  }
  let checkpoint: PlannedVoyageCheckpoint = { ...original, portCalls: original.portCalls.map(row => ({ ...row })) };
  let fuel = { ...input.fuel };
  const finish = (status: PlannedVoyageAdvanceResult["status"], arrivalRealTime: number | null = null): PlannedVoyageAdvanceResult => ({ status, checkpoint, fuel, arrivalRealTime });
  for (let transitions = 0; transitions <= allLegs.length; transitions++) {
    const index = checkpoint.currentSectionIndex;
    const navigation = advanceWindNavigation({
      legs: allLegs[index],
      state: { processedRealTime: checkpoint.processedRealTime, legIndex: checkpoint.legIndex,
        distanceIntoLegNm: checkpoint.distanceIntoLegNm, fuelRemaining: fuel.remainingTons,
        totalFuelUsed: checkpoint.totalFuelUsedTons },
      selectedSpeedKnots: settings.selectedSpeedKnots,
      loadSpeedFactor: settings.loadSpeedFactor,
      referenceFuelPerVoyageHour: settings.referenceConsumptionTonsPerVoyageHour,
      referenceSpeedKnots: settings.referenceSpeedKnots,
      untilRealTime: input.untilRealTime, readWind: input.readActualWind,
    });
    checkpoint = { ...checkpoint, processedRealTime: navigation.state.processedRealTime,
      legIndex: navigation.state.legIndex, distanceIntoLegNm: navigation.state.distanceIntoLegNm,
      totalFuelUsedTons: navigation.state.totalFuelUsed };
    fuel = { ...fuel, remainingTons: navigation.state.fuelRemaining };
    if (navigation.status === "arrived") {
      if (index === allLegs.length - 1) return finish("arrived", navigation.arrivalRealTime);
      const section = route.sections[index];
      const refuel = calculateVoyagePortRefuel(fuel, section.refuelTargetPercent!);
      const record: VoyagePortCallRecord = { sectionIndex: index, portId: section.toPortId,
        arrivedAtRealTime: navigation.arrivalRealTime!, arrivalFuelTons: fuel.remainingTons,
        targetPercent: section.refuelTargetPercent!, ...refuel };
      fuel = { ...fuel, remainingTons: refuel.departureFuelTons };
      checkpoint = { ...checkpoint, currentSectionIndex: index + 1, legIndex: 0,
        distanceIntoLegNm: 0, portCalls: [...checkpoint.portCalls, record] };
      // No elapsed time or invented refill is needed to identify zero-fuel departure.
      if (fuel.remainingTons === 0) return finish("fuelDepleted");
      continue;
    }
    if (fuel.remainingTons === 0) return finish("fuelDepleted");
    if (navigation.status === "windUnavailable") return finish("windUnavailable");
    return finish("sailing");
  }
  throw new Error("Section transition limit exceeded");
}

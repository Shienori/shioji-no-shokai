import type { Ship } from "./types";
import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import { isValidShipFuel } from "./coalFuel";
import { buildRouteWindLegs } from "./routeWind";
import { getHexById } from "../data/hexMap";
import { calculateFuelRate } from "./shipPerformance";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";

const HOUR_MS = 3_600_000;
// Comparison only; no display rounding. Boundary test offsets are 1e-8 tons.
export const PLAN_FUEL_RELATIVE_TOLERANCE = Number.EPSILON * 32;
export const PLAN_VALUE_NOTICE = "風・積載による減速は含まない計画値です。実際の消費量は変わります";
export type PlanFuelAssessment = "insufficient" | "lowReserve" | "sufficient";
export const PLAN_FUEL_MESSAGES: Record<PlanFuelAssessment, string> = {
  insufficient: "目的地までの燃料が足りません",
  lowReserve: "予備燃料が少なくなっています。風や積載による減速で不足する可能性があります",
  sufficient: "計画必要量と20%以上の予備燃料があります",
};
export interface VoyagePlanPredictionInput {
  route: ConfirmedVoyageRoute;
  ship: Ship;
  selectedSpeedKnots: number;
  baseRealTime: number;
  loadingDurationOperationMs: number;
}
export interface SectionPrediction {
  sectionIndex: number;
  distanceNm: number;
  voyageHours: number;
  plannedDepartureRealTime: number;
  plannedArrivalRealTime: number;
  requiredFuelTons: number;
  startingFuelTons: number | null;
  fuelAssessment: PlanFuelAssessment | "unreachable";
  arrivalFuelTons: number | null;
  refuelAddedTons: number | null;
  departureAfterRefuelTons: number | null;
}
export interface VoyagePlanPrediction {
  modelVersion: "simple-voyage-plan-v1";
  notice: string;
  departureRealTime: number;
  // Conditional schedule, not a weather ETA or proof of fuel sufficiency.
  plannedEtaRealTime: number;
  totalDistanceNm: number;
  totalVoyageHours: number;
  totalRequiredFuelTons: number;
  finalFuelTons: number | null;
  hasFuelShortage: boolean;
  sections: SectionPrediction[];
}
function nonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Invalid ${name}`);
}
function validTime(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 8.64e15;
}
function atLeast(value: number, boundary: number): boolean {
  return value >= boundary || boundary - value <= PLAN_FUEL_RELATIVE_TOLERANCE * Math.max(Math.abs(value), Math.abs(boundary));
}
export function assessPlanFuel(availableTons: number, requiredTons: number): PlanFuelAssessment {
  nonNegative(availableTons, "available fuel");
  nonNegative(requiredTons, "required fuel");
  if (requiredTons === 0 || !Number.isFinite(requiredTons * 1.2)) throw new RangeError("Invalid required fuel");
  if (!atLeast(availableTons, requiredTons)) return "insufficient";
  return atLeast(availableTons, requiredTons * 1.2) ? "sufficient" : "lowReserve";
}
/** Issue #51 simple plan only. No forecast, load factor, clock, save or real fuel changes. */
export function predictVoyagePlan(input: VoyagePlanPredictionInput): VoyagePlanPrediction {
  const { route, ship, selectedSpeedKnots: speed } = input;
  if (ship.kind !== "powered" || !isValidShipFuel(ship.fuel)) throw new RangeError("Valid powered ship fuel required");
  if (!Number.isSafeInteger(ship.cruisingSpeedKnots) || ship.cruisingSpeedKnots <= 0 ||
      !Number.isSafeInteger(ship.maxSpeedKnots) || !Number.isSafeInteger(speed) ||
      speed < ship.cruisingSpeedKnots || speed > ship.maxSpeedKnots) throw new RangeError("Speed outside ship limits");
  if (!Number.isSafeInteger(input.baseRealTime) || !validTime(input.baseRealTime)) throw new RangeError("Invalid base time");
  nonNegative(input.loadingDurationOperationMs, "loading duration");
  if (!Number.isFinite(GAME_TIME_MULTIPLIER) || GAME_TIME_MULTIPLIER <= 0) throw new RangeError("Invalid time multiplier");
  if (route.schemaVersion !== 1 || route.sections.length === 0 || !route.departurePortId ||
      !route.destinationPortId || route.departurePortId === route.destinationPortId) throw new Error("Invalid route");
  const seenStops = new Set<string>();
  let waypointCount = 0;
  const distances = route.sections.map((section, index) => {
    const final = index === route.sections.length - 1;
    if (section.fromPortId === section.toPortId ||
        section.fromPortId !== (index === 0 ? route.departurePortId : route.sections[index - 1].toPortId) ||
        (final && section.toPortId !== route.destinationPortId)) throw new Error("Disconnected route");
    const legs = buildRouteWindLegs(section.hexIds);
    if (getHexById(section.hexIds[0]).portId !== section.fromPortId ||
        getHexById(section.hexIds[section.hexIds.length - 1]).portId !== section.toPortId) throw new Error("Endpoint mismatch");
    waypointCount += section.waypointHexIds.length;
    if (waypointCount > 8 || new Set(section.waypointHexIds).size !== section.waypointHexIds.length) throw new Error("Invalid waypoint count");
    let previous = -1;
    for (const id of section.waypointHexIds) {
      const position = section.hexIds.indexOf(id);
      if (position <= previous || position <= 0 || position >= section.hexIds.length - 1 || getHexById(id).kind !== "sea") throw new Error("Invalid waypoint order");
      previous = position;
    }
    if (final) {
      if (section.refuelTargetPercent !== undefined) throw new Error("Final destination cannot refuel in this plan");
    } else {
      if (section.toPortId === route.departurePortId || section.toPortId === route.destinationPortId || seenStops.has(section.toPortId)) throw new Error("Invalid intermediate stop");
      seenStops.add(section.toPortId);
      const target = section.refuelTargetPercent;
      if (target === undefined || !Number.isInteger(target) || target < 0 || target > 100) throw new RangeError("Invalid refuel target");
    }
    return legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
  });
  const fuelRate = calculateFuelRate(speed, ship.fuel.referenceConsumptionTonsPerVoyageHour, ship.fuel.referenceSpeedKnots);
  const departureRealTime = input.baseRealTime + input.loadingDurationOperationMs / GAME_TIME_MULTIPLIER;
  if (!validTime(departureRealTime)) throw new RangeError("Departure overflow");
  let remaining: number | null = ship.fuel.remainingTons;
  let totalDistanceNm = 0;
  let totalRequiredFuelTons = 0;
  let hasFuelShortage = false;
  const sections: SectionPrediction[] = [];
  for (const [index, distanceNm] of distances.entries()) {
    const voyageHours = distanceNm / speed;
    const requiredFuelTons = fuelRate * voyageHours;
    if (!Number.isFinite(requiredFuelTons) || requiredFuelTons <= 0) throw new RangeError("Invalid section fuel");
    const plannedDepartureRealTime = departureRealTime + totalDistanceNm / speed * HOUR_MS / GAME_TIME_MULTIPLIER;
    totalDistanceNm += distanceNm;
    totalRequiredFuelTons += requiredFuelTons;
    const plannedArrivalRealTime = departureRealTime + totalDistanceNm / speed * HOUR_MS / GAME_TIME_MULTIPLIER;
    if (!validTime(plannedArrivalRealTime) || !Number.isFinite(totalRequiredFuelTons)) throw new RangeError("Plan overflow");
    const startingFuelTons: number | null = remaining;
    const fuelAssessment: SectionPrediction["fuelAssessment"] = remaining === null ? "unreachable" : assessPlanFuel(remaining, requiredFuelTons);
    if (fuelAssessment === "insufficient") hasFuelShortage = true;
    const arrivalFuelTons: number | null = remaining === null || fuelAssessment === "insufficient" ? null : Math.max(0, remaining - requiredFuelTons);
    const target = route.sections[index].refuelTargetPercent;
    const after: number | null = arrivalFuelTons === null ? null : target === undefined ? arrivalFuelTons : Math.max(arrivalFuelTons, ship.fuel.capacityTons * (target / 100));
    sections.push({ sectionIndex: index, distanceNm, voyageHours, plannedDepartureRealTime, plannedArrivalRealTime,
      requiredFuelTons, startingFuelTons, fuelAssessment, arrivalFuelTons,
      refuelAddedTons: arrivalFuelTons === null || after === null ? null : after - arrivalFuelTons,
      departureAfterRefuelTons: after });
    remaining = after;
  }
  return { modelVersion: "simple-voyage-plan-v1", notice: PLAN_VALUE_NOTICE, departureRealTime,
    plannedEtaRealTime: sections[sections.length - 1].plannedArrivalRealTime,
    totalDistanceNm, totalVoyageHours: totalDistanceNm / speed, totalRequiredFuelTons,
    finalFuelTons: remaining, hasFuelShortage, sections };
}

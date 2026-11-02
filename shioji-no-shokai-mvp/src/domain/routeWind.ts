import type { Axial, Wind } from "./coastalWind";
import { axialToWorld } from "./coastalWind";
import { HEX_DISTANCE_NM } from "./hexMap";
import { getHexById } from "../data/hexMap";
import { getRouteHexIds } from "./routePath";
import type { Route } from "./types";
import { calculateEffectiveSpeedKnots, calculateFuelRate } from "./shipPerformance";

export interface RouteWindLeg {
  hexId: string;
  nextHexId: string;
  routeHexIndex: number;
  seaHexIndex: number;
  distanceNm: number;
  headingDeg: number;
}

/** Adjacent HEX heading: clockwise from north, matching the rendered map. */
export function getHexHeadingDeg(from: Axial, to: Axial): number {
  if (![from.q, from.r, to.q, to.r].every(Number.isSafeInteger)) {
    throw new RangeError("HEX coordinates must be safe integers");
  }
  const dq = to.q - from.q;
  const dr = to.r - from.r;
  if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 !== 1) {
    throw new RangeError("Heading requires distinct adjacent HEXes");
  }
  const delta = axialToWorld({ q: dq, r: dr });
  return (Math.atan2(delta.east, delta.north) * 180 / Math.PI + 360) % 360;
}

/**
 * Converts an existing port-to-port path without searching or changing distance.
 * One 15nm leg per sea HEX; port HEXes add no distance and receive no weather.
 * A sea HEX uses the outgoing direction toward the next path HEX, including
 * the destination port. At bends this is an explicit representative heading,
 * not a continuous turn inside the HEX.
 */
export function buildRouteWindLegs(routeHexIds: readonly string[]): RouteWindLeg[] {
  if (routeHexIds.length < 3 || new Set(routeHexIds).size !== routeHexIds.length) {
    throw new Error("Expected a non-repeating port-to-port path with sea HEXes");
  }
  const cells = routeHexIds.map(getHexById);
  if (cells[0].kind !== "port" || cells[cells.length - 1].kind !== "port") {
    throw new Error("Route endpoints must be ports");
  }
  for (let index = 0; index < cells.length - 1; index += 1) {
    getHexHeadingDeg(cells[index], cells[index + 1]);
  }
  return cells.slice(1, -1).map((hex, seaHexIndex) => {
    if (hex.kind !== "sea") throw new Error("Route interior must contain sea HEXes only");
    const routeHexIndex = seaHexIndex + 1;
    const next = cells[routeHexIndex + 1];
    return {
      hexId: hex.id,
      nextHexId: next.id,
      routeHexIndex,
      seaHexIndex,
      distanceNm: HEX_DISTANCE_NM,
      headingDeg: getHexHeadingDeg(hex, next),
    };
  });
}

/** Uses the existing route finder; unreachable paths are never replaced. */
export function getRouteWindLegs(route: Pick<Route, "fromPortId" | "toPortId">): RouteWindLeg[] {
  const path = getRouteHexIds(route.fromPortId, route.toPortId);
  if (!path) throw new Error("Cannot build wind legs: no route");
  return buildRouteWindLegs(path);
}

/**
 * Caller supplies forecast OR actual wind explicitly; this module fetches neither.
 * Returns instantaneous rates, not whole-HEX time, ETA or total passage fuel.
 * Selected speed must not already include load/wind corrections.
 * No legacy sea-condition multiplier or real-time acceleration is applied here.
 */
export function calculateRouteLegPerformance(
  leg: Pick<RouteWindLeg, "headingDeg">,
  selectedSpeedKnots: number,
  loadSpeedFactor: number,
  wind: Wind,
  referenceFuelPerVoyageHour: number,
  referenceSpeedKnots: number = 6,
): { speedKnots: number; fuelPerVoyageHour: number } {
  return {
    speedKnots: calculateEffectiveSpeedKnots(selectedSpeedKnots, loadSpeedFactor, leg.headingDeg, wind),
    fuelPerVoyageHour: calculateFuelRate(selectedSpeedKnots, referenceFuelPerVoyageHour, referenceSpeedKnots),
  };
}

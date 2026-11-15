import { HEX_DISTANCE_NM } from "./hexMap";
import { getRouteHexIds } from "./routePath";

export function getShortestRouteDistanceNm(fromPortId: string, toPortId: string): number {
  if (!fromPortId || !toPortId || fromPortId === toPortId) {
    throw new RangeError("Invalid route endpoints");
  }
  const hexIds = getRouteHexIds(fromPortId, toPortId);
  if (!hexIds || hexIds.length < 2) {
    throw new Error("Shortest route is unavailable");
  }
  const distanceNm = (hexIds.length - 1) * HEX_DISTANCE_NM;
  if (!Number.isFinite(distanceNm) || distanceNm <= 0) {
    throw new RangeError("Invalid shortest route distance");
  }
  return distanceNm;
}

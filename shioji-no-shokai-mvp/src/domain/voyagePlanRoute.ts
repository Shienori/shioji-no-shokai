import { hexMap } from "../data/hexMap";
import { findShortestRoute, getHexKey } from "./hexMap";
import { buildRouteWindLegs } from "./routeWind";
import type { FixedRouteEndpoints, VoyagePlanRouteDraft, VoyagePlanRouteResult, VoyagePlanRouteErrorReason, ConfirmedVoyageRouteSection } from "./voyagePlanTypes";

/** Pure route construction. No save, fuel change or alternate-path retry. */
export function buildVoyagePlanRoute(endpoints: FixedRouteEndpoints, draft: VoyagePlanRouteDraft): VoyagePlanRouteResult {
  const fail = (reason: VoyagePlanRouteErrorReason, message: string, sectionIndex?: number): VoyagePlanRouteResult => ({ ok: false, reason, message, ...(sectionIndex === undefined ? {} : { sectionIndex }) });
  const { departurePortId, destinationPortId } = endpoints;
  if (!departurePortId || !destinationPortId || departurePortId === destinationPortId) return fail("invalidInput", "固定された両端の港を確認してください。");
  if (draft.legs.length !== draft.stops.length + 1) return fail("invalidInput", "区間数と途中寄港数が一致しません。");
  if (draft.legs.reduce((n, leg) => n + leg.waypointHexIds.length, 0) > 8) return fail("invalidInput", "ウェイポイントは航海全体で8個までです。");
  const byId = new Map(hexMap.map(h => [h.id, h]));
  const byCoordinate = new Map(hexMap.map(h => [getHexKey(h), h]));
  const portCells = hexMap.filter(h => h.kind === "port" && h.portId);
  const ports = new Map(portCells.map(h => [h.portId!, h]));
  if (byId.size !== hexMap.length || byCoordinate.size !== hexMap.length || ports.size !== portCells.length) return fail("invalidInput", "地図のIDまたは座標が重複しています。");
  if (!ports.has(departurePortId) || !ports.has(destinationPortId)) return fail("invalidInput", "固定された両端の港が地図にありません。");
  const stopIds = new Set<string>();
  for (const [i, stop] of draft.stops.entries()) {
    if (!ports.has(stop.portId) || stop.portId === departurePortId || stop.portId === destinationPortId || stopIds.has(stop.portId)) return fail("invalidInput", "途中寄港先が不正または重複しています。", i);
    if (!Number.isInteger(stop.refuelTargetPercent) || stop.refuelTargetPercent < 0 || stop.refuelTargetPercent > 100) return fail("invalidInput", "補油目標は0から100の整数で指定してください。", i);
    stopIds.add(stop.portId);
  }
  const sequence = [departurePortId, ...draft.stops.map(s => s.portId), destinationPortId];
  const sections: ConfirmedVoyageRouteSection[] = [];
  let totalDistanceNm = 0;
  for (const [i, leg] of draft.legs.entries()) {
    const start = ports.get(sequence[i])!;
    const goal = ports.get(sequence[i + 1])!;
    const ids = new Set(leg.waypointHexIds);
    if (ids.size !== leg.waypointHexIds.length) return fail("repeatedHex", "同一区間のウェイポイントが重複しています。", i);
    const waypoints = [];
    for (const id of leg.waypointHexIds) {
      const h = byId.get(id);
      if (!h || h.kind !== "sea") return fail("invalidInput", "ウェイポイントには実在する海上HEXを指定してください。", i);
      waypoints.push(h);
    }
    const anchors = [start, ...waypoints, goal];
    const passable = hexMap.filter(h => h.kind === "sea" || h.id === start.id || h.id === goal.id);
    const joined: string[] = [];
    for (let n = 0; n < anchors.length - 1; n++) {
      const path = findShortestRoute(anchors[n], anchors[n + 1], passable);
      if (!path) return fail("noRoute", "指定地点間に経路がありません。", i);
      for (const point of path.slice(n === 0 ? 0 : 1)) {
        const h = byCoordinate.get(getHexKey(point));
        if (!h) throw new Error("Route finder returned an unknown HEX");
        joined.push(h.id);
      }
    }
    if (new Set(joined).size !== joined.length) return fail("repeatedHex", "同一区間で同じHEXを再通過しています。ウェイポイントを変更してください。", i);
    const order = joined.filter(id => ids.has(id));
    if (order.length !== leg.waypointHexIds.length || order.some((id, n) => id !== leg.waypointHexIds[n])) return fail("waypointOrder", "ウェイポイントの通過順が指定順と一致しません。", i);
    if (joined.length < 3 || joined.slice(1, -1).some(id => byId.get(id)!.kind !== "sea")) return fail("invalidInput", "区間内部は海上HEXである必要があります。", i);
    totalDistanceNm += buildRouteWindLegs(joined).reduce((n, item) => n + item.distanceNm, 0);
    const stop = draft.stops[i];
    sections.push({ fromPortId: sequence[i], toPortId: sequence[i + 1], waypointHexIds: [...leg.waypointHexIds], hexIds: joined, ...(stop === undefined ? {} : { refuelTargetPercent: stop.refuelTargetPercent }) });
  }
  return { ok: true, route: { schemaVersion: 1, departurePortId, destinationPortId, sections }, totalDistanceNm };
}

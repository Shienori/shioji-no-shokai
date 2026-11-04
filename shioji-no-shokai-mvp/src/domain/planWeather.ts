import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import type { VoyagePlanForecast } from "./voyagePlanForecast";
import { voyagePlanSectionKey } from "./voyagePlanForecast";
import { isValidContractWindForecast, getSavedWindForecastAt } from "./contractWindForecast";
import { buildRouteWindLegs } from "./routeWind";
import { calculateWindSpeedFactor } from "./shipPerformance";
import { getHexById, getPortHexId } from "../data/hexMap";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";

export const PLAN_DELAY_NOTICE = "予定コースに海況の悪い区間があります。到着が遅れる可能性があります";
export const PLAN_FORECAST_MISSING_NOTICE = "一部区間の予報を確認できません。海況による遅延の可能性を十分に判断できません";
export const PLAN_NO_DELAY_NOTICE = "予報上、遅延注意に該当する区間はありません";
function validTime(value: number): boolean { return Number.isFinite(value) && Math.abs(value) <= 8.64e15; }
/** Fixed-speed positions and passage windows only. Weather never shifts the schedule. */
export function buildPlanTimeline(route: ConfirmedVoyageRoute, baseRealTime: number, departureRealTime: number, selectedSpeedKnots: number) {
  if (route.schemaVersion !== 1 || route.sections.length === 0 || !validTime(baseRealTime) || !validTime(departureRealTime) ||
      departureRealTime < baseRealTime || !Number.isFinite(selectedSpeedKnots) || selectedSpeedKnots <= 0 ||
      !Number.isFinite(GAME_TIME_MULTIPLIER) || GAME_TIME_MULTIPLIER <= 0) throw new Error("Invalid plan timeline");
  let distanceNm = 0;
  const passages = route.sections.flatMap((section, sectionIndex) => {
    if (section.fromPortId !== (sectionIndex === 0 ? route.departurePortId : route.sections[sectionIndex - 1].toPortId) ||
        (sectionIndex === route.sections.length - 1 && section.toPortId !== route.destinationPortId)) throw new Error("Disconnected plan");
    return buildRouteWindLegs(section.hexIds).map(leg => {
      const startsAt = departureRealTime + distanceNm / selectedSpeedKnots * 3600000 / GAME_TIME_MULTIPLIER;
      distanceNm += leg.distanceNm;
      const endsAt = departureRealTime + distanceNm / selectedSpeedKnots * 3600000 / GAME_TIME_MULTIPLIER;
      if (!validTime(endsAt) || endsAt <= startsAt) throw new Error("Plan time overflow");
      return { ...leg, sectionIndex, startsAt, endsAt };
    });
  });
  if (passages.length === 0) throw new Error("No plan passages");
  return { route, baseRealTime, departureRealTime, plannedEtaRealTime: passages[passages.length - 1].endsAt,
    totalDistanceNm: distanceNm, passages };
}
export type PlanTimeline = ReturnType<typeof buildPlanTimeline>;
export function getPlanPosition(timeline: PlanTimeline, targetRealTime: number) {
  if (!validTime(targetRealTime)) throw new Error("Invalid plan position time");
  if (targetRealTime <= timeline.departureRealTime) {
    const id = getPortHexId(timeline.route.departurePortId), hex = getHexById(id);
    return { hexId: id, axial: { q: hex.q, r: hex.r }, sectionIndex: 0, progress: 0, status: "notDeparted" as const };
  }
  if (targetRealTime >= timeline.plannedEtaRealTime) {
    const id = getPortHexId(timeline.route.destinationPortId), hex = getHexById(id);
    return { hexId: id, axial: { q: hex.q, r: hex.r }, sectionIndex: timeline.route.sections.length - 1, progress: 1, status: "arrived" as const };
  }
  const passage = timeline.passages.find(item => targetRealTime >= item.startsAt && targetRealTime < item.endsAt);
  if (!passage) throw new Error("No passage at requested plan time");
  const from = getHexById(passage.hexId), to = getHexById(passage.nextHexId);
  const fraction = (targetRealTime - passage.startsAt) / (passage.endsAt - passage.startsAt);
  const progress = (targetRealTime - timeline.departureRealTime) / (timeline.plannedEtaRealTime - timeline.departureRealTime);
  return { hexId: passage.hexId, axial: { q: from.q + (to.q - from.q) * fraction, r: from.r + (to.r - from.r) * fraction },
    sectionIndex: passage.sectionIndex, progress, status: "sailing" as const };
}
export function getPlanSectionForecast(route: ConfirmedVoyageRoute, forecast: VoyagePlanForecast | null, index: number) {
  const snapshot = forecast?.sections[index];
  if (!forecast || !snapshot || !isValidContractWindForecast(snapshot, voyagePlanSectionKey(route, index), forecast.capturedAt)) return null;
  const ids = buildRouteWindLegs(route.sections[index].hexIds).map(leg => leg.hexId);
  return snapshot.seaHexIds.length === ids.length && snapshot.seaHexIds.every((id, n) => id === ids[n]) ? snapshot : null;
}
/** Evaluate every forecast slot overlapping each fixed plan passage, not the selected slider time. */
export function evaluatePlanWeather(timeline: PlanTimeline, forecast: VoyagePlanForecast | null) {
  const snapshots = timeline.route.sections.map((_, index) => getPlanSectionForecast(timeline.route, forecast, index));
  const passages = timeline.passages.map(passage => {
    const snapshot = snapshots[passage.sectionIndex];
    let hasDelay = false, hasMissing = !snapshot;
    if (snapshot) {
      hasMissing = passage.startsAt < snapshot.validFrom || passage.endsAt > snapshot.validTo;
      let cursor = Math.max(passage.startsAt, snapshot.validFrom);
      const end = Math.min(passage.endsAt, snapshot.validTo);
      while (cursor < end) {
        const slot = getSavedWindForecastAt(snapshot, passage.hexId, Math.floor(cursor));
        if (!slot || slot.startsAt > cursor || slot.endsAt <= cursor) { hasMissing = true; break; }
        if (calculateWindSpeedFactor(passage.headingDeg, slot.forecastWind) <= 0.95) hasDelay = true;
        cursor = Math.min(end, slot.endsAt);
      }
    }
    return { sectionIndex: passage.sectionIndex, hexId: passage.hexId, startsAt: passage.startsAt, endsAt: passage.endsAt, hasDelay, hasMissing };
  });
  return { hasDelay: passages.some(item => item.hasDelay), hasMissing: passages.some(item => item.hasMissing), passages };
}

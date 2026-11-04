import { hexMap } from "../data/hexMap";
import type { WindForecastSlot } from "./windForecast";
import { getWindForecastIssueTime, getWindForecastTimeline, WIND_FORECAST_MODEL_VERSION, WIND_FORECAST_HORIZON_MS } from "./windForecast";
import { WIND_MODEL_VERSION } from "./windTimeline";
import { SEA_CONDITION_SLOT_MS } from "./seaCondition";
import { assertValidWind } from "./windForecastAccuracy";
import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import type { VoyagePlanForecast } from "./voyagePlanForecast";
import { voyagePlanSectionKey } from "./voyagePlanForecast";
import { buildRouteWindLegs } from "./routeWind";
import { isValidContractWindForecast } from "./contractWindForecast";

export interface WorldPlanForecast {
  capturedAt: number;
  issuedAt: number;
  forecastModelVersion: string;
  windModelVersion: string;
  validFrom: number;
  validTo: number;
  forecastsByHex: Record<string, WindForecastSlot[]>;
}
const copySlot = (slot: WindForecastSlot): WindForecastSlot => ({ ...slot, forecastWind: { ...slot.forecastWind } });
/** Explicit read-only forecast capture for all sea HEXes, never just the selected route. */
export function createWorldPlanForecast(capturedAt: number): WorldPlanForecast {
  if (!Number.isSafeInteger(capturedAt) || Math.abs(capturedAt) > 8.64e15) throw new RangeError("Invalid forecast capture time");
  const issuedAt = getWindForecastIssueTime(capturedAt);
  return { capturedAt, issuedAt, forecastModelVersion: WIND_FORECAST_MODEL_VERSION, windModelVersion: WIND_MODEL_VERSION,
    validFrom: issuedAt, validTo: issuedAt + WIND_FORECAST_HORIZON_MS,
    forecastsByHex: Object.fromEntries(hexMap.filter(hex => hex.kind === "sea").map(hex =>
      [hex.id, getWindForecastTimeline(hex.id, issuedAt).map(copySlot)])) };
}
/** Missing coverage stays missing. No forecast regeneration, actual-wind or clock lookup. */
export function getWorldPlanForecastAt(forecast: WorldPlanForecast | null, hexId: string, targetRealTime: number): WindForecastSlot | null {
  if (!forecast || !Number.isFinite(targetRealTime) || targetRealTime < forecast.validFrom || targetRealTime >= forecast.validTo) return null;
  const rows = forecast.forecastsByHex[hexId];
  const index = Math.floor((targetRealTime - forecast.validFrom) / SEA_CONDITION_SLOT_MS);
  const slot = rows?.[index];
  if (!slot || slot.hexId !== hexId || slot.issuedAt !== forecast.issuedAt || slot.modelVersion !== forecast.forecastModelVersion ||
      slot.windModelVersion !== forecast.windModelVersion || slot.startsAt > targetRealTime || slot.endsAt <= targetRealTime) return null;
  try { assertValidWind(slot.forecastWind); } catch { return null; }
  return copySlot(slot);
}
/** Extract route snapshots from the exact same world edition; editing never draws new weather. */
export function buildVoyagePlanForecastFromWorld(route: ConfirmedVoyageRoute, world: WorldPlanForecast): VoyagePlanForecast {
  if (route.schemaVersion !== 1 || route.sections.length === 0) throw new Error("Invalid forecast route");
  const sections = route.sections.map((section, index) => {
    const seaHexIds = buildRouteWindLegs(section.hexIds).map(leg => leg.hexId);
    const snapshot = { schemaVersion: 1 as const, forecastModelVersion: world.forecastModelVersion, windModelVersion: world.windModelVersion,
      capturedAt: world.capturedAt, issuedAt: world.issuedAt, routeId: voyagePlanSectionKey(route, index), seaHexIds,
      validFrom: world.validFrom, validTo: world.validTo,
      forecastsByHex: Object.fromEntries(seaHexIds.map(id => {
        const rows = world.forecastsByHex[id];
        if (!rows) throw new Error("World forecast is missing route coverage");
        return [id, rows.map(copySlot)];
      })) };
    if (!isValidContractWindForecast(snapshot, snapshot.routeId, world.capturedAt)) throw new Error("Invalid extracted forecast");
    return snapshot;
  });
  return { capturedAt: world.capturedAt, sections };
}

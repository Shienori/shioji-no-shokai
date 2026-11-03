import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import type { ContractWindForecastSnapshot } from "./contractWindForecast";
import { isValidContractWindForecast } from "./contractWindForecast";
import { buildRouteWindLegs } from "./routeWind";
import { getWindForecastIssueTime, getWindForecastTimeline, WIND_FORECAST_MODEL_VERSION, WIND_FORECAST_HORIZON_MS } from "./windForecast";
import { WIND_MODEL_VERSION } from "./windTimeline";

export interface VoyagePlanForecast {
  capturedAt: number;
  sections: ContractWindForecastSnapshot[];
}
export function voyagePlanSectionKey(route: ConfirmedVoyageRoute, index: number): string {
  const section = route.sections[index];
  return JSON.stringify(["voyage-plan-v1", route.departurePortId, route.destinationPortId, index, section.fromPortId, section.toPortId, section.hexIds]);
}
/** Explicit forecast creation only; prediction never regenerates this edition. */
export function createVoyagePlanForecast(route: ConfirmedVoyageRoute, capturedAt: number): VoyagePlanForecast {
  if (!Number.isSafeInteger(capturedAt) || Math.abs(capturedAt) > 8.64e15) throw new RangeError("Invalid capture time");
  if (route.schemaVersion !== 1 || route.sections.length === 0) throw new Error("Invalid route");
  const issuedAt = getWindForecastIssueTime(capturedAt);
  const sections = route.sections.map((section, index): ContractWindForecastSnapshot => {
    const seaHexIds = buildRouteWindLegs(section.hexIds).map(leg => leg.hexId);
    const snapshot: ContractWindForecastSnapshot = {
      schemaVersion: 1,
      forecastModelVersion: WIND_FORECAST_MODEL_VERSION,
      windModelVersion: WIND_MODEL_VERSION,
      capturedAt, issuedAt, routeId: voyagePlanSectionKey(route, index),
      seaHexIds, validFrom: issuedAt, validTo: issuedAt + WIND_FORECAST_HORIZON_MS,
      forecastsByHex: Object.fromEntries([...new Set(seaHexIds)].map(id => [id,
        getWindForecastTimeline(id, issuedAt).map(row => ({ ...row, forecastWind: { ...row.forecastWind } })),
      ])),
    };
    if (!isValidContractWindForecast(snapshot, snapshot.routeId, capturedAt)) throw new Error("Invalid generated plan forecast");
    return snapshot;
  });
  return { capturedAt, sections };
}

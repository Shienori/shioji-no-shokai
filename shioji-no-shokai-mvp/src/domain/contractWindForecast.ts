import type { Wind } from "./coastalWind";
import type { GameState, Route } from "./types";
import { getRouteHexIds } from "./routePath";
import { getHexById } from "../data/hexMap";
import { assertValidWind } from "./windForecastAccuracy";
import { WIND_MODEL_VERSION } from "./windTimeline";
import { SEA_CONDITION_SLOT_MS } from "./seaCondition";
import { getWindForecastIssueTime, getWindForecastTimeline, WIND_FORECAST_MODEL_VERSION, WIND_FORECAST_HORIZON_MS } from "./windForecast";
import type { WindForecastSlot } from "./windForecast";

export interface ContractWindForecastSnapshot {
  schemaVersion: 1;
  forecastModelVersion: string; windModelVersion: string;
  capturedAt: number; issuedAt: number; routeId: string; seaHexIds: string[];
  validFrom: number; validTo: number;
  forecastsByHex: Record<string, WindForecastSlot[]>;
}
const copySlot = (row: WindForecastSlot): WindForecastSlot => ({ ...row, forecastWind: { ...row.forecastWind } });
export function createContractWindForecast(route: Route, acceptedAt: number): ContractWindForecastSnapshot {
  const issuedAt = getWindForecastIssueTime(acceptedAt);
  const path = getRouteHexIds(route.fromPortId, route.toPortId);
  if (!path) throw new Error("Cannot snapshot forecast: no route");
  const seaHexIds = path.filter(id => getHexById(id).kind === "sea");
  if (seaHexIds.length === 0) throw new Error("Cannot snapshot forecast: no sea HEX");
  const snapshot: ContractWindForecastSnapshot = {
    schemaVersion: 1, forecastModelVersion: WIND_FORECAST_MODEL_VERSION, windModelVersion: WIND_MODEL_VERSION,
    capturedAt: acceptedAt, issuedAt, routeId: route.id, seaHexIds: [...seaHexIds],
    validFrom: issuedAt, validTo: issuedAt + WIND_FORECAST_HORIZON_MS,
    forecastsByHex: Object.fromEntries([...new Set(seaHexIds)].map(id => [id, getWindForecastTimeline(id, issuedAt).map(copySlot)]))
  };
  if (!isValidContractWindForecast(snapshot, route.id, acceptedAt)) throw new Error("Invalid generated forecast snapshot");
  return snapshot;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function time(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
// Structural validation only: never regenerate, and never require current map/model versions.
export function isValidContractWindForecast(value: unknown, routeId: string, acceptedAt: number): value is ContractWindForecastSnapshot {
  try {
    if (!record(value) || value.schemaVersion !== 1 || value.routeId !== routeId || value.capturedAt !== acceptedAt) return false;
    if (!text(value.forecastModelVersion) || !text(value.windModelVersion) || !time(value.capturedAt) || !time(value.issuedAt)) return false;
    if (getWindForecastIssueTime(value.capturedAt) !== value.issuedAt || value.validFrom !== value.issuedAt || value.validTo !== value.issuedAt + WIND_FORECAST_HORIZON_MS) return false;
    if (!Array.isArray(value.seaHexIds) || value.seaHexIds.length === 0 || !value.seaHexIds.every(text)) return false;
    const ids = [...new Set(value.seaHexIds as string[])];
    const byHex = value.forecastsByHex;
    if (!record(byHex) || Object.keys(byHex).length !== ids.length || Object.keys(byHex).some(id => !ids.includes(id))) return false;
    for (const id of ids) {
      if (!Object.prototype.hasOwnProperty.call(byHex, id)) return false;
      const rows = byHex[id];
      if (!Array.isArray(rows) || rows.length !== WIND_FORECAST_HORIZON_MS / SEA_CONDITION_SLOT_MS) return false;
      for (let i = 0; i < rows.length; i++) {
        const row: unknown = rows[i];
        const start = value.issuedAt + i * SEA_CONDITION_SLOT_MS;
        if (!record(row) || row.hexId !== id || row.issuedAt !== value.issuedAt || row.modelVersion !== value.forecastModelVersion || row.windModelVersion !== value.windModelVersion) return false;
        if (row.startsAt !== start || row.endsAt !== start + SEA_CONDITION_SLOT_MS || row.slotIndex !== Math.floor(start / SEA_CONDITION_SLOT_MS)) return false;
        assertValidWind(row.forecastWind as Wind);
      }
    }
    return true;
  } catch { return false; }
}
export function normalizeContractWindForecast(state: GameState): GameState {
  const contract = state.acceptedContract;
  if (!contract || contract.windForecastSnapshot === undefined) return state;
  if (isValidContractWindForecast(contract.windForecastSnapshot, contract.routeId, contract.acceptedAt)) return state;
  const acceptedContract = { ...contract, windForecastSnapshotIssue: "invalid" as const };
  delete acceptedContract.windForecastSnapshot;
  return { ...state, acceptedContract };
}
export function getSavedWindForecastAt(snapshot: ContractWindForecastSnapshot | undefined, hexId: string, targetMs: number): WindForecastSlot | null {
  if (!snapshot || !time(targetMs) || targetMs < snapshot.validFrom || targetMs >= snapshot.validTo) return null;
  const rows = snapshot.forecastsByHex[hexId];
  if (!rows) return null;
  const index = Math.floor((targetMs - snapshot.validFrom) / SEA_CONDITION_SLOT_MS);
  return rows[index] ? copySlot(rows[index]) : null;
}

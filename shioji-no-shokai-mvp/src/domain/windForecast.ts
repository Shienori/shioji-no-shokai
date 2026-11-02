import type { Wind } from "./coastalWind";
import { assertValidWind, isWindForecastHit } from "./windForecastAccuracy";
import { getWindAt, WIND_MODEL_VERSION, WORLD_UTC_OFFSET_MINUTES } from "./windTimeline";
import { SEA_CONDITION_SLOT_MS } from "./seaCondition";

export const WIND_FORECAST_MODEL_VERSION = "wind-forecast-v1";
export const WIND_FORECAST_ACCURACY = 0.8;
export const WIND_FORECAST_HORIZON_MS = 8 * 86_400_000;
const DAY_MS = 86_400_000;
const ISSUE_HOUR_MS = 6 * 3_600_000;
type Random = () => number;
export interface ForecastKey {
  issuedAt: number; hexId: string; slotIndex: number;
}
export interface WindForecastSlot {
  modelVersion: string; windModelVersion: string; issuedAt: number; hexId: string;
  slotIndex: number; startsAt: number; endsAt: number; forecastWind: Wind;
}
function normalize(deg: number): number { return ((deg % 360) + 360) % 360; }
function assertTime(time: number): void {
  if (!Number.isSafeInteger(time) || Math.abs(time) > 8.64e15) throw new Error("Invalid time");
}
function draw(random: Random): number {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Random draw must be in [0,1)");
  return value;
}
export function generateWindForecast(actual: Wind, random: Random, accuracy = WIND_FORECAST_ACCURACY): Wind {
  assertValidWind(actual);
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 1) throw new Error("Invalid forecast accuracy");
  const hit = draw(random) < accuracy;
  const angleDraw = draw(random), speedDraw = draw(random);
  const mode = hit ? 2 : Math.floor(draw(random) * 3);
  const angleDelta = hit ? (angleDraw * 2 - 1) * 45 : (angleDraw < 0.5 ? -1 : 1) * (67.5 + 22.5 * Math.abs(angleDraw * 2 - 1));
  const speedDelta = hit ? (speedDraw * 2 - 1) * 2 : (speedDraw < 0.5 ? -1 : 1) * (2.5 + 1.5 * Math.abs(speedDraw * 2 - 1));
  const speedMps = Math.max(0, actual.speedMps + (mode === 0 ? 0 : speedDelta));
  const candidate: Wind = { speedMps, fromDeg: speedMps === 0 ? null : normalize((actual.fromDeg ?? 0) + (mode === 1 ? 0 : angleDelta)) };
  if (isWindForecastHit(actual, candidate) === hit) return candidate;
  // Weak-wind rules and zero clamping can change the category. Bounded fallback, no rejection loop.
  const fallback: Wind = hit ? { ...actual } : {
    speedMps: Math.min(Number.MAX_VALUE, actual.speedMps + 3),
    fromDeg: normalize((actual.fromDeg ?? 0) + 180)
  };
  if (isWindForecastHit(actual, fallback) !== hit) throw new Error("Cannot satisfy forecast category");
  return fallback;
}
export function createWindForecast(actual: Wind, key: ForecastKey, accuracy = WIND_FORECAST_ACCURACY): Wind {
  assertTime(key.issuedAt);
  if (!key.hexId || !Number.isSafeInteger(key.slotIndex)) throw new Error("Invalid forecast key");
  const source = JSON.stringify([WIND_FORECAST_MODEL_VERSION, WIND_MODEL_VERSION, key.issuedAt, key.hexId, key.slotIndex]);
  let state = 2166136261;
  for (let i = 0; i < source.length; i++) state = Math.imul(state ^ source.charCodeAt(i), 16777619) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return generateWindForecast(actual, random, accuracy);
}
export function getWindForecastIssueTime(nowMs: number): number {
  assertTime(nowMs);
  const offset = WORLD_UTC_OFFSET_MINUTES * 60_000;
  return Math.floor((nowMs + offset - ISSUE_HOUR_MS) / DAY_MS) * DAY_MS + ISSUE_HOUR_MS - offset;
}
function assertIssue(issuedAt: number): void {
  assertTime(issuedAt);
  if (getWindForecastIssueTime(issuedAt) !== issuedAt) throw new Error("Issue time must be 06:00 world time");
}
export function getWindForecastAt(hexId: string, targetMs: number, issuedAt: number): WindForecastSlot {
  assertIssue(issuedAt); assertTime(targetMs);
  if (targetMs < issuedAt || targetMs >= issuedAt + WIND_FORECAST_HORIZON_MS) throw new Error("Target outside forecast edition");
  const actual = getWindAt(hexId, targetMs);
  return {
    modelVersion: WIND_FORECAST_MODEL_VERSION, windModelVersion: WIND_MODEL_VERSION,
    issuedAt, hexId, slotIndex: actual.slotIndex, startsAt: actual.startsAt, endsAt: actual.endsAt,
    forecastWind: createWindForecast(actual.wind, { issuedAt, hexId, slotIndex: actual.slotIndex })
  };
}
// Complete slots intersecting [fromMs,toMs), all from one explicitly selected edition.
export function getWindForecastTimeline(hexId: string, issuedAt: number, fromMs = issuedAt, toMs = issuedAt + WIND_FORECAST_HORIZON_MS): WindForecastSlot[] {
  assertIssue(issuedAt); assertTime(fromMs); assertTime(toMs);
  if (fromMs < issuedAt || toMs > issuedAt + WIND_FORECAST_HORIZON_MS || toMs <= fromMs) throw new Error("Invalid forecast range");
  const result: WindForecastSlot[] = [];
  for (let time = Math.floor(fromMs / SEA_CONDITION_SLOT_MS) * SEA_CONDITION_SLOT_MS; time < toMs; time += SEA_CONDITION_SLOT_MS) {
    result.push(getWindForecastAt(hexId, time, issuedAt));
  }
  return result;
}

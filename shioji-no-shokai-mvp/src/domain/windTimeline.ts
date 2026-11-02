import { hexMap } from "../data/hexMap";
import { worldMap } from "../data/worldMap";
import { SEA_CONDITION_SLOT_MS, FORECAST_HORIZON_MS, getSeaConditionSlotIndex } from "./seaCondition";
import { buildCoastalProfile, combineCoastalWind } from "./coastalWind";
import type { Wind, CoastalProfile } from "./coastalWind";

export const WIND_MODEL_VERSION = "wind-v2-coastal-1";
export const WORLD_UTC_OFFSET_MINUTES = 480;
export interface WindSlot {
  modelVersion: string; hexId: string; slotIndex: number; startsAt: number; endsAt: number;
  backgroundWind: Wind; coastalWind: Wind; wind: Wind;
}
const profiles = new Map<string, CoastalProfile>();
const land = worldMap.terrain.filter(cell => cell.kind === "land");
function randomFor(hexId: string, slot: number, component: string): number {
  const source = `${WIND_MODEL_VERSION}:${hexId}:${slot}:${component}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return ((Math.imul(hash, 1664525) + 1013904223) >>> 0) / 4294967296;
}
function requireSea(hexId: string) {
  const hex = hexMap.find(h => h.id === hexId);
  if (!hex || hex.kind !== "sea") throw new Error(`Unknown sea HEX: ${hexId}`);
  return hex;
}
export function generateBackgroundWind(hexId: string, slotIndex: number): Wind {
  requireSea(hexId);
  if (!Number.isSafeInteger(slotIndex)) throw new Error("Invalid slot index");
  const roll = randomFor(hexId, slotIndex, "strength");
  const speedMps = roll < 0.10 ? 0 : roll < 0.30 ? 2 : roll < 0.65 ? 5 : roll < 0.90 ? 7 : 10;
  return { speedMps, fromDeg: speedMps === 0 ? null : Math.floor(randomFor(hexId, slotIndex, "direction") * 8) * 45 };
}
export function getWindAt(hexId: string, timeMs: number): WindSlot {
  const hex = requireSea(hexId);
  if (!Number.isFinite(timeMs) || Math.abs(timeMs) > 8.64e15) throw new Error("Invalid time");
  let profile = profiles.get(hexId);
  if (!profile) { profile = buildCoastalProfile(hex, land); profiles.set(hexId, profile); }
  const slotIndex = getSeaConditionSlotIndex(timeMs);
  const startsAt = slotIndex * SEA_CONDITION_SLOT_MS, endsAt = startsAt + SEA_CONDITION_SLOT_MS;
  const shifted = (startsAt + endsAt) / 2 + WORLD_UTC_OFFSET_MINUTES * 60_000;
  const hour = ((shifted % 86_400_000) + 86_400_000) % 86_400_000 / 3_600_000;
  const backgroundWind = generateBackgroundWind(hexId, slotIndex);
  return { modelVersion: WIND_MODEL_VERSION, hexId, slotIndex, startsAt, endsAt, backgroundWind,
    ...combineCoastalWind(backgroundWind, profile, hour) };
}
// Returns complete slots intersecting [fromMs,toMs); a non-aligned 7-day range has 85 slots.
export function getWindTimeline(hexId: string, fromMs: number, toMs: number = fromMs + FORECAST_HORIZON_MS): WindSlot[] {
  requireSea(hexId);
  if (![fromMs, toMs].every(Number.isFinite) || Math.max(Math.abs(fromMs), Math.abs(toMs)) > 8.64e15 || toMs <= fromMs || toMs - fromMs > FORECAST_HORIZON_MS) throw new Error("Invalid timeline range");
  const result: WindSlot[] = [];
  for (let time = getSeaConditionSlotIndex(fromMs) * SEA_CONDITION_SLOT_MS; time < toMs; time += SEA_CONDITION_SLOT_MS) result.push(getWindAt(hexId, time));
  return result;
}

import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function advanceOperationTime(lastOperationTime: number, lastRealTime: number, currentRealTime: number): number {
  const realElapsed = Math.max(0, currentRealTime - lastRealTime);
  return lastOperationTime + realElapsed * GAME_TIME_MULTIPLIER;
}

export function floorTo30Minutes(realTimeMs: number): number {
  const intervalMs = 30 * 60 * 1000;
  return Math.floor(realTimeMs / intervalMs) * intervalMs;
}

export function ceilTo30Minutes(realTimeMs: number): number {
  const intervalMs = 30 * 60 * 1000;
  return Math.ceil(realTimeMs / intervalMs) * intervalMs;
}

export function ceilTo1Minute(realTimeMs: number): number {
  const intervalMs = 60 * 1000;
  return Math.ceil(realTimeMs / intervalMs) * intervalMs;
}

export function formatDateTime(realTimeMs: number): string {
  const date = new Date(realTimeMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const weekday = WEEKDAY_LABELS[date.getDay()];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}/${month}/${day}（${weekday}）${hours}:${minutes}`;
}

export function formatGameTime(realTimeMs: number): string {
  return formatDateTime(realTimeMs);
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours <= 0 ? `${minutes}分` : `${hours}時間${minutes}分`;
}

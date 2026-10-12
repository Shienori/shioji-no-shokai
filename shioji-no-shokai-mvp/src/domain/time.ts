import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";

export function advanceOperationTime(lastOperationTime: number, lastRealTime: number, currentRealTime: number): number {
  const realElapsed = Math.max(0, currentRealTime - lastRealTime);
  return lastOperationTime + realElapsed * GAME_TIME_MULTIPLIER;
}

export function formatGameTime(realTimeMs: number): string {
  const date = new Date(realTimeMs);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hours}:${minutes}`;
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours <= 0 ? `${minutes}分` : `${hours}時間${minutes}分`;
}
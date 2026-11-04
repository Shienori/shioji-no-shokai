import type { GameState } from "./types";
import type { WindNavigationInput } from "./windNavigation";
import { progressConfirmedPlanLifecycle } from "./confirmedPlanLifecycle";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";

export type DebugBoundaryKind = "departed" | "portCall" | "arrived" | "completed" | "fuelDepleted";
export type DebugBoundaryResult =
  | { kind: "found"; event: DebugBoundaryKind; atRealTime: number; state: GameState }
  | { kind: "unavailable"; reason: string };

/** Calculates a candidate only. Does not publish, save, settle, or change any clock. */
export function findNextDebugVoyageBoundary(
  state: GameState,
  readWind?: WindNavigationInput["readWind"],
  maxAdvanceMs = 7 * 86400000,
): DebugBoundaryResult {
  const voyage = state.activeVoyage;
  if (!voyage || voyage.phase === "completed" || voyage.settled) return { kind: "unavailable", reason: "進行中の航海がありません。完了後は通常の精算を行ってください。" };
  if (voyage.plannedNavigation === undefined) return { kind: "unavailable", reason: "この機能は確定計画の航海を対象とします。" };
  const start = state.lastRealTimeSyncedAt;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(maxAdvanceMs) || maxAdvanceMs <= 0 || maxAdvanceMs > 7 * 86400000 || !Number.isSafeInteger(start + maxAdvanceMs)) throw new RangeError("Invalid debug boundary time");
  const baseline = structuredClone(state);
  const initialCalls = voyage.plannedNavigation.checkpoint.portCalls.length;
  const contractId = voyage.contractId;
  function eventAt(candidate: GameState): DebugBoundaryKind | null {
    if (!candidate.activeVoyage) {
      const memo = candidate.voyageMemos.find(item => item.contractId === contractId && item.fuelDepletionReturn !== undefined);
      if (memo) return "fuelDepleted";
      throw new Error("Voyage disappeared without a depletion record");
    }
    const current = candidate.activeVoyage;
    if (current.phase === "completed") return "completed";
    if (current.phase === "unloading" && voyage!.phase !== "unloading") return "arrived";
    if (current.plannedNavigation!.checkpoint.portCalls.length > initialCalls) return "portCall";
    if (current.phase === "sailing" && voyage!.phase === "loading") return "departed";
    return null;
  }
  function simulate(at: number): GameState {
    return progressConfirmedPlanLifecycle({ ...structuredClone(baseline), currentGameTime: at,
      lastRealTimeSyncedAt: at, operationTime: baseline.operationTime + (at - start) * GAME_TIME_MULTIPLIER }, at, readWind);
  }
  const synchronized = simulate(start);
  const immediate = eventAt(synchronized);
  if (immediate) return { kind: "found", event: immediate, atRealTime: start, state: synchronized };
  const end = start + maxAdvanceMs;
  let previous = start;
  for (let cursor = Math.min(end, start + 60000); cursor <= end; cursor = Math.min(end, cursor + 60000)) {
    const candidate = simulate(cursor);
    if (eventAt(candidate)) {
      let low = previous, high = cursor;
      while (high - low > 1) {
        const mid = low + Math.floor((high - low) / 2);
        if (eventAt(simulate(mid))) high = mid; else low = mid;
      }
      const next = simulate(high), event = eventAt(next);
      if (!event) throw new Error("Boundary search did not converge");
      return { kind: "found", event, atRealTime: high, state: next };
    }
    if (cursor === end) break;
    previous = cursor;
  }
  return { kind: "unavailable", reason: "指定した探索時間内に区切りが見つかりません。風データや航海状態を確認してください。" };
}

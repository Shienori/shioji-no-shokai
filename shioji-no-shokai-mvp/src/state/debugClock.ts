import type { GameState } from "../domain/types";
export type DebugClockState = GameState & { debugClock?: { version: 1; offsetMs: number } };
type Runtime = { realNow: () => number; offsetMs: number };
const scope = globalThis as typeof globalThis & { __shiojiDebugClockV1?: Runtime };
const runtime = scope.__shiojiDebugClockV1 ?? { realNow: Date.now.bind(Date), offsetMs: 0 };
scope.__shiojiDebugClockV1 = runtime;
/** Opt-in test clock for this tab only; never changes the device clock. */
export function setDebugClockOffset(offsetMs: number): void {
  if (!Number.isSafeInteger(offsetMs) || offsetMs < 0 || runtime.realNow() + offsetMs > 8.64e15) throw new RangeError("Invalid debug clock offset");
  runtime.offsetMs = offsetMs;
  Date.now = offsetMs === 0 ? runtime.realNow : () => runtime.realNow() + runtime.offsetMs;
}
export function getDebugClockOffset(): number { return runtime.offsetMs; }
export function getUnshiftedRealTime(): number { return runtime.realNow(); }
export function restoreDebugClock(state: GameState): void {
  const clock = (state as DebugClockState).debugClock;
  if (clock === undefined) { setDebugClockOffset(0); return; }
  if (!clock || clock.version !== 1) throw new Error("Invalid saved debug clock");
  setDebugClockOffset(clock.offsetMs);
}

import type { AcceptedContract, Voyage } from "./types";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { ceilTo1Minute, formatDateTime } from "./time";

export interface VoyageDisplayClock {
  realTimeMs: number;
  operationTimeMs: number;
}
export interface VoyageTimePresentationInput {
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  clock: VoyageDisplayClock;
  unloadingDurationOperationMs: number | null;
}
type TimeBasis = "fixed-plan" | "existing-arrival-estimate" | "unloading-schedule";
export type VoyageTimePresentation =
  | { kind: "none" }
  | { kind: "unavailable"; label: "時刻情報"; value: "確認できません"; notice: string }
  | { kind: "time"; label: "到着予想時刻" | "荷役終了予定時刻"; value: string;
      basis: TimeBasis; realTimeMs: number; displayRealTimeMs: number;
      remainingLabel: "到着まで" | "荷役終了まで"; remainingRealMs: number; notice: string | null }
  | { kind: "ready"; label: "状態"; value: "精算可能" }
  | { kind: "completed"; label: "状態"; value: "完了" };

const MAX_DATE_MS = 8.64e15;
const validReal = (value: number) => Number.isFinite(value) && Math.abs(value) <= MAX_DATE_MS;
const validOperation = (value: number) => Number.isFinite(value) && value >= 0;
const unavailable = (notice: string): VoyageTimePresentation =>
  ({ kind: "unavailable", label: "時刻情報", value: "確認できません", notice });

/** Use a real/operation clock pair from the same state; never sample Date.now here. */
export function operationTimeToRealTime(target: number, clock: VoyageDisplayClock): number | null {
  if (!validReal(clock.realTimeMs) || !validOperation(clock.operationTimeMs) || !validOperation(target) ||
      !Number.isFinite(GAME_TIME_MULTIPLIER) || GAME_TIME_MULTIPLIER <= 0) return null;
  const result = clock.realTimeMs + (target - clock.operationTimeMs) / GAME_TIME_MULTIPLIER;
  return validReal(result) ? result : null;
}
function timeResult(
  label: "到着予想時刻" | "荷役終了予定時刻",
  remainingLabel: "到着まで" | "荷役終了まで", basis: TimeBasis,
  realTimeMs: number, clock: VoyageDisplayClock, notice: string | null,
): VoyageTimePresentation {
  if (!validReal(realTimeMs)) return unavailable("表示する予定時刻が不正です。");
  const displayRealTimeMs = ceilTo1Minute(realTimeMs);
  if (!validReal(displayRealTimeMs)) return unavailable("表示用の時刻を変換できません。");
  const remaining = realTimeMs - clock.realTimeMs;
  if (!Number.isFinite(remaining)) return unavailable("残り時間を変換できません。");
  return { kind: "time", label, value: formatDateTime(displayRealTimeMs), basis,
    realTimeMs, displayRealTimeMs, remainingLabel, remainingRealMs: Math.max(0, remaining), notice };
}

/** Read-only display adapter. Planned callers must also retain existing full plan validation. */
export function getVoyageTimePresentation(input: VoyageTimePresentationInput): VoyageTimePresentation {
  const { voyage, contract, clock, unloadingDurationOperationMs: duration } = input;
  if (voyage === null && contract === null) return { kind: "none" };
  if (voyage === null || contract === null || voyage.contractId !== contract.id)
    return unavailable("航海と契約の対応を確認できません。");
  if (!validReal(clock.realTimeMs) || !validOperation(clock.operationTimeMs))
    return unavailable("表示基準の時計を確認できません。");
  switch (voyage.phase) {
    case "loading":
    case "sailing": {
      if (voyage.settled) return unavailable("航海段階と精算状態が一致しません。");
      if (voyage.plannedNavigation !== undefined) {
        if (voyage.plannedNavigation === null) return unavailable("確定航路の進行状態を確認できません。");
        return timeResult("到着予想時刻", "到着まで", "fixed-plan", voyage.forecastEtaRealTime, clock,
          "現在は受注時の計画到着時刻を表示しています。風・積載減速を反映した現在の到着予測ではありません。");
      }
      const arrival = operationTimeToRealTime(voyage.estimatedArrivalAt, clock);
      if (arrival === null) return unavailable("到着予想時刻を変換できません。");
      return timeResult("到着予想時刻", "到着まで", "existing-arrival-estimate", arrival, clock,
        "既存方式による到着見込みです。幅のある予測はまだ反映していません。");
    }
    case "unloading": {
      if (voyage.settled) return unavailable("荷卸し段階と精算状態が一致しません。");
      const start = voyage.unloadingStartedAt;
      if (voyage.arrivedAt === null || !validOperation(voyage.arrivedAt) ||
          start === null || !validOperation(start) || start < voyage.arrivedAt ||
          duration === null || !Number.isFinite(duration) || duration < 0)
        return unavailable("荷卸し開始時刻または所要時間が不正です。");
      const end = start + duration;
      const realEnd = operationTimeToRealTime(end, clock);
      if (realEnd === null) return unavailable("荷役終了予定時刻を変換できません。");
      return timeResult("荷役終了予定時刻", "荷役終了まで", "unloading-schedule", realEnd, clock,
        end <= clock.operationTimeMs ? "終了予定時刻を過ぎています。航海状態の更新を確認中です。" : null);
    }
    case "completed":
      return voyage.settled ? { kind: "completed", label: "状態", value: "完了" }
        : { kind: "ready", label: "状態", value: "精算可能" };
    default:
      return unavailable("航海段階を確認できません。");
  }
}

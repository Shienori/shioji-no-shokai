import type { ContractTemplate, Ship } from "./types";
import { getRouteById } from "../data/routes";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { getCargoForContract } from "./lotContract";
import { getHeavyLoadSpeedFactor } from "./voyage";
import { isValidShipFuel } from "./coalFuel";
import { isValidContractWindForecast } from "./contractWindForecast";
import type { ContractWindForecastSnapshot } from "./contractWindForecast";
import { predictSavedWindVoyage } from "./windVoyagePrediction";
import type { WindVoyagePredictionInput, WindVoyagePrediction } from "./windVoyagePrediction";
import type { ForecastMapResult } from "./windForecastMap";
import { getRouteHexIds } from "./routePath";
import { ceilTo1Minute, formatDateTime } from "./time";

export type ContractWindPreview =
  | { kind: "unavailable"; message: string }
  | { kind: "ready"; previewAt: number; shipName: string; input: WindVoyagePredictionInput; prediction: WindVoyagePrediction };

/** One caller-owned forecast edition and loading-aware input, shared by every preview. Never saves or accepts. */
export function prepareContractWindPreview(contract: ContractTemplate, ship: Ship, speed: number, previewAt: number, snapshot: ContractWindForecastSnapshot | null): ContractWindPreview {
  const unavailable = (message: string): ContractWindPreview => ({ kind: "unavailable", message });
  if (ship.kind !== "powered" || !isValidShipFuel(ship.fuel)) return unavailable("対応する動力船の燃料情報がありません。");
  if (!Number.isSafeInteger(speed) || speed < ship.cruisingSpeedKnots || speed > ship.maxSpeedKnots) return unavailable("設定速力が船の指定範囲外です。");
  if (!Number.isSafeInteger(previewAt) || !isValidContractWindForecast(snapshot, contract.routeId, previewAt)) return unavailable("閲覧用の風予報を利用できません。旧方式のETAで代替しません。");
  try {
    const route = getRouteById(contract.routeId);
    const cargo = getCargoForContract(contract);
    const departureRealTime = previewAt + cargo.loadingTimeMsPerUnit * contract.quantity / GAME_TIME_MULTIPLIER;
    const input: WindVoyagePredictionInput = {
      route, snapshot, departureRealTime,
      state: { processedRealTime: departureRealTime, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: ship.fuel.remainingTons, totalFuelUsed: 0 },
      selectedSpeedKnots: speed, loadSpeedFactor: getHeavyLoadSpeedFactor(contract, ship),
      referenceFuelPerVoyageHour: ship.fuel.referenceConsumptionTonsPerVoyageHour, referenceSpeedKnots: ship.fuel.referenceSpeedKnots,
    };
    return { kind: "ready", previewAt, shipName: ship.name, input, prediction: predictSavedWindVoyage(input, previewAt) };
  } catch { return unavailable("貨物・航路・予報から数値予測を準備できません。実際の船や燃料は変更していません。"); }
}
export function formatContractPreviewEta(preview: ContractWindPreview | null): string {
  const eta = preview?.kind === "ready" ? preview.prediction.etaRealTime : null;
  return eta === null ? "予測不可" : formatDateTime(ceilTo1Minute(eta));
}
export function getContractPreviewMapPrediction(preview: ContractWindPreview, hours: number): ForecastMapResult {
  if (preview.kind === "unavailable") return preview;
  if (!Number.isFinite(hours) || hours < 0 || hours > 48) return { kind: "unavailable", message: "予報の指定時刻が不正です。" };
  try {
    return {
      kind: "ready", prediction: predictSavedWindVoyage(preview.input, preview.previewAt + hours * 3600000 / GAME_TIME_MULTIPLIER),
      snapshot: preview.input.snapshot, shipName: preview.shipName, baseRealTime: preview.previewAt,
      routeHexIds: getRouteHexIds(preview.input.route.fromPortId, preview.input.route.toPortId) ?? [],
    };
  } catch { return { kind: "unavailable", message: "指定時刻の予測を計算できません。" }; }
}

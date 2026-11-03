import type { AcceptedContract, Ship, Voyage } from "./types";
import { getRouteById } from "../data/routes";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { isValidShipFuel } from "./coalFuel";
import { SHIP_PERFORMANCE_MODEL_VERSION } from "./shipPerformance";
import { WIND_MODEL_VERSION } from "./windTimeline";
import { getRouteHexIds } from "./routePath";
import { getRouteWindLegs } from "./routeWind";
import { predictSavedWindVoyage } from "./windVoyagePrediction";
import type { WindVoyagePrediction } from "./windVoyagePrediction";
import type { ContractWindForecastSnapshot } from "./contractWindForecast";

export type ForecastMapResult =
  | { kind: "unavailable"; message: string }
  | { kind: "ready"; prediction: WindVoyagePrediction; snapshot: ContractWindForecastSnapshot | null; routeHexIds: string[]; shipName: string; baseRealTime: number };

/** Read-only UI adapter. Future selection never advances or persists the real voyage. */
export function getWindForecastMapPrediction(
  ships: readonly Ship[], voyage: Voyage | null, contract: AcceptedContract | null,
  currentRealTime: number, offsetVoyageHours: number,
): ForecastMapResult {
  const unavailable = (message: string): ForecastMapResult => ({ kind: "unavailable", message });
  if (!Number.isFinite(currentRealTime) || !Number.isFinite(offsetVoyageHours) || offsetVoyageHours < 0 || offsetVoyageHours > 48) return unavailable("予報の指定時刻が不正です。");
  if (!voyage || !contract) return unavailable("受注後、積込中または航行中の航海を予測できます。");
  const ship = ships.find(item => item.id === voyage.shipId);
  if (!ship || voyage.contractId !== contract.id || ship.activeContractId !== contract.id) return unavailable("船と受注・航海の対応を確認できません。");
  if (voyage.phase !== "loading" && voyage.phase !== "sailing") return unavailable("この航海は到着済みです。現在の位置は「現在」海図で確認できます。");
  const nav = voyage.fuelNavigation;
  if (!nav || ship.kind !== "powered") return unavailable("この航海は旧方式または帆船のため、今回の数値風予測の対象外です。");
  if (nav.modelVersion !== "coal-fuel-v1" || nav.shipPerformanceModelVersion !== SHIP_PERFORMANCE_MODEL_VERSION || nav.windModelVersion !== WIND_MODEL_VERSION || !isValidShipFuel(ship.fuel) || nav.fuelType !== ship.fuel.fuelType) return unavailable("対応する航行モデル・燃料情報がありません。");
  try {
    const route = getRouteById(contract.routeId);
    const legs = getRouteWindLegs(route);
    if (JSON.stringify(legs) !== JSON.stringify(nav.routeLegs)) return unavailable("保存航路と現在の航路が一致しません。");
    const processedRealTime = Math.max(voyage.lastProcessedRealTime, voyage.departedRealTime);
    const baseRealTime = voyage.phase === "sailing" ? Math.max(currentRealTime, processedRealTime) : currentRealTime;
    const snapshot = contract.windForecastSnapshotIssue === "invalid" ? null : contract.windForecastSnapshot ?? null;
    const prediction = predictSavedWindVoyage({
      route, snapshot, departureRealTime: voyage.departedRealTime,
      state: { processedRealTime, legIndex: voyage.currentSeaHexIndex, distanceIntoLegNm: voyage.distanceIntoHexNm, fuelRemaining: ship.fuel.remainingTons, totalFuelUsed: nav.fuelConsumedTons },
      selectedSpeedKnots: nav.selectedSpeedKnots, loadSpeedFactor: nav.loadSpeedFactor,
      referenceFuelPerVoyageHour: nav.referenceConsumptionTonsPerVoyageHour, referenceSpeedKnots: nav.referenceSpeedKnots,
    }, baseRealTime + offsetVoyageHours * 3600000 / GAME_TIME_MULTIPLIER);
    return { kind: "ready", prediction, snapshot, routeHexIds: getRouteHexIds(route.fromPortId, route.toPortId) ?? [], shipName: ship.name, baseRealTime };
  } catch {
    return unavailable("保存された航海情報から予測を計算できません。現在の航海データは変更していません。");
  }
}

import { useMemo } from "react";
import type { Route, Ship } from "../../domain/types";
import { isValidShipFuel } from "../../domain/coalFuel";
import { createContractWindForecast } from "../../domain/contractWindForecast";
import { getRouteWindLegs } from "../../domain/routeWind";
import { estimateSavedWindArrival } from "../../domain/windNavigation";
import type { WindNavigationStatus } from "../../domain/windNavigation";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";

interface Props { route: Route; ship: Ship; departureAt: number; loadSpeedFactor: number; selectedSpeedKnots?: number; }
const labels: Record<WindNavigationStatus, string> = {
  arrived: "予報上は現在の石炭で到着可能", timeReached: "予報期間内に到着せず、ETA未確定",
  fuelDepleted: "予報上は石炭不足、ETA未確定", windUnavailable: "予報が不足しているためETA未確定",
};
function tons(value: number): string {
  return value > 0 && value < 0.01 ? "0.01t未満" : `${value.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}t`;
}

export function FuelTrialPanel({ route, ship, departureAt, loadSpeedFactor, selectedSpeedKnots }: Props) {
  const fuel = isValidShipFuel(ship.fuel) ? ship.fuel : null;
  const remainingTons = fuel?.remainingTons;
  const referenceRate = fuel?.referenceConsumptionTonsPerVoyageHour;
  const referenceSpeed = fuel?.referenceSpeedKnots;
  const selectedSpeed = selectedSpeedKnots ?? ship.cruisingSpeedKnots;
  const source = useMemo(() => {
    try {
      return { ok: true as const, legs: getRouteWindLegs(route), snapshot: createContractWindForecast(route, departureAt) };
    } catch { return { ok: false as const }; }
  }, [route, departureAt]);
  const prediction = useMemo(() => {
    if (!source.ok || remainingTons === undefined || referenceRate === undefined || referenceSpeed === undefined) return null;
    try {
      return { ok: true as const, result: estimateSavedWindArrival({
        legs: source.legs,
        state: { processedRealTime: departureAt, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: remainingTons, totalFuelUsed: 0 },
        selectedSpeedKnots: selectedSpeed, loadSpeedFactor,
        referenceFuelPerVoyageHour: referenceRate, referenceSpeedKnots: referenceSpeed,
      }, source.snapshot) };
    } catch { return { ok: false as const }; }
  }, [source, remainingTons, referenceRate, referenceSpeed, departureAt, selectedSpeed, loadSpeedFactor]);
  return <div style={{ borderTop: "1px solid #cbd5e1", marginTop: 14, paddingTop: 14 }}>
    <h4 style={{ margin: "0 0 8px" }}>数値風予報・石炭自動予測</h4>
    <p style={{ fontSize: 12, lineHeight: 1.6 }}>船に記録された石炭残量と基準消費量から自動予測します。予測表示だけでは石炭や所持金を変更しません。仮の100単位による試算は使用しません。</p>
    <div className="kv"><span>予測設定速力</span><span>{selectedSpeed}ノット</span></div>
    <div className="kv"><span>積載による速力倍率</span><span>{loadSpeedFactor}倍</span></div>
    {fuel ? <>
      <div className="kv"><span>現在の石炭残量</span><span>{tons(fuel.remainingTons)}</span></div>
      <div className="kv"><span>最大石炭搭載量</span><span>{tons(fuel.capacityTons)}</span></div>
      <div className="kv"><span>{fuel.referenceSpeedKnots}ノット時の基準消費</span><span>{tons(fuel.referenceConsumptionTonsPerVoyageHour)}／航海1時間</span></div>
    </> : <p role="alert">この船の燃料データが未設定または不正なため、石炭予測は利用できません。残量を自動補充して計算することはありません。</p>}
    <p style={{ fontSize: 12, lineHeight: 1.6 }}>この従来表示では、渡された試算開始時刻に即時出港する仮定で計算し、積込・荷卸時間は含めません。動力船の受注前表示は別の共通予測を使用し、積込後の出港時刻を反映します。実航行の燃料対応航海では、実際の風による燃料消費と、燃料切れ時の契約終了・出発港への無料復帰・燃料補充が実装されています。この欄の予測表示自体は船・燃料・所持金を変更しません。</p>
    {source.ok && <p style={{ fontSize: 12 }}>予報発行：{formatDateTime(source.snapshot.issuedAt)}（閲覧用。受注時の保存予報は受注時点で別に確定します）</p>}
    <div aria-live="polite" aria-atomic="true">
      {!fuel ? null : !source.ok ? <p>航路または予報を準備できませんでした。</p> :
        prediction && !prediction.ok ? <p>予測できません。航路や予報の範囲を確認してください。</p> :
        prediction?.ok ? <>
          <p>{labels[prediction.result.status]}</p>
          <div className="kv"><span>予測ETA（港到着）</span><span>{prediction.result.arrivalRealTime === null ? "未確定" : formatDateTime(ceilTo1Minute(prediction.result.arrivalRealTime))}</span></div>
          <div className="kv"><span>{prediction.result.status === "arrived" ? "到着までの予測消費" : "計算終了までの予測消費"}</span><span>{tons(prediction.result.state.totalFuelUsed)}</span></div>
          <div className="kv"><span>{prediction.result.status === "arrived" ? "到着時の予測残量" : "計算終了時の予測残量"}</span><span>{tons(prediction.result.state.fuelRemaining)}</span></div>
        </> : null}
    </div>
  </div>;
}

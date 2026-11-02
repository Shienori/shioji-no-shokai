import { useMemo } from "react";
import type { Route, Ship } from "../../domain/types";
import { createContractWindForecast } from "../../domain/contractWindForecast";
import { getRouteWindLegs } from "../../domain/routeWind";
import { estimateSavedWindArrival } from "../../domain/windNavigation";
import type { WindNavigationStatus } from "../../domain/windNavigation";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";

interface Props { route: Route; ship: Ship; departureAt: number; loadSpeedFactor: number; }
// UI trial assumptions only, shared by all ships; not actual ship fuel data.
const TRIAL_FUEL = 100;
const TRIAL_FUEL_PER_VOYAGE_HOUR = 1;
const labels: Record<WindNavigationStatus, string> = {
  arrived: "仮設定では到着可能", timeReached: "予報期間内に到着せず、ETA未確定",
  fuelDepleted: "仮設定では途中で燃料不足、ETA未確定", windUnavailable: "予報が不足しているためETA未確定",
};
const amount = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 4 });

export function FuelTrialPanel({ route, ship, departureAt, loadSpeedFactor }: Props) {
  const source = useMemo(() => {
    try {
      return { ok: true as const, legs: getRouteWindLegs(route), snapshot: createContractWindForecast(route, departureAt) };
    } catch { return { ok: false as const }; }
  }, [route, departureAt]);
  const prediction = useMemo(() => {
    if (!source.ok) return null;
    try {
      return { ok: true as const, result: estimateSavedWindArrival({
        legs: source.legs,
        state: { processedRealTime: departureAt, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: TRIAL_FUEL, totalFuelUsed: 0 },
        selectedSpeedKnots: ship.cruisingSpeedKnots, loadSpeedFactor,
        referenceFuelPerVoyageHour: TRIAL_FUEL_PER_VOYAGE_HOUR, referenceSpeedKnots: 6,
      }, source.snapshot) };
    } catch { return { ok: false as const }; }
  }, [source, departureAt, ship.cruisingSpeedKnots, loadSpeedFactor]);
  return <div style={{ borderTop: "1px solid #cbd5e1", marginTop: 14, paddingTop: 14 }}>
    <h4 style={{ margin: "0 0 8px" }}>数値風予報・燃料自動試算</h4>
    <p style={{ fontSize: 12, lineHeight: 1.6 }}>船を選ぶだけで自動試算します。正式な燃料設定が未実装のため、全船共通の仮設定を使います。船の実際の搭載量・残量ではなく、実燃料・所持金・受注条件・セーブには反映しません。</p>
    <div className="kv"><span>試算設定速力</span><span>{ship.cruisingSpeedKnots}ノット</span></div>
    <div className="kv"><span>積載による速力倍率</span><span>{amount(loadSpeedFactor)}倍</span></div>
    <div className="kv"><span>仮の搭載量（自動設定）</span><span>{TRIAL_FUEL}試算単位</span></div>
    <div className="kv"><span>6ノット時の仮消費量</span><span>{TRIAL_FUEL_PER_VOYAGE_HOUR}単位／航海1時間</span></div>
    <p style={{ fontSize: 12, lineHeight: 1.6 }}>現実の1時間ではなく、6倍速で進む航海時間1時間あたりの消費量です。船選択時刻に即時出港すると仮定し、積込・荷卸時間は含めません。既存の地図・受注確認のETAと実航行は旧方式のため、この試算と異なる場合があります。</p>
    {source.ok && <p style={{ fontSize: 12 }}>試算予報発行：{formatDateTime(source.snapshot.issuedAt)}（この試算用。受注時の保存予報とは別です）</p>}
    <div aria-live="polite" aria-atomic="true">
      {!source.ok ? <p>航路または予報を準備できませんでした。</p> :
        prediction && !prediction.ok ? <p>自動試算できません。航路や予報の範囲を確認してください。</p> :
        prediction?.ok ? <>
          <p>{labels[prediction.result.status]}</p>
          <div className="kv"><span>試算ETA（港到着）</span><span>{prediction.result.arrivalRealTime === null ? "未確定" : formatDateTime(ceilTo1Minute(prediction.result.arrivalRealTime))}</span></div>
          <div className="kv"><span>{prediction.result.status === "arrived" ? "到着までの仮消費量" : "計算終了までの仮消費量"}</span><span>{amount(prediction.result.state.totalFuelUsed)}試算単位</span></div>
          <div className="kv"><span>{prediction.result.status === "arrived" ? "到着時の仮残量" : "計算終了時の仮残量"}</span><span>{amount(prediction.result.state.fuelRemaining)}試算単位</span></div>
        </> : null}
    </div>
  </div>;
}

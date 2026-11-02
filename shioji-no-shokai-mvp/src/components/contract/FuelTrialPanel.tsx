import { useId, useMemo, useState } from "react";
import type { Route, Ship } from "../../domain/types";
import { createContractWindForecast } from "../../domain/contractWindForecast";
import { getRouteWindLegs } from "../../domain/routeWind";
import { estimateSavedWindArrival } from "../../domain/windNavigation";
import type { WindNavigationStatus } from "../../domain/windNavigation";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";

interface Props { route: Route; ship: Ship; departureAt: number; loadSpeedFactor: number; }
const labels: Record<WindNavigationStatus, string> = {
  arrived: "試算上は到着可能", timeReached: "予報期間内に到着せず、ETA未確定",
  fuelDepleted: "途中で燃料不足、ETA未確定", windUnavailable: "予報が不足しているためETA未確定",
};
function parseAmount(value: string): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
const amount = (value: number) => value.toLocaleString("ja-JP", { maximumFractionDigits: 4 });

export function FuelTrialPanel({ route, ship, departureAt, loadSpeedFactor }: Props) {
  const id = useId();
  const [fuelText, setFuelText] = useState("");
  const [rateText, setRateText] = useState("");
  const source = useMemo(() => {
    try {
      return { ok: true as const, legs: getRouteWindLegs(route), snapshot: createContractWindForecast(route, departureAt) };
    } catch { return { ok: false as const }; }
  }, [route, departureAt]);
  const fuel = parseAmount(fuelText);
  const rate = parseAmount(rateText);
  const prediction = useMemo(() => {
    if (!source.ok || fuel === null || rate === null || rate <= 0) return null;
    try {
      return { ok: true as const, result: estimateSavedWindArrival({
        legs: source.legs,
        state: { processedRealTime: departureAt, legIndex: 0, distanceIntoLegNm: 0, fuelRemaining: fuel, totalFuelUsed: 0 },
        selectedSpeedKnots: ship.cruisingSpeedKnots, loadSpeedFactor, referenceFuelPerVoyageHour: rate, referenceSpeedKnots: 6,
      }, source.snapshot) };
    } catch { return { ok: false as const }; }
  }, [source, fuel, rate, departureAt, ship.cruisingSpeedKnots, loadSpeedFactor]);
  return <div style={{ borderTop: "1px solid #cbd5e1", marginTop: 14, paddingTop: 14 }}>
    <h4 style={{ margin: "0 0 8px" }}>数値風予報・燃料試算</h4>
    <p style={{ fontSize: 12, lineHeight: 1.6 }}>入力は試算専用です。実際の燃料・所持金・受注条件には反映せず、保存もしません。既存の地図・受注確認のETAと実航行は旧方式のため、この試算と異なる場合があります。</p>
    <div className="kv"><span>試算設定速力</span><span>{ship.cruisingSpeedKnots}ノット</span></div>
    <div className="kv"><span>積載による速力倍率</span><span>{amount(loadSpeedFactor)}倍</span></div>
    <div style={{ display: "grid", gap: 10, margin: "12px 0" }}>
      <label htmlFor={`${id}-fuel`}>試算用の搭載燃料量（任意の共通単位）
        <input id={`${id}-fuel`} type="number" inputMode="decimal" min="0" step="any" value={fuelText} onChange={event => setFuelText(event.target.value)} placeholder="0以上の数値" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 4 }} />
      </label>
      <label htmlFor={`${id}-rate`}>6ノット時の消費量（同じ単位／航海1時間）
        <input id={`${id}-rate`} type="number" inputMode="decimal" min="0" step="any" value={rateText} onChange={event => setRateText(event.target.value)} placeholder="0より大きい数値" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 4 }} />
      </label>
    </div>
    <p style={{ fontSize: 12, lineHeight: 1.6 }}>現実の1時間ではなく、6倍速で進む航海時間1時間あたりの消費量です。船選択時刻に即時出港すると仮定し、積込・荷卸時間は含めません。</p>
    {source.ok && <p style={{ fontSize: 12 }}>試算予報発行：{formatDateTime(source.snapshot.issuedAt)}（この試算用。受注時の保存予報とは別です）</p>}
    <div aria-live="polite" aria-atomic="true">
      {!source.ok ? <p>航路または予報を準備できませんでした。</p> :
        fuel === null || rate === null || rate <= 0 ? <p>搭載量は0以上、毎時消費量は0より大きい有限の数値を入力してください。</p> :
        prediction && !prediction.ok ? <p>この入力条件では試算できません。入力値や予報の範囲を確認してください。</p> :
        prediction?.ok ? <>
          <p>{labels[prediction.result.status]}</p>
          <div className="kv"><span>試算ETA（港到着）</span><span>{prediction.result.arrivalRealTime === null ? "未確定" : formatDateTime(ceilTo1Minute(prediction.result.arrivalRealTime))}</span></div>
          <div className="kv"><span>{prediction.result.status === "arrived" ? "到着までの試算消費量" : "計算終了までの試算消費量"}</span><span>{amount(prediction.result.state.totalFuelUsed)}</span></div>
          <div className="kv"><span>{prediction.result.status === "arrived" ? "到着時の試算残量" : "計算終了時の試算残量"}</span><span>{amount(prediction.result.state.fuelRemaining)}</span></div>
        </> : null}
    </div>
  </div>;
}

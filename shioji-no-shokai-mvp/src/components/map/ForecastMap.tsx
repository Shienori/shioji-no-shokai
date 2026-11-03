import { useMemo, useState } from "react";
import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import type { PredictionIssue, PredictedPositionStatus } from "../../domain/windVoyagePrediction";
import { getWindForecastMapPrediction } from "../../domain/windForecastMap";
import { getSavedWindForecastAt } from "../../domain/contractWindForecast";
import { hexMap } from "../../data/hexMap";
import { worldMap } from "../../data/worldMap";
import { HexMap } from "./HexMap";

interface Props { ships: Ship[]; voyage: Voyage | null; contract: AcceptedContract | null; currentRealTime: number; }
const SIZE = 26;
const center = ({ q, r }: { q: number; r: number }) => ({ x: Math.sqrt(3) * SIZE * (q + r / 2), y: -1.5 * SIZE * r });
const centers = worldMap.terrain.map(center);
const padding = SIZE + 48;
const minX = Math.min(...centers.map(p => p.x)) - padding;
const minY = Math.min(...centers.map(p => p.y)) - padding;
const viewBox = `${minX} ${minY} ${Math.max(...centers.map(p => p.x)) + padding - minX} ${Math.max(...centers.map(p => p.y)) + padding - minY}`;
const STATUS: Record<PredictedPositionStatus, string> = { notDeparted: "出港前", sailing: "航行予測", arrived: "到着予測", fuelDepleted: "燃料切れ予測（停止地点）", forecastUnavailable: "指定時刻の船位は予測できません" };
const ISSUE: Record<PredictionIssue, string> = { missingForecast: "保存予報がありません。", invalidForecast: "保存予報が不正です。", routeMismatch: "保存予報と航路が一致しません。", outsideForecast: "現在の航海位置は保存予報の対象期間外です。", forecastHorizon: "保存予報の期間内に到着を予測できません。", insufficientFuel: "到着までに燃料切れとなる予測です。", windUnavailable: "必要な時刻の保存予報がありません。" };
const formatTime = (time: number) => new Date(time).toLocaleString("ja-JP", { hour12: false });

export function ForecastMap({ ships, voyage, contract, currentRealTime }: Props) {
  const [hours, setHours] = useState(0);
  const [zoom, setZoom] = useState(1);
  const result = useMemo(() => getWindForecastMapPrediction(ships, voyage, contract, currentRealTime, hours), [ships, voyage, contract, currentRealTime, hours]);
  if (result.kind === "unavailable") return <p role="status">{result.message}</p>;
  const { prediction, snapshot } = result;
  const position = prediction.position ? center(prediction.position.axial) : null;
  const windMarkers = prediction.forecastIssuedAt === null || !snapshot ? [] : hexMap.flatMap(hex => {
    if (hex.kind !== "sea") return [];
    const slot = getSavedWindForecastAt(snapshot, hex.id, Math.floor(prediction.requestedRealTime));
    return slot ? [{ hex, wind: slot.forecastWind, point: center(hex) }] : [];
  });
  return <section aria-label="保存予報による航海予測">
    <p>受注時に保存した航路の風予報を使用します。予測の表示操作で実際の船・燃料・セーブは変わりません。</p>
    <label>現在からの航海時間：{hours.toFixed(2)}時間
      <input aria-label="予報の時間バー（航海時間）" type="range" min={0} max={48} step={0.25} value={hours} onChange={event => setHours(Number(event.target.value))} style={{ display: "block", width: "100%" }} />
    </label>
    <p>予測対象時刻：<time dateTime={new Date(prediction.requestedRealTime).toISOString()}>{formatTime(prediction.requestedRealTime)}</time>（実時間の時計）</p>
    <div role="group" aria-label="予報海図の倍率">
      <button type="button" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}>縮小</button>
      <output aria-label="予報海図の倍率">{Math.round(zoom * 100)}%</output>
      <button type="button" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.5))}>拡大</button>
      <button type="button" onClick={() => { setHours(0); setZoom(1); }}>現在時刻に戻す</button>
    </div>
    <div role="region" aria-label="予報海図。スクロールで移動できます" tabIndex={0} style={{ overflow: "auto", maxHeight: "65vh", borderRadius: 12 }}>
      <div style={{ width: 600 * zoom, position: "relative" }}>
        <HexMap ariaLabel="航路と実際の船の現在位置" ships={ships.map(ship => ({ name: `${ship.name}（現在）`, hexId: ship.currentHexId }))} routeHexIds={result.routeHexIds} />
        <svg viewBox={viewBox} role="img" aria-label={`${result.shipName}の予定船位と保存風予報`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          {windMarkers.map(({ hex, wind, point }) => <g key={hex.id} transform={`translate(${point.x} ${point.y})`}>
            <title>{hex.id}：風速{wind.speedMps.toFixed(1)}m/s、{wind.fromDeg === null ? "風向なし" : `風向${wind.fromDeg}度（吹いてくる方向）`}</title>
            {wind.fromDeg === null || wind.speedMps === 0 ? <circle r={4} fill="none" stroke="#2563eb" strokeWidth={2} /> : <path d="M 0 8 L 0 -8 M -4 -3 L 0 -8 L 4 -3" transform={`rotate(${(wind.fromDeg + 180) % 360})`} fill="none" stroke="#2563eb" strokeWidth={2} />}
          </g>)}
          {position && <g transform={`translate(${position.x} ${position.y})`}>
            <title>{result.shipName}：{STATUS[prediction.positionStatus]}</title>
            <circle r={10} fill="#fff" stroke="#7c3aed" strokeWidth={3} strokeDasharray="4 2" />
            <text y={-15} textAnchor="middle" fontSize={11} fill="#5b21b6" stroke="#fff" strokeWidth={3} paintOrder="stroke">予測：{result.shipName}</text>
          </g>}
        </svg>
      </div>
    </div>
    <p>紫の破線丸＝予定船位／船名（現在）＝実際の現在位置。青矢印は風が吹いていく方向、丸は無風です。拡大後は海図内をスクロールして移動できます。</p>
    <div role="status" aria-live="polite">
      <p>{STATUS[prediction.positionStatus]}</p>
      {prediction.forecastIssue && <p>{ISSUE[prediction.forecastIssue]}</p>}
      <dl>
        <dt>予測到着時刻（荷卸し前）</dt><dd>{prediction.etaRealTime === null ? "予測不可" : formatTime(prediction.etaRealTime)}</dd>
        <dt>指定時刻の航路進捗</dt><dd>{prediction.position === null ? "予測不可" : `${(prediction.position.routeProgress * 100).toFixed(1)}%`}</dd>
        <dt>指定時刻の予測残燃料</dt><dd>{prediction.position === null ? "予測不可" : `${prediction.checkpoint.fuelRemaining.toFixed(3)} t`}</dd>
        <dt>現在の計算開始点からの予測消費量</dt><dd>{prediction.remainingForecastFuelUse.toFixed(3)} t{prediction.etaRealTime === null ? "（予測可能な範囲まで。到着分の保証なし）" : "（到着まで）"}</dd>
        <dt>保存予報の発行時刻</dt><dd>{prediction.forecastIssuedAt === null ? "利用不可" : formatTime(prediction.forecastIssuedAt)}</dd>
      </dl>
    </div>
    <p>予定船位はHEX中心間を補間した表示です。実際の風による航行結果とは異なる場合があります。燃料切れの丸は予測上の停止地点であり、実際の帰港処理は実行しません。</p>
  </section>;
}

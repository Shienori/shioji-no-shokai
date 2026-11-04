import { useMemo, useState } from "react";
import type { Ship } from "../../domain/types";
import type { ConfirmedVoyageRoute } from "../../domain/voyagePlanTypes";
import type { VoyagePlanForecast } from "../../domain/voyagePlanForecast";
import { createVoyagePlanForecast } from "../../domain/voyagePlanForecast";
import { buildPlanTimeline, getPlanPosition, getPlanSectionForecast, evaluatePlanWeather,
  PLAN_DELAY_NOTICE, PLAN_FORECAST_MISSING_NOTICE, PLAN_NO_DELAY_NOTICE } from "../../domain/planWeather";
import { getNumericWindRows, NumericWindMarkers, NumericWindTable } from "./NumericWindDisplay";
import type { WindRows } from "./numericWindPresentation";
import { worldMap } from "../../data/worldMap";
import { getMapCenter, getMapViewBox } from "./mapGeometry";
import { HexMap } from "./HexMap";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";

interface Props {
  route: ConfirmedVoyageRoute; baseRealTime: number; departureRealTime: number; plannedEtaRealTime: number;
  selectedSpeedKnots: number; forecastCapturedAt: number; ships?: Ship[]; forecastOverride?: VoyagePlanForecast | null;
}
const format = (time: number) => formatDateTime(ceilTo1Minute(time));
const viewBox = getMapViewBox(worldMap.terrain.map(getMapCenter));
export function PlanWeatherChart({ route, baseRealTime, departureRealTime, plannedEtaRealTime, selectedSpeedKnots,
  forecastCapturedAt, ships = [], forecastOverride }: Props) {
  const [percent, setPercent] = useState(0);
  const [zoom, setZoom] = useState(1);
  const routeKey = JSON.stringify(route);
  const timeline = useMemo(() => {
    try {
      const value = buildPlanTimeline(route, baseRealTime, departureRealTime, selectedSpeedKnots);
      if (Math.abs(value.plannedEtaRealTime - plannedEtaRealTime) > 1e-3) return null;
      return value;
    } catch { return null; }
  }, [routeKey, baseRealTime, departureRealTime, selectedSpeedKnots, plannedEtaRealTime]);
  const forecast = useMemo(() => {
    if (forecastOverride !== undefined) return forecastOverride;
    try { return createVoyagePlanForecast(route, forecastCapturedAt); } catch { return null; }
  }, [routeKey, forecastCapturedAt, forecastOverride]);
  const assessment = useMemo(() => timeline ? evaluatePlanWeather(timeline, forecast) : null, [timeline, forecast]);
  if (!timeline || !assessment) return <p role="alert">編集航路の計画時刻を確認できません。別の航路や気象ETAで代用しません。</p>;
  const target = baseRealTime + (plannedEtaRealTime - baseRealTime) * percent / 100;
  const position = getPlanPosition(timeline, target);
  const order = [position.sectionIndex, ...route.sections.map((_, index) => index).filter(index => index !== position.sectionIndex)];
  const rows: WindRows = [];
  const seen = new Set<string>();
  for (const index of order) {
    const snapshot = getPlanSectionForecast(route, forecast, index);
    const sectionRows = new Map(getNumericWindRows(snapshot, route.sections[index].hexIds, target).map(row => [row.hexId, row]));
    for (const passage of timeline.passages.filter(item => item.sectionIndex === index)) {
      if (seen.has(passage.hexId)) continue;
      seen.add(passage.hexId);
      const row = sectionRows.get(passage.hexId);
      if (row) rows.push(row);
    }
  }
  const point = getMapCenter(position.axial);
  const path = route.sections.flatMap((section, index) => index === 0 ? [...section.hexIds] : section.hexIds.slice(1));
  return <section className="card detail-card" aria-label="編集航路の計画船位と予報" data-plan-eta={plannedEtaRealTime}>
    <h3>計画船位と海況予報</h3>
    <p>計画上の位置は、設定速力で風・積載減速なしに進む位置です。気象予測船位・実船位・到着保証ではありません。途中補油の待ち時間は0です。</p>
    <label>計画時間バー {percent.toFixed(1)}%
      <input aria-label="計画基準時刻から計画ETAまでの時間バー" type="range" min={0} max={100} step={0.1} value={percent}
        onChange={event => setPercent(Number(event.target.value))} style={{ display: "block", width: "100%" }} />
    </label>
    <p>選択時刻 {format(target)} ／ 計画ETA {format(plannedEtaRealTime)} ／ 計画区間 {position.sectionIndex + 1}/{route.sections.length}</p>
    <p>予報取得時刻 {format(forecastCapturedAt)} ／ 予報発行 {forecast?.sections[0] ? format(forecast.sections[0].issuedAt) : "取得不可"}。表示操作や速力変更だけでは予報版を更新しません。</p>
    <div role="group" aria-label="計画予報海図の倍率">
      <button type="button" disabled={zoom <= 1} onClick={() => setZoom(value => Math.max(1, value - 0.5))}>縮小</button>
      <output>{Math.round(zoom * 100)}%</output>
      <button type="button" disabled={zoom >= 3} onClick={() => setZoom(value => Math.min(3, value + 0.5))}>拡大</button>
      <button type="button" onClick={() => { setZoom(1); setPercent(0); }}>計画開始へ戻す</button>
    </div>
    <div style={{ overflow: "auto", maxHeight: "60vh" }}><div style={{ width: 600 * zoom, position: "relative" }}>
      <HexMap routeHexIds={path} ships={ships.map(ship => ({ name: `${ship.name}（実船位・参照時）`, hexId: ship.currentHexId }))} ariaLabel="編集した予定コースと参照時の実船位" />
      <svg viewBox={viewBox} role="img" aria-label="計画上の位置と選択時刻の予報風" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        <NumericWindMarkers rows={rows} />
        <g transform={`translate(${point.x} ${point.y})`} data-planned-hex={position.hexId}>
          <title>{`計画上の位置：区間${position.sectionIndex + 1}`}</title>
          <circle r={11} fill="white" stroke="#7c3aed" strokeWidth={3} strokeDasharray="4 2" />
          <text y={-25} textAnchor="middle" fontSize={11} fill="#5b21b6" stroke="white" strokeWidth={3} paintOrder="stroke">計画上の位置</text>
        </g>
      </svg>
    </div></div>
    <p>紫の破線丸＝計画上の位置。予報範囲外でも位置は表示します。同じHEXを再通過する場合、計画船位が属する区間の進行方向を優先して色分けします。</p>
    {rows.length < seen.size && <p role="status">選択時刻の一部または全HEXは予報なしです。別時刻の風や未来の実況で補いません。</p>}
    <NumericWindTable rows={rows} />
    <div role="status" aria-live="polite">
      <h4>航海全体の遅延注意</h4>
      {assessment.hasDelay && <p>{PLAN_DELAY_NOTICE}</p>}
      {assessment.hasMissing && <p>{PLAN_FORECAST_MISSING_NOTICE}</p>}
      {!assessment.hasDelay && !assessment.hasMissing && <p>{PLAN_NO_DELAY_NOTICE}。定刻到着を保証するものではありません。</p>}
      <p>各HEXの計画通過時間帯に重なる予報を評価し、風による速力倍率が0.95以下なら注意とします。上の時間バー1時点の風を航海全体に流用しません。加速区間との相殺・早着予告・遅延分数・気象補正ETAは計算しません。</p>
    </div>
    <p>燃料が不足する場合も船位は条件付きの計画位置です。表示操作では実航行・実燃料・保存データを変更しません。</p>
  </section>;
}

import type { Wind } from "../../domain/coastalWind";
import type { ContractWindForecastSnapshot } from "../../domain/contractWindForecast";
import { getSavedWindForecastAt } from "../../domain/contractWindForecast";
import { buildRouteWindLegs } from "../../domain/routeWind";
import { calculateWindSpeedFactor } from "../../domain/shipPerformance";
import { getHexById } from "../../data/hexMap";
import { worldMap } from "../../data/worldMap";
import { HexMap } from "./HexMap";

export const WIND_IMPACT_COLORS = { positive: "#15803d", negative: "#b91c1c", neutral: "#475569" } as const;
const DIRECTIONS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
export function describeNumericWind(wind: Wind, headingDeg: number, assessSpeed = true) {
  const factor = calculateWindSpeedFactor(headingDeg, wind);
  const delta = assessSpeed ? (factor - 1) * 100 : null;
  const effect = delta === null || Math.abs(delta) < 1e-12 ? "neutral" : delta > 0 ? "positive" : "negative";
  const directionShort = wind.fromDeg === null ? "風向なし" : DIRECTIONS[Math.round(wind.fromDeg / 45) % 8];
  const directionLabel = wind.fromDeg === null ? "風向なし" : `${directionShort}（${wind.fromDeg.toFixed(1)}°から）`;
  const speedLabel = wind.speedMps > 0 && wind.speedMps < 0.1 ? "0.1 m/s未満" : `${wind.speedMps.toFixed(1)} m/s`;
  const magnitude = delta === null ? 0 : Math.abs(delta);
  const deltaLabel = delta === null ? "補正未評価" : effect === "neutral" ? "±0.00%" : `${delta > 0 ? "＋" : "−"}${magnitude < 0.01 ? "0.01%未満" : `${magnitude.toFixed(2)}%`}`;
  return { directionShort, directionLabel, speedLabel, deltaLabel, effect, color: WIND_IMPACT_COLORS[effect], factor: assessSpeed ? factor : null };
}
export function getNumericWindRows(snapshot: ContractWindForecastSnapshot | null, routeHexIds: readonly string[], targetMs: number, assessSpeed = true) {
  if (!snapshot || routeHexIds.length < 3) return [];
  return buildRouteWindLegs(routeHexIds).flatMap(leg => {
    const slot = getSavedWindForecastAt(snapshot, leg.hexId, Math.floor(targetMs));
    if (!slot) return [];
    const hex = getHexById(leg.hexId);
    return [{ hexId: hex.id, axial: { q: hex.q, r: hex.r }, wind: slot.forecastWind, ...describeNumericWind(slot.forecastWind, leg.headingDeg, assessSpeed) }];
  });
}
type WindRows = ReturnType<typeof getNumericWindRows>;
const center = ({ q, r }: { q: number; r: number }) => ({ x: Math.sqrt(3) * 26 * (q + r / 2), y: -39 * r });
export function NumericWindMarkers({ rows }: { rows: WindRows }) {
  return <g>{rows.map(row => {
    const point = center(row.axial);
    return <g key={row.hexId} transform={`translate(${point.x} ${point.y})`}>
      <title>{`${row.hexId}：${row.directionLabel} ${row.speedLabel}／速力 ${row.deltaLabel}`}</title>
      <circle r={11} fill="#ffffff" fillOpacity={0.9} stroke={row.color} strokeWidth={1} />
      {row.wind.fromDeg === null ? <circle r={3} fill="none" stroke={row.color} strokeWidth={2} /> : <path d="M 0 7 L 0 -7 M -4 -2 L 0 -7 L 4 -2" transform={`rotate(${(row.wind.fromDeg + 180) % 360})`} fill="none" stroke={row.color} strokeWidth={2} />}
      <text y={-15} textAnchor="middle" fontSize={9} fill={row.color} stroke="#fff" strokeWidth={3} paintOrder="stroke">{row.directionShort}</text>
      <text y={21} textAnchor="middle" fontSize={9} fill={row.color} stroke="#fff" strokeWidth={3} paintOrder="stroke">{row.speedLabel}</text>
    </g>;
  })}</g>;
}
export function NumericWindTable({ rows }: { rows: WindRows }) {
  return <div style={{ overflowX: "auto" }}>
    <p>風向は吹いてくる方角、矢印は吹いていく方向です。緑＝速力＋、赤＝速力−、灰＝変化なし／補正未評価。補正は同じ積載量で風速0 m/sの場合との比較です。</p>
    {rows.length === 0 ? <p>この表示時刻の風予報はありません。</p> : <table aria-label="航路各HEXの予報風向・風速・速力補正" style={{ width: "100%" }}>
      <thead><tr><th scope="col">HEX</th><th scope="col">風向</th><th scope="col">風速</th><th scope="col">速力補正</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.hexId} style={{ color: row.color }}><th scope="row">{row.hexId}</th><td>{row.directionLabel}</td><td>{row.speedLabel}</td><td>{row.deltaLabel}</td></tr>)}</tbody>
    </table>}
  </div>;
}
const points = worldMap.terrain.map(center);
const padding = 74;
const minX = Math.min(...points.map(p => p.x)) - padding;
const minY = Math.min(...points.map(p => p.y)) - padding;
const viewBox = `${minX} ${minY} ${Math.max(...points.map(p => p.x)) + padding - minX} ${Math.max(...points.map(p => p.y)) + padding - minY}`;
export function NumericWindRouteMap({ rows, routeHexIds, ships, currentHexId }: { rows: WindRows; routeHexIds: string[]; ships: { name: string; hexId: string }[]; currentHexId?: string }) {
  return <div style={{ overflow: "auto", maxHeight: "65vh" }}><div style={{ width: 600, position: "relative" }}>
    <HexMap routeHexIds={routeHexIds} ships={ships} currentHexId={currentHexId} ariaLabel="数値風予報の航路海図" />
    <svg viewBox={viewBox} role="img" aria-label="予報風向と風速" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}><NumericWindMarkers rows={rows} /></svg>
  </div></div>;
}

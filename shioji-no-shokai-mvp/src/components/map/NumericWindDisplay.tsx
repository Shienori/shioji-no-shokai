import { worldMap } from "../../data/worldMap";
import { HexMap } from "./HexMap";
import type { WindRows } from "./numericWindPresentation";
import { getMapCenter as center, getMapViewBox } from "./mapGeometry";

export {
  WIND_IMPACT_COLORS,
  describeNumericWind,
  getNumericWindRows,
} from "./numericWindPresentation";

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
const viewBox = getMapViewBox(points);
export function NumericWindRouteMap({ rows, routeHexIds, ships, currentHexId }: { rows: WindRows; routeHexIds: string[]; ships: { name: string; hexId: string }[]; currentHexId?: string }) {
  return <div style={{ overflow: "auto", maxHeight: "65vh" }}><div style={{ width: 600, position: "relative" }}>
    <HexMap routeHexIds={routeHexIds} ships={ships} currentHexId={currentHexId} ariaLabel="数値風予報の航路海図" />
    <svg viewBox={viewBox} role="img" aria-label="予報風向と風速" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}><NumericWindMarkers rows={rows} /></svg>
  </div></div>;
}

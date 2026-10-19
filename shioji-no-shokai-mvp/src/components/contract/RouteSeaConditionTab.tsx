import { useMemo, useState } from "react";
import type { Ship } from "../../domain/types";
import { hexMap, getHexById } from "../../data/hexMap";
import type { MapHex, SeaCondition } from "../../domain/hexMap";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";
import { getRouteHexIds } from "../../domain/routePath";
import { calculateHexTransitHours, getPredictedShipPosition, getSeaConditionForecastAt, getVoyageTimeRange, getForecastIssueTime } from "../../domain/seaCondition";
import { formatDateTime } from "../../domain/time";
interface RouteSeaConditionTabProps {
  routeId: string; fromPortId: string; toPortId: string; selectedShip: Ship | null;
  departureAt: number; estimatedArrivalAt: number | null; etaLabel: string;
}
const HEX_SIZE = 22;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const CONDITION_COLORS: Record<SeaCondition, string> = { calm: "#dbe7ef", followingWind: "#bbf7d0", headwind: "#fecaca" };
const CONDITION_LABELS: Record<SeaCondition, string> = { calm: "無風", followingWind: "追風", headwind: "向かい風" };
const CONDITION_ICONS: Record<SeaCondition, string> = { calm: "◌", followingWind: "➤", headwind: "⇦" };
function getHexCenter(hex: MapHex) { return { x: HEX_WIDTH * (hex.q + hex.r / 2), y: 33 * hex.r }; }
function getHexPoints(center: { x: number; y: number }) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = Math.PI / 180 * (60 * index - 30);
    return `${(center.x + HEX_SIZE * Math.cos(angle)).toFixed(2)},${(center.y + HEX_SIZE * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}
function getSeaLabel(hexId: string) {
  const match = hexId.match(/(\d+)$/);
  return match ? `S${match[1].padStart(2, "0")}` : hexId;
}
export function RouteSeaConditionTab(props: RouteSeaConditionTabProps) {
  const shipKey = props.selectedShip ? `${props.selectedShip.id}:${props.selectedShip.cruisingSpeedKnots}` : "none";
  return <ForecastTimeline key={`${props.routeId}:${props.fromPortId}:${props.toPortId}:${shipKey}:${props.departureAt}`} {...props} />;
}
function ForecastTimeline({ fromPortId, toPortId, selectedShip, departureAt, estimatedArrivalAt, etaLabel }: RouteSeaConditionTabProps) {
  const [selectedPercent, setSelectedPercent] = useState(0);
  const routeHexIds = useMemo(() => getRouteHexIds(fromPortId, toPortId) ?? [], [fromPortId, toPortId]);
  const routeHexIdSet = useMemo(() => new Set(routeHexIds), [routeHexIds]);
  const seaHexIds = useMemo(() => routeHexIds.filter((id) => getHexById(id).kind === "sea"), [routeHexIds]);
  const timeRange = getVoyageTimeRange(departureAt, estimatedArrivalAt);
  const selectedAt = timeRange.min + (timeRange.max - timeRange.min) * selectedPercent / 100;
  const overlayConditions = useMemo(() => {
    if (!selectedShip) return new Map(seaHexIds.map((id) => [id, getSeaConditionForecastAt(id, selectedAt)]));
    const conditions = new Map<string, SeaCondition>();
    let arrivalAt = departureAt;
    for (const id of seaHexIds) {
      const condition = getSeaConditionForecastAt(id, arrivalAt);
      conditions.set(id, condition);
      arrivalAt += calculateHexTransitHours(selectedShip.cruisingSpeedKnots, condition) * 3600000 / GAME_TIME_MULTIPLIER;
    }
    return conditions;
  }, [seaHexIds, departureAt, selectedAt, selectedShip]);
  const predictedPosition = useMemo(() => selectedShip && seaHexIds.length > 0 ? getPredictedShipPosition(routeHexIds, departureAt, selectedAt, selectedShip.cruisingSpeedKnots) : null, [routeHexIds, seaHexIds, departureAt, selectedAt, selectedShip]);
  const centers = hexMap.map((hex) => ({ hex, center: getHexCenter(hex) }));
  const padding = HEX_SIZE + 14;
  const minX = Math.min(...centers.map(({ center }) => center.x)) - padding;
  const maxX = Math.max(...centers.map(({ center }) => center.x)) + padding;
  const minY = Math.min(...centers.map(({ center }) => center.y)) - padding;
  const maxY = Math.max(...centers.map(({ center }) => center.y)) + padding;
  const focusHex = predictedPosition ? hexMap.find((hex) => hex.id === predictedPosition.hexId) : null;
  const focusCenter = focusHex ? getHexCenter(focusHex) : null;
  const viewBox = focusCenter ? `${focusCenter.x - 120} ${focusCenter.y - 100} 240 200` : `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  const routeCenters = routeHexIds.map((id) => hexMap.find((hex) => hex.id === id)).filter((hex): hex is MapHex => Boolean(hex)).map(getHexCenter);
  const currentCondition = predictedPosition ? overlayConditions.get(predictedPosition.hexId) : undefined;
  return <div className="card detail-card route-sea-condition-tab">
    <div className="route-sea-header">
      <span>予報発行：{formatDateTime(getForecastIssueTime(departureAt))}</span>
      <span>表示時刻：{formatDateTime(selectedAt)}</span>
    </div>
    <div className="hex-map route-sea-map"><svg viewBox={viewBox} role="img" aria-label="海況予報HEXマップ">
      {routeCenters.length > 1 && <polyline points={routeCenters.map((center) => `${center.x},${center.y}`).join(" ")} fill="none" stroke={selectedShip ? "#fb923c" : "#f4c95d"} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}
      {centers.map(({ hex, center }) => {
        const isPort = hex.kind === "port";
        const isRouteHex = routeHexIdSet.has(hex.id);
        const condition = overlayConditions.get(hex.id);
        const isShipHex = predictedPosition?.hexId === hex.id;
        const fill = isPort ? "#8fd3ff" : condition ? CONDITION_COLORS[condition] : "#dff1ff";
        const stroke = isShipHex ? "#c2410c" : isRouteHex ? selectedShip ? "#fb923c" : "#f4c95d" : isPort ? "#1f7fb8" : "#9db8c7";
        const strokeWidth = isShipHex ? 3 : isRouteHex ? selectedShip ? 3 : 2.5 : isPort ? 2 : 1;
        return <g key={hex.id}>
          <polygon points={getHexPoints(center)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
          <text x={center.x} y={center.y - 2} textAnchor="middle" fontSize={isPort ? 9 : 8} fontWeight={isPort ? 700 : 400} fill="#254b5c">{isPort ? hex.portId : getSeaLabel(hex.id)}</text>
          {condition && <text x={center.x} y={center.y + 10} textAnchor="middle" fontSize={9} fill="#254b5c">{CONDITION_ICONS[condition]}</text>}
          {isShipHex && <text x={center.x} y={center.y + 22} textAnchor="middle" fontSize={11} fontWeight={700} fill="#c2410c">⛵</text>}
        </g>;
      })}
    </svg></div>
    <div className="route-sea-legend" style={{ color: "#0f172a" }}>
      <span><span className="legend-swatch calm" /> 無風</span>
      <span><span className="legend-swatch followingWind" /> 追風</span>
      <span><span className="legend-swatch headwind" /> 向かい風</span>
      <span><span className="legend-swatch route" /> 予定航路</span>
    </div>
    <input className="route-sea-slider" style={{ width: "100%" }} type="range" min={0} max={100} step={0.1} value={selectedPercent} disabled={!selectedShip || seaHexIds.length === 0} onChange={(event) => setSelectedPercent(Number(event.target.value))} aria-label="海況予報の表示時刻" aria-valuetext={formatDateTime(selectedAt)} />
    <div className="route-sea-time-labels">
      <span>出発 {formatDateTime(departureAt)}</span>
      <span>{estimatedArrivalAt !== null ? `到着 ${etaLabel}` : "7日後"}</span>
    </div>
    {selectedShip ? <div className="route-sea-status">
      <div className="kv"><span>使用船</span><span>{selectedShip.name}</span></div>
      <div className="kv"><span>ETA</span><span>{etaLabel}</span></div>
      <div className="kv"><span>予定船位</span><span>{predictedPosition ? `${getSeaLabel(predictedPosition.hexId)}${predictedPosition.hasArrived ? "（到着済み）" : `（進捗 ${Math.round(predictedPosition.progress * 100)}%）`}` : "—"}</span></div>
      <div className="kv"><span>現在位置の海況</span><span>{currentCondition ? CONDITION_LABELS[currentCondition] : "—"}</span></div>
    </div> : <p className="route-sea-hint">船を選択すると、ETAと予定船位が表示されます。</p>}
  </div>;
}

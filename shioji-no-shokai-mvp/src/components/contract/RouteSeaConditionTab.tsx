import { useMemo, useState } from "react";
import type { Ship } from "../../domain/types";
import { getHexById } from "../../data/hexMap";
import type { SeaCondition } from "../../domain/hexMap";
import { HexMap } from "../map/HexMap";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";
import { getRouteHexIds } from "../../domain/routePath";
import { calculateHexTransitHours, getPredictedShipPosition, getSeaConditionForecastAt, getVoyageTimeRange, getForecastIssueTime } from "../../domain/seaCondition";
import { formatDateTime } from "../../domain/time";
interface RouteSeaConditionTabProps {
  routeId: string; fromPortId: string; toPortId: string; selectedShip: Ship | null;
  departureAt: number; estimatedArrivalAt: number | null; etaLabel: string;
}
const CONDITION_LABELS: Record<SeaCondition, string> = { calm: "無風", followingWind: "追風", headwind: "向かい風" };
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
  const currentCondition = predictedPosition ? overlayConditions.get(predictedPosition.hexId) : undefined;
  return <div className="card detail-card route-sea-condition-tab">
    <div className="route-sea-header">
      <span>予報発行：{formatDateTime(getForecastIssueTime(departureAt))}</span>
      <span>表示時刻：{formatDateTime(selectedAt)}</span>
    </div>
    <div className="route-sea-map">
      <HexMap routeHexIds={routeHexIds} conditions={overlayConditions} currentHexId={predictedPosition?.hexId} focusHexId={predictedPosition?.hexId} ships={selectedShip && predictedPosition ? [{ name: selectedShip.name, hexId: predictedPosition.hexId }] : []} ariaLabel="海況予報と予定船位の海図" />
    </div>
    <div className="route-sea-legend" style={{ color: "#0F172A" }}>
      <span>◌ 無風</span>
      <span>➤ 追風</span>
      <span>⇦ 向かい風</span>
      <span>線：予定航路</span>
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

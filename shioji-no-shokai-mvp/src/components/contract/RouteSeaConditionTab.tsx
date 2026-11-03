import { useMemo, useState } from "react";
import type { Ship } from "../../domain/types";
import { getRouteById } from "../../data/routes";
import { getHexById } from "../../data/hexMap";
import { getRouteHexIds } from "../../domain/routePath";
import { getPredictedShipPosition, getVoyageTimeRange } from "../../domain/seaCondition";
import { createContractWindForecast } from "../../domain/contractWindForecast";
import { getNumericWindRows, NumericWindRouteMap, NumericWindTable } from "../map/NumericWindDisplay";
import { formatDateTime } from "../../domain/time";
interface RouteSeaConditionTabProps {
  routeId: string; fromPortId: string; toPortId: string; selectedShip: Ship | null;
  departureAt: number; estimatedArrivalAt: number | null; etaLabel: string;
}
export function RouteSeaConditionTab(props: RouteSeaConditionTabProps) {
  const shipKey = props.selectedShip ? `${props.selectedShip.id}:${props.selectedShip.cruisingSpeedKnots}` : "none";
  return <ForecastTimeline key={`${props.routeId}:${props.fromPortId}:${props.toPortId}:${shipKey}:${props.departureAt}`} {...props} />;
}
function ForecastTimeline({ routeId, fromPortId, toPortId, selectedShip, departureAt, estimatedArrivalAt, etaLabel }: RouteSeaConditionTabProps) {
  const [selectedPercent, setSelectedPercent] = useState(0);
  const routeHexIds = useMemo(() => getRouteHexIds(fromPortId, toPortId) ?? [], [fromPortId, toPortId]);
  const seaHexIds = useMemo(() => routeHexIds.filter(id => getHexById(id).kind === "sea"), [routeHexIds]);
  const snapshot = useMemo(() => {
    try {
      const route = getRouteById(routeId);
      return route.fromPortId === fromPortId && route.toPortId === toPortId ? createContractWindForecast(route, departureAt) : null;
    } catch { return null; }
  }, [routeId, fromPortId, toPortId, departureAt]);
  const timeRange = getVoyageTimeRange(departureAt, estimatedArrivalAt);
  const selectedAt = timeRange.min + (timeRange.max - timeRange.min) * selectedPercent / 100;
  const rows = useMemo(() => getNumericWindRows(snapshot, routeHexIds, selectedAt, selectedShip?.kind === "powered"), [snapshot, routeHexIds, selectedAt, selectedShip?.kind]);
  const predictedPosition = useMemo(() => selectedShip?.kind === "sailing" && seaHexIds.length > 0 ? getPredictedShipPosition(routeHexIds, departureAt, selectedAt, selectedShip.cruisingSpeedKnots) : null, [routeHexIds, seaHexIds, departureAt, selectedAt, selectedShip]);
  return <div className="card detail-card route-sea-condition-tab">
    <div className="route-sea-header">
      <span>予報発行：{snapshot ? formatDateTime(snapshot.issuedAt) : "利用不可"}</span>
      <span>表示時刻：{formatDateTime(selectedAt)}</span>
    </div>
    <div className="route-sea-map"><NumericWindRouteMap rows={rows} routeHexIds={routeHexIds} currentHexId={predictedPosition?.hexId} ships={selectedShip && predictedPosition ? [{ name: selectedShip.name, hexId: predictedPosition.hexId }] : []} /></div>
    <NumericWindTable rows={rows} />
    <input className="route-sea-slider" style={{ width: "100%" }} type="range" min={0} max={100} step={0.1} value={selectedPercent} disabled={!snapshot || seaHexIds.length === 0} onChange={event => setSelectedPercent(Number(event.target.value))} aria-label="海況予報の表示時刻" aria-valuetext={formatDateTime(selectedAt)} />
    <div className="route-sea-time-labels"><span>基準 {formatDateTime(departureAt)}</span><span>{estimatedArrivalAt !== null ? `到着 ${etaLabel}` : "7日後"}</span></div>
    {selectedShip ? <div className="route-sea-status">
      <div className="kv"><span>使用船</span><span>{selectedShip.name}</span></div>
      <div className="kv"><span>ETA</span><span>{etaLabel}</span></div>
      <div className="kv"><span>予定船位</span><span>{predictedPosition ? `${predictedPosition.hexId}${predictedPosition.hasArrived ? "（到着済み）" : `（進捗 ${Math.round(predictedPosition.progress * 100)}%）`}` : "—"}</span></div>
      {selectedShip.kind === "sailing" && <p>帆船のETA・予定船位は旧方式です。風向・風速は数値予報ですが、動力船用の速力補正色は適用しません。</p>}
    </div> : <p className="route-sea-hint">船未選択のため速力補正は未評価です。船を選択するとETAと予定船位が表示されます。</p>}
  </div>;
}

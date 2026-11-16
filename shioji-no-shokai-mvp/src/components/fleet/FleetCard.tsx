import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoPresentation } from "../../domain/cargoPresentation";
import { getHexById } from "../../data/hexMap";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import { getSeaConditionAt } from "../../domain/seaCondition";

interface FleetCardProps {
  ship: Ship;
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  operationTime: number;
  onSelectShip: (shipId: string) => void;
  onOpenSettlement: () => void;
}

function getSeaLabel(hexId: string) {
  const match = hexId.match(/(\d+)$/);
  return match ? `S${match[1].padStart(2, "0")}` : hexId;
}

const CONDITION_LABELS = {
  calm: "無風",
  followingWind: "追風",
  headwind: "向かい風",
} as const;

const STATUS_LABELS = {
  docked: "待機中",
  loading: "積込中",
  sailing: "航海中",
  unloading: "揚荷中",
} as const;

export function FleetCard({
  ship,
  voyage,
  contract,
  operationTime,
  onSelectShip,
  onOpenSettlement,
}: FleetCardProps) {
  const route = contract ? getRouteById(contract.routeId) : null;
  const cargo = contract ? getCargoPresentation(contract) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const progress = voyage && contract
    ? calculateVoyageProgress(voyage, contract, operationTime)
    : 0;
  const currentHexData = getHexById(ship.currentHexId);
  const currentLocation = currentHexData.kind === "port"
    ? getPortById(currentHexData.portId!).name
    : `海域 ${getSeaLabel(currentHexData.id)}`;
  const currentCondition = voyage?.phase === "sailing" && currentHexData.kind === "sea"
    ? getSeaConditionAt(ship.currentHexId, Date.now())
    : null;
  const contractLabel = contract
    ? cargo && fromPort && toPort
      ? `${cargo.label}／${fromPort.name}→${toPort.name}`
      : "貨物データ確認不可"
    : "なし";
  const canSettle = voyage?.phase === "completed" && !voyage.settled;
  const hasArrived = voyage?.phase === "completed";
  const remainingOperationMs = voyage
    ? Math.max(0, voyage.estimatedArrivalAt - operationTime)
    : 0;
  const remainingMs = remainingOperationMs / 6;
  const estimatedArrivalLabel = voyage?.phase === "sailing"
    ? formatDateTime(ceilTo1Minute(Date.now() + remainingMs))
    : "-";
  const deadlineLabel = contract ? formatDateTime(contract.deadlineAt) : "-";
  const fuel = ship.fuel;
  const fuelPercent = fuel && fuel.capacityTons > 0
    ? Math.max(0, Math.min(100, Math.round((fuel.remainingTons / fuel.capacityTons) * 100)))
    : null;
  const progressPercent = Math.round(progress * 100);

  return (
    <article className={`fleet-card fleet-card--${ship.status}`}>
      <div className="fleet-card-heading">
        <h3 className="fleet-card-name">{ship.name}</h3>
        <span className={`fleet-status fleet-status--${ship.status}`}>
          {STATUS_LABELS[ship.status]}
        </span>
        {canSettle && <span className="fleet-badge fleet-badge--settlement">精算可能</span>}
        {!canSettle && hasArrived && <span className="fleet-badge fleet-badge--arrival">到着</span>}
      </div>

      <div className="fleet-card-route">
        <span className="fleet-route-label">現在位置</span>
        <span className="fleet-route-value">{currentLocation}</span>
      </div>

      <div className="fleet-card-route">
        <span className="fleet-route-label">海況</span>
        <span className="fleet-route-value">
          {currentCondition ? CONDITION_LABELS[currentCondition] : "-"}
        </span>
      </div>

      <div className="fleet-card-route">
        <span className="fleet-route-label">受注依頼</span>
        <span className="fleet-route-value">{contractLabel}</span>
      </div>

      {contract && (
        <div className="fleet-facts">
          <div>
            <span className="fleet-fact-label">貨物重量</span>
            <span className="fleet-fact-value">{cargo?.weightLabel ?? "確認不可"}</span>
          </div>
          <div>
            <span className="fleet-fact-label">貨物容積</span>
            <span className="fleet-fact-value">{cargo?.volumeLabel ?? "確認不可"}</span>
          </div>
        </div>
      )}

      <div className="fleet-facts">
        <div>
          <span className="fleet-fact-label">重量上限</span>
          <span className="fleet-fact-value">{ship.maxCargoWeight} t</span>
        </div>
        <div>
          <span className="fleet-fact-label">容積上限</span>
          <span className="fleet-fact-value">{ship.maxCargoVolume} m³</span>
        </div>
      </div>

      {voyage && contract && (
        <div className="fleet-progress">
          <div className="fleet-progress-heading">
            <span>進捗状況</span>
            <span>{progressPercent}%</span>
          </div>
          <div aria-hidden="true" className="fleet-progress-track">
            <div className="fleet-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {fuel && fuelPercent !== null && (
        <div className="fleet-fuel">
          <div className="fleet-progress-heading">
            <span>燃料</span>
            <span>{fuelPercent}%</span>
          </div>
          <div aria-hidden="true" className="fleet-progress-track fleet-progress-track--fuel">
            <div
              className={`fleet-progress-fill fleet-progress-fill--fuel${fuelPercent <= 20 ? " fleet-progress-fill--warning" : ""}`}
              style={{ width: `${fuelPercent}%` }}
            />
          </div>
        </div>
      )}

      <div className="fleet-facts">
        <div>
          <span className="fleet-fact-label">ETA</span>
          <span className="fleet-fact-value">{contract ? estimatedArrivalLabel : "-"}</span>
        </div>
        <div>
          <span className="fleet-fact-label">期限</span>
          <span className="fleet-fact-value">{contract ? deadlineLabel : "-"}</span>
        </div>
      </div>

      <div className="fleet-card-actions">
        {canSettle && (
          <button className="btn btn-primary fleet-settle-button" type="button" onClick={onOpenSettlement}>
            精算する
          </button>
        )}
        <button className="ship-detail-button" type="button" onClick={() => onSelectShip(ship.id)}>
          詳細
        </button>
      </div>
    </article>
  );
}

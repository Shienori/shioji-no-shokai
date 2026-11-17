import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoPresentation } from "../../domain/cargoPresentation";
import { getHexById } from "../../data/hexMap";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import { getSeaConditionAt } from "../../domain/seaCondition";
import { getPlannedShipPresentation } from "../../domain/plannedShipPresentation";
import type { VoyageDisplayClock } from "../../domain/voyageTimePresentation";
import "./FleetCard.css";

interface FleetCardProps {
  ship: Ship;
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  operationTime: number;
  displayClock: VoyageDisplayClock;
  onSelectShip: (shipId: string) => void;
  onOpenSettlement: () => void;
}

function getSeaLabel(hexId: string) {
  const match = hexId.match(/(\d+)$/);
  return match ? `S${match[1].padStart(2, "0")}` : hexId;
}

const STATUS_LABELS = {
  docked: "待機中",
  loading: "積込中",
  sailing: "航海中",
  unloading: "揚荷中",
  completed: "精算待ち",
} as const;

export function FleetCard({
  ship,
  voyage,
  contract,
  operationTime,
  displayClock,
  onSelectShip,
  onOpenSettlement,
}: FleetCardProps) {
  const isPlanned = voyage?.plannedNavigation !== undefined;
  const route = contract ? getRouteById(contract.routeId) : null;
  const cargo = contract ? getCargoPresentation(contract) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const canSettle = voyage?.phase === "completed" && !voyage.settled;
  const hasArrived = voyage?.phase === "completed";

  let statusLabel = voyage ? STATUS_LABELS[voyage.phase] : STATUS_LABELS[ship.status];
  let progress = 0;
  let currentLocation = "";
  let routeLabel = "-";
  let etaLabel = "-";
  let fuelWarning = false;

  if (isPlanned && voyage && contract) {
    try {
      const model = getPlannedShipPresentation(ship, voyage, contract);
      progress = model.progress;
      const hex = getHexById(model.currentHexId);
      currentLocation = hex.kind === "port"
        ? getPortById(hex.portId!).name
        : `海域 ${hex.id}`;
      const from = getPortById(model.sections[0].fromPortId).name;
      const to = getPortById(model.sections[model.sections.length - 1].toPortId).name;
      routeLabel = `${from} → ${to}`;
      etaLabel = formatDateTime(ceilTo1Minute(model.plannedEtaRealTime));
      fuelWarning = model.fuelRemainingTons <= (ship.fuel?.capacityTons ?? 0) * 0.2;
    } catch {
      statusLabel = "確認不可";
    }
  } else {
    progress = voyage && contract
      ? calculateVoyageProgress(voyage, contract, operationTime)
      : 0;
    const hex = getHexById(ship.currentHexId);
    currentLocation = hex.kind === "port"
      ? getPortById(hex.portId!).name
      : `海域 ${getSeaLabel(hex.id)}`;
    routeLabel = contract && fromPort && toPort
      ? `${fromPort.name} → ${toPort.name}`
      : "-";
    const remainingOperationMs = voyage
      ? Math.max(0, voyage.estimatedArrivalAt - operationTime)
      : 0;
    const remainingMs = remainingOperationMs / 6;
    etaLabel = voyage?.phase === "sailing"
      ? formatDateTime(ceilTo1Minute(Date.now() + remainingMs))
      : "-";
    const fuel = ship.fuel;
    fuelWarning = Boolean(fuel && fuel.capacityTons > 0 && fuel.remainingTons <= fuel.capacityTons * 0.2);
  }

  const progressPercent = Math.round(progress * 100);

  return (
    <article className={`contract-card fleet-card fleet-card--${ship.status}`}>
      <div className="contract-card-heading">
        <h3>{ship.name}</h3>
        <span className="contract-card-detail">{statusLabel}</span>
        {canSettle && <span className="fleet-badge fleet-badge--settlement">精算可能</span>}
        {!canSettle && hasArrived && <span className="fleet-badge fleet-badge--arrival">到着</span>}
        {fuelWarning && <span className="fleet-badge fleet-badge--warning">燃料少</span>}
      </div>

      <div className="contract-card-route">
        <span>{routeLabel}</span>
      </div>

      <div className="contract-card-route">
        <span>現在位置</span>
        <span className="contract-route-arrow">→</span>
        <span>{currentLocation}</span>
      </div>

      <div className="progress-block">
        <div className="progress-heading">
          <span>進捗</span>
          <span>{progressPercent}%</span>
        </div>
        <div className="progress">
          <div style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="contract-card-route">
        <span>到着予想</span>
        <span className="contract-route-arrow">→</span>
        <span>{etaLabel}</span>
      </div>

      <div className="fleet-card-actions">
        {canSettle && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={onOpenSettlement}
          >
            精算する
          </button>
        )}
        <button
          className="ship-detail-button"
          type="button"
          onClick={() => onSelectShip(ship.id)}
        >
          詳細
        </button>
      </div>
    </article>
  );
}

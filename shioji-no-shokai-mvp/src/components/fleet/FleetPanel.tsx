import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { getHexById } from "../../data/hexMap";
import { formatDateTime } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import { getSeaConditionAt } from "../../domain/seaCondition";

interface FleetPanelProps {
  ships: Ship[];
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  operationTime: number;
  onSelectShip: (shipId: string) => void;
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
  docked: "停泊中",
  loading: "積込中",
  sailing: "航海中",
  unloading: "揚荷中",
} as const;

export function FleetPanel({ ships, voyage, contract, operationTime, onSelectShip }: FleetPanelProps) {
  const route = contract ? getRouteById(contract.routeId) : null;
  const cargo = contract ? getCargoById(contract.cargoId) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const remainingOperationMs = voyage ? Math.max(0, voyage.estimatedArrivalAt - operationTime) : 0;
  const remainingMs = remainingOperationMs / 6;
  const estimatedArrivalLabel = voyage?.phase === "sailing"
    ? formatDateTime(Date.now() + remainingMs)
    : "-";
  const deadlineLabel = contract ? formatDateTime(contract.deadlineAt) : "-";

  return (
    <section className="contract-board fleet-board">
      <header className="contract-board-header">
        <div>
          <h2>Fleet</h2>
          <p className="contract-board-subtitle">所属船団の状況</p>
        </div>
        <span className="contract-count">{ships.length}隻</span>
      </header>

      <div className="contract-list">
        {ships.map((ship) => {
          const shipVoyage = voyage?.shipId === ship.id ? voyage : null;
          const shipContract = shipVoyage ? contract : null;
          const progress = shipVoyage && shipContract
            ? calculateVoyageProgress(shipVoyage, shipContract, operationTime)
            : 0;
          const currentHexData = getHexById(ship.currentHexId);
          const currentLocation = currentHexData.kind === "port"
            ? getPortById(currentHexData.portId!).name
            : `海域 ${getSeaLabel(currentHexData.id)}`;
          const currentCondition = shipVoyage?.phase === "sailing" && currentHexData.kind === "sea"
            ? getSeaConditionAt(ship.currentHexId, Date.now())
            : null;
          const contractLabel = shipContract && cargo && fromPort && toPort
            ? `${cargo.name} ×${shipContract.quantity}／${fromPort.name}→${toPort.name}`
            : "なし";

          return (
            <div key={ship.id} className="contract-card fleet-card">
              <div className="contract-card-heading">
                <h3>{ship.name}</h3>
                <span className="contract-card-detail">{STATUS_LABELS[ship.status]}</span>
              </div>

              <div className="contract-card-route">
                <span>現在位置</span>
                <span className="contract-route-arrow">→</span>
                <span>{currentLocation}</span>
              </div>

              <div className="contract-card-route">
                <span>海況</span>
                <span className="contract-route-arrow">→</span>
                <span>{currentCondition ? CONDITION_LABELS[currentCondition] : "-"}</span>
              </div>

              <div className="contract-card-route">
                <span>受注依頼</span>
                <span className="contract-route-arrow">→</span>
                <span>{contractLabel}</span>
              </div>

              <div className="progress-block">
                <div className="progress-heading">
                  <span>進捗状況</span>
                  <span>{Math.round(progress * 100)}%</span>
                </div>
                <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              </div>

              <div className="contract-facts">
                <div>
                  <span className="contract-fact-label">ETA</span>
                  <span className="contract-fact-value">{estimatedArrivalLabel}</span>
                </div>
                <div>
                  <span className="contract-fact-label">期限</span>
                  <span className="contract-fact-value">{deadlineLabel}</span>
                </div>
              </div>

              <button
                className="ship-detail-button"
                type="button"
                onClick={() => onSelectShip(ship.id)}
              >
                詳細
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

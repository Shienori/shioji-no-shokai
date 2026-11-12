import { useState } from "react";
import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoPresentation, getLotCapacityForDisplay, formatCargoMeasure } from "../../domain/cargoPresentation";
import { getHexById } from "../../data/hexMap";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import { getSeaConditionAt } from "../../domain/seaCondition";
import { PlannedFleetShipCard } from "./PlannedFleetShipCard";
import { useGameStore } from "../../state/gameStore";

import type { VoyageDisplayClock } from "../../domain/voyageTimePresentation";

interface FleetPanelProps {
  displayClock: VoyageDisplayClock;
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

function ManualRefuelPanel({
  ship,
  onRefuel,
}: {
  ship: Ship;
  onRefuel: (tons: number) => void;
}) {
  const [tons, setTons] = useState("1");
  const fuel = ship.fuel;

  if (!fuel) return null;

  const requestedTons = Number(tons);
  const remainingCapacityTons =
    fuel.capacityTons - fuel.remainingTons;
  const refuelTons = Math.min(
    requestedTons,
    remainingCapacityTons,
  );
  const cost = Math.ceil(refuelTons * 120);
  const canRefuel = refuelTons > 0;

  return (
    <div className="manual-refuel-panel">
      <h4>手動補油</h4>
      <p>
        現在 {fuel.remainingTons}t /
        容量 {fuel.capacityTons}t
      </p>
      <label>
        補油量（t）
        <input
          type="number"
          min="0"
          step="0.1"
          value={tons}
          onChange={(event) => setTons(event.target.value)}
        />
      </label>
      <p>燃料代：{cost}G</p>
      <button
        type="button"
        disabled={!canRefuel}
        onClick={() => onRefuel(refuelTons)}
      >
        補油する
      </button>
    </div>
  );
}

export function FleetPanel({ ships, voyage, contract, operationTime, displayClock, onSelectShip }: FleetPanelProps) {
  const refuelShip = useGameStore((state) => state.refuelShip);
  const legacyVoyage = voyage?.plannedNavigation !== undefined ? null : voyage;
  const legacyContract = voyage?.plannedNavigation !== undefined ? null : contract;
  const route = legacyContract ? getRouteById(legacyContract.routeId) : null;
  const cargo = legacyContract ? getCargoPresentation(legacyContract) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const remainingOperationMs = legacyVoyage ? Math.max(0, legacyVoyage.estimatedArrivalAt - operationTime) : 0;
  const remainingMs = remainingOperationMs / 6;
  const estimatedArrivalLabel = legacyVoyage?.phase === "sailing"
    ? formatDateTime(ceilTo1Minute(Date.now() + remainingMs))
    : "-";
  const deadlineLabel = legacyContract ? formatDateTime(legacyContract.deadlineAt) : "-";

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
          const shipContract = shipVoyage && contract?.id === shipVoyage.contractId ? contract : null;
          if (shipVoyage?.plannedNavigation !== undefined) {
            return <PlannedFleetShipCard clock={displayClock} key={ship.id} ship={ship} voyage={shipVoyage} contract={shipContract} onSelectShip={onSelectShip} />;
          }
          const capacity = getLotCapacityForDisplay(ship);
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
          const contractLabel = shipContract
            ? cargo && fromPort && toPort ? `${cargo.label}／${fromPort.name}→${toPort.name}` : "貨物データ確認不可"
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
              {shipContract && <div className="contract-facts">
                <div><span className="contract-fact-label">貨物重量</span><span className="contract-fact-value">{cargo?.weightLabel ?? "確認不可"}</span></div>
                <div><span className="contract-fact-label">貨物容積</span><span className="contract-fact-value">{cargo?.volumeLabel ?? "確認不可"}</span></div>
              </div>}
              <div className="contract-facts">
                <div><span className="contract-fact-label">新規受注の重量上限</span><span className="contract-fact-value">{capacity ? formatCargoMeasure(capacity.maxCargoWeightTons, "t") : "未設定"}</span></div>
                <div><span className="contract-fact-label">新規受注の容積上限</span><span className="contract-fact-value">{capacity ? formatCargoMeasure(capacity.maxCargoVolumeM3, "m³") : "未設定"}</span></div>
              </div>

              {ship.kind === "powered" && (
                <ManualRefuelPanel
                  ship={ship}
                  onRefuel={(tons) => refuelShip(ship.id, tons)}
                />
              )}

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
                  <span className="contract-fact-value">{shipContract ? estimatedArrivalLabel : "-"}</span>
                </div>
                <div>
                  <span className="contract-fact-label">期限</span>
                  <span className="contract-fact-value">{shipContract ? deadlineLabel : "-"}</span>
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

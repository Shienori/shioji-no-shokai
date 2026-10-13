import { useState } from "react";
import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { formatDateTime, formatDuration } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import { getRouteHexIds } from "../../domain/routePath";
import { hexMap } from "../../data/hexMap";
import { HexMap } from "./HexMap";
import { ShipDetailModal } from "./ShipDetailModal";

interface FleetPanelProps {
  ship: Ship;
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  progress: number;
  operationTime: number;
}

function getSeaLabel(hexId: string) {
  const match = hexId.match(/(\d+)$/);
  return match ? `S${match[1].padStart(2, "0")}` : hexId;
}

function formatOperationTime(operationTime: number) {
  return `${(operationTime / 1000).toFixed(1)}秒`;
}

export function FleetPanel({ ship, voyage, contract, progress, operationTime }: FleetPanelProps) {
  const [showShipDetail, setShowShipDetail] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const route = contract ? getRouteById(contract.routeId) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const remainingOperationMs = voyage ? Math.max(0, voyage.estimatedArrivalAt - operationTime) : 0;
  const remainingMs = remainingOperationMs / 6;
  const deadlineLabel = contract ? formatDateTime(contract.deadlineAt) : "";
  const estimatedArrivalLabel = voyage ? formatDateTime(Date.now() + remainingMs) : "";

  const voyageProgress = voyage && contract
    ? calculateVoyageProgress(voyage, contract, operationTime)
    : 0;

  const sailingProgress =
    voyage?.phase === "sailing"
      ? voyageProgress
      : voyage && (voyage.phase === "unloading" || voyage.phase === "completed")
        ? 1
        : 0;

  const currentHexId = ship.currentHexId;
  const currentHexData = hexMap.find((hex) => hex.id === currentHexId);
  const currentHexLabel = currentHexData
    ? currentHexData.kind === "port"
      ? getPortById(currentHexData.portId!).name
      : `海域 ${getSeaLabel(currentHexData.id)}`
    : currentHexId;

  const routeHexIds = route ? getRouteHexIds(route.fromPortId, route.toPortId) ?? [] : [];

  return (
    <section>
      <div className="ship fleet-compact">
        <div className="ship-status">
          <span className="badge warn ship-status-badge">{ship.status}</span>
          <span className="ship-load">積載 {contract ? contract.quantity : 0} / {ship.maxLoadUnits}LU</span>
        </div>
        <div className="ship-heading">
          <h3>{ship.name}</h3>
          <button className="ship-detail-button" onClick={() => setShowShipDetail(true)}>船の詳細</button>
        </div>
        <div className="progress-block">
          <div className="progress-heading">
            <span>進捗状況</span>
            <span>{Math.round(sailingProgress * 100)}%</span>
          </div>
          <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        </div>
        <div className="fleet-summary">
          <div><span>現在地</span><strong>{currentHexLabel}</strong></div>
          <div><span>到着期限</span><strong>{deadlineLabel || "-"}</strong></div>
        </div>
      </div>

      {contract && route && fromPort && toPort && (
        <div className="card active-contract">
          <h3>進行中契約</h3>
          <p className="active-contract-cargo">{getCargoById(contract.cargoId).name} ×{contract.quantity}</p>
          <p className="route">{fromPort.name} → {toPort.name}</p>
          <div className="fleet-summary">
            <div><span>到着まで</span><strong>{voyage?.phase === "sailing" ? formatDuration(remainingMs) : "-"}</strong></div>
            <div><span>予定到着</span><strong>{voyage?.phase === "sailing" ? estimatedArrivalLabel : "-"}</strong></div>
          </div>
        </div>
      )}

      <details className="card map-card" open={showMap} onToggle={(event) => setShowMap((event.target as HTMLDetailsElement).open)}>
        <summary>航路マップ</summary>
        {showMap && (
          <HexMap
            ships={[{ name: ship.name, hexId: currentHexId }]}
            routeHexIds={routeHexIds}
            currentHexId={currentHexId}
          />
        )}
      </details>

      <details className="card debug-card">
        <summary>デバッグ: 航海位置</summary>
        <div className="kv"><span>フェーズ</span><span>{voyage?.phase ?? "待機"}</span></div>
        <div className="kv"><span>操作時間</span><span>{formatOperationTime(operationTime)}</span></div>
        <div className="kv"><span>出発時刻</span><span>{voyage ? formatOperationTime(voyage.departedAt) : "-"}</span></div>
        <div className="kv"><span>到着予定</span><span>{voyage ? formatOperationTime(voyage.estimatedArrivalAt) : "-"}</span></div>
        <div className="kv"><span>到着期限</span><span>{voyage ? formatOperationTime(voyage.arrivalDeadlineAt) : "-"}</span></div>
        <div className="kv"><span>保存中HEX</span><span>{ship.currentHexId}</span></div>
        <div className="kv"><span>経路HEX</span><span>{routeHexIds.join(" → ") || "-"}</span></div>
      </details>

      <ShipDetailModal ship={ship} open={showShipDetail} onClose={() => setShowShipDetail(false)} />
    </section>
  );
}
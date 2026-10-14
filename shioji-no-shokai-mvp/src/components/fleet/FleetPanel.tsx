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
    <section className="contract-board fleet-board">
      <header className="contract-board-header">
        <div>
          <h2>Fleet</h2>
          <p className="contract-board-subtitle">船と航海の状況</p>
        </div>
        <span className="contract-count">{ship.status}</span>
      </header>

      <div className="contract-list">
        <div className="contract-card fleet-card">
          <div className="contract-card-heading">
            <h3>{ship.name}</h3>
            <span className="contract-card-detail">積載 {contract ? contract.quantity : 0}/{ship.maxLoadUnits}LU</span>
          </div>
          <div className="progress-block">
            <div className="progress-heading">
              <span>進捗状況</span>
              <span>{Math.round(sailingProgress * 100)}%</span>
            </div>
            <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          </div>
          <div className="contract-card-route">
            <span>現在地</span>
            <span className="contract-route-arrow">→</span>
            <span>{currentHexLabel}</span>
          </div>
          <div className="contract-facts">
            <div>
              <span className="contract-fact-label">到着期限</span>
              <span className="contract-fact-value">{deadlineLabel || "-"}</span>
            </div>
          </div>
          <button className="ship-detail-button" onClick={() => setShowShipDetail(true)}>船の詳細</button>
        </div>

        {contract && route && fromPort && toPort && (
          <div className="contract-card fleet-card">
            <div className="contract-card-heading">
              <h3>進行中契約</h3>
              <span className="contract-card-detail">{getCargoById(contract.cargoId).name} ×{contract.quantity}</span>
            </div>
            <div className="contract-card-route">
              <span>{fromPort.name}</span>
              <span className="contract-route-arrow">→</span>
              <span>{toPort.name}</span>
            </div>
            <div className="contract-facts">
              <div>
                <span className="contract-fact-label">到着まで</span>
                <span className="contract-fact-value">{voyage?.phase === "sailing" ? formatDuration(remainingMs) : "-"}</span>
              </div>
              <div>
                <span className="contract-fact-label">予定到着</span>
                <span className="contract-fact-value">{voyage?.phase === "sailing" ? estimatedArrivalLabel : "-"}</span>
              </div>
            </div>
          </div>
        )}

        <div className="contract-card fleet-card map-card">
          <h3>航路マップ</h3>
          <HexMap
            ships={[{ name: ship.name, hexId: currentHexId }]}
            routeHexIds={routeHexIds}
            currentHexId={currentHexId}
          />
        </div>

        <details className="contract-card fleet-card debug-card">
          <summary>デバッグ: 航海位置</summary>
          <div className="kv"><span>フェーズ</span><span>{voyage?.phase ?? "待機"}</span></div>
          <div className="kv"><span>操作時間</span><span>{formatOperationTime(operationTime)}</span></div>
          <div className="kv"><span>出発時刻</span><span>{voyage ? formatOperationTime(voyage.departedAt) : "-"}</span></div>
          <div className="kv"><span>到着予定</span><span>{voyage ? formatOperationTime(voyage.estimatedArrivalAt) : "-"}</span></div>
          <div className="kv"><span>到着期限</span><span>{voyage ? formatOperationTime(voyage.arrivalDeadlineAt) : "-"}</span></div>
          <div className="kv"><span>保存中HEX</span><span>{ship.currentHexId}</span></div>
          <div className="kv"><span>経路HEX</span><span>{routeHexIds.join(" → ") || "-"}</span></div>
        </details>
      </div>

      <ShipDetailModal ship={ship} open={showShipDetail} onClose={() => setShowShipDetail(false)} />
    </section>
  );
}
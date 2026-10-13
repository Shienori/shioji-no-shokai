import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { formatDuration } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import { getRouteHexIds } from "../../domain/routePath";
import { getPortHexId, hexMap } from "../../data/hexMap";
import { HexMap } from "./HexMap";

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

function formatClock(realTimeMs: number) {
  return new Date(realTimeMs).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FleetPanel({ ship, voyage, contract, progress, operationTime }: FleetPanelProps) {
  const route = contract ? getRouteById(contract.routeId) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const remainingOperationMs = voyage ? Math.max(0, voyage.estimatedArrivalAt - operationTime) : 0;
  const remainingMs = remainingOperationMs / 6;
  const deadlineTime = contract ? new Date(contract.deadlineAt) : null;
  const estimatedArrivalTime = new Date(Date.now() + remainingMs);
  const deadlineLabel = deadlineTime ? formatClock(deadlineTime.getTime()) : "";
  const estimatedArrivalLabel = voyage ? formatClock(estimatedArrivalTime.getTime()) : "";

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
      <div className="ship">
        <div className="ship-status">
          <span className="badge warn ship-status-badge">{ship.status}</span>
          <span className="ship-load">積載 {contract ? contract.quantity : 0} / {ship.maxLoadUnits}LU</span>
        </div>
        <h3>{ship.name}</h3>
        <div className="progress-block">
          <div className="progress-heading">
            <span>進捗状況</span>
            <span>{Math.round(sailingProgress * 100)}%</span>
          </div>
          <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        </div>
        <div className="kv"><span>現在地</span><span>{currentHexLabel}</span></div>
        <div className="kv"><span>HEX座標</span><span>{currentHexId}</span></div>
        {voyage && (
          <>
            {voyage.phase === "sailing" && (
              <div className="kv"><span>到着までの所要時間</span><span>{formatDuration(remainingMs)}</span></div>
            )}
            {voyage.phase === "sailing" && (
              <div className="kv"><span>予定到着時間</span><span>{estimatedArrivalLabel}</span></div>
            )}
            <div className="kv"><span>到着期限</span><span>{deadlineLabel}</span></div>
            {voyage.phase !== "sailing" && voyage.phase !== "loading" && (
              <div className="kv"><span>到着判定</span><span>{voyage.isOnTime ? "期限内到着" : `${voyage.arrivalLateHours}時間遅延`}</span></div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>航路マップ</h3>
        <HexMap
          ships={[{ name: ship.name, hexId: currentHexId }]}
          routeHexIds={routeHexIds}
          currentHexId={currentHexId}
        />
      </div>

      {contract && route && fromPort && toPort && (
        <div className="card">
          <h3>進行中契約</h3>
          <p>{getCargoById(contract.cargoId).name} ×{contract.quantity}</p>
          <p className="route">{fromPort.name} → {toPort.name}</p>
        </div>
      )}

      <details className="card">
        <summary>デバッグ: 航海位置</summary>
        <div className="kv"><span>フェーズ</span><span>{voyage?.phase ?? "待機"}</span></div>
        <div className="kv"><span>操作時間</span><span>{formatOperationTime(operationTime)}</span></div>
        <div className="kv"><span>出発時刻</span><span>{voyage ? formatOperationTime(voyage.departedAt) : "-"}</span></div>
        <div className="kv"><span>到着予定</span><span>{voyage ? formatOperationTime(voyage.estimatedArrivalAt) : "-"}</span></div>
        <div className="kv"><span>到着期限</span><span>{voyage ? formatOperationTime(voyage.arrivalDeadlineAt) : "-"}</span></div>
        <div className="kv"><span>保存中HEX</span><span>{ship.currentHexId}</span></div>
        <div className="kv"><span>経路HEX</span><span>{routeHexIds.join(" → ") || "-"}</span></div>
      </details>
    </section>
  );
}

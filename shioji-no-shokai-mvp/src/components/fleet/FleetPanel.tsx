import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { formatDuration } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import {
  findShortestRoute,
  type AxialHex
} from "../../domain/hexMap";
import { getPortHexId, hexMap } from "../../data/hexMap";
import { HexMap } from "./HexMap";

interface FleetPanelProps {
  ship: Ship;
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  progress: number;
  operationTime: number;
  currentGameTime: number;
}

function toAxialHex(hexId: string): AxialHex {
  const hex = hexMap.find((item) => item.id === hexId);

  if (!hex) {
    throw new Error(`Unknown hex: ${hexId}`);
  }

  return { q: hex.q, r: hex.r };
}

function getSeaLabel(hexId: string) {
  const match = hexId.match(/(\d+)$/);
  return match ? `S${match[1].padStart(2, "0")}` : hexId;
}

function formatOperationTime(operationTime: number) {
  return `${(operationTime / 1000).toFixed(1)}秒`;
}

export function FleetPanel({ ship, voyage, contract, progress, operationTime, currentGameTime }: FleetPanelProps) {
  const route = contract ? getRouteById(contract.routeId) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const remainingOperationMs = voyage ? Math.max(0, voyage.estimatedArrivalAt - operationTime) : 0;
  const remainingMs = remainingOperationMs / 6;
  const deadlineTime = contract ? new Date(contract.deadlineAt) : null;
  const deadlineLabel = deadlineTime
    ? deadlineTime.toLocaleString([], {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const startHexId = route ? getPortHexId(route.fromPortId) : null;
  const goalHexId = route ? getPortHexId(route.toPortId) : null;

  const hexRoute = route && startHexId && goalHexId
    ? findShortestRoute(
        toAxialHex(startHexId),
        toAxialHex(goalHexId),
        hexMap
          .filter((hex) => hex.kind === "sea" || hex.id === startHexId || hex.id === goalHexId)
          .map((hex) => toAxialHex(hex.id))
      )
    : null;

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

  const routeHexIds = hexRoute
    ? hexRoute.map((hex) => hexMap.find((item) => item.q === hex.q && item.r === hex.r)!.id)
    : [];

  return (
    <section>
      <div className="ship">
        <h3>{ship.name}</h3>
        <div className="meta">
          <span className="badge warn">{ship.status}</span>
          <span>積載 {contract ? contract.quantity : 0} / {ship.maxLoadUnits}LU</span>
        </div>
        <div className="kv"><span>現在地</span><span>{currentHexLabel}</span></div>
        <div className="kv"><span>HEX座標</span><span>{currentHexId}</span></div>
        <div className="kv"><span>航海進捗</span><span>{Math.round(sailingProgress * 100)}%</span></div>
        <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        {voyage && (
          <>
            <div className="kv"><span>残り時間</span><span>{formatDuration(remainingMs)}</span></div>
            <div className="kv"><span>納期</span><span>{deadlineLabel}</span></div>
          </>
        )}
      </div>

      <div className="card">
        <h3>航路マップ</h3>
        <HexMap
          ships={[{ name: ship.name, hexId: currentHexId }]}
          routeHexIds={routeHexIds}
          currentHexId={currentHexId}
          markerProgress={sailingProgress}
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
        <div className="kv"><span>保存中HEX</span><span>{ship.currentHexId}</span></div>
        <div className="kv"><span>経路HEX</span><span>{routeHexIds.join(" → ") || "-"}</span></div>
      </details>
    </section>
  );
}

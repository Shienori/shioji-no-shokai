import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { formatDuration } from "../../domain/time";

interface FleetPanelProps {
  ship: Ship;
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  progress: number;
  operationTime: number;
  currentGameTime: number;
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

  return (
    <section>
      <div className="ship">
        <h3>{ship.name}</h3>
        <div className="meta">
          <span className="badge warn">{ship.status}</span>
          <span>積載 {contract ? contract.quantity : 0} / {ship.maxLoadUnits}LU</span>
        </div>
        <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        {voyage && (
          <>
            <div className="kv"><span>残り時間</span><span>{formatDuration(remainingMs)}</span></div>
            <div className="kv"><span>納期</span><span>{deadlineLabel}</span></div>
          </>
        )}
      </div>
      {contract && route && fromPort && toPort && (
        <div className="card">
          <h3>進行中契約</h3>
          <p>{getCargoById(contract.cargoId).name} ×{contract.quantity}</p>
          <p className="route">{fromPort.name} → {toPort.name}</p>
        </div>
      )}
    </section>
  );
}
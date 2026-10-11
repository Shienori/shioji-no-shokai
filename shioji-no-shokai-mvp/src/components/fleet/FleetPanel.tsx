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
  const remainingMs = voyage ? Math.max(0, voyage.estimatedArrivalAt - operationTime) : 0;
  const remainingDeadlineMs = contract ? Math.max(0, contract.deadlineAt - currentGameTime) : 0;

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
            <div className="kv"><span>納期まで</span><span>{formatDuration(remainingDeadlineMs)}</span></div>
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
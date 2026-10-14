import type { AcceptedContract, ContractTemplate, Voyage } from "../../domain/types";
import { ContractCard } from "./ContractCard";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { formatDateTime, formatDuration } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";

interface ContractBoardProps {
  contracts: ContractTemplate[];
  acceptedContract: AcceptedContract | null;
  voyage: Voyage | null;
  progress: number;
  operationTime: number;
  onSelectContract: (contractId: string) => void;
}

export function ContractBoard({ contracts, acceptedContract, voyage, progress, operationTime, onSelectContract }: ContractBoardProps) {
  const route = acceptedContract ? getRouteById(acceptedContract.routeId) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const cargo = acceptedContract ? getCargoById(acceptedContract.cargoId) : null;
  const remainingOperationMs = voyage ? Math.max(0, voyage.estimatedArrivalAt - operationTime) : 0;
  const remainingMs = remainingOperationMs / 6;
  const deadlineLabel = acceptedContract ? formatDateTime(acceptedContract.deadlineAt) : "";
  const estimatedArrivalLabel = voyage ? formatDateTime(Date.now() + remainingMs) : "";
  const sailingProgress = voyage?.phase === "sailing"
    ? progress
    : voyage && (voyage.phase === "unloading" || voyage.phase === "completed")
      ? 1
      : 0;

  return (
    <section className="contract-board">
      <header className="contract-board-header">
        <div>
          <h2>契約板</h2>
          <p className="contract-board-subtitle">セレネ港発の輸送依頼</p>
        </div>
        <span className="contract-count">{contracts.length}件</span>
      </header>

      <div className="contract-list">
        {acceptedContract && route && fromPort && toPort && cargo && (
          <div className="contract-card active-contract-card">
            <div className="contract-card-heading">
              <h3>進行中契約</h3>
              <span className="contract-card-detail">{voyage?.phase ?? "loading"}</span>
            </div>
            <p className="contract-card-route">
              {fromPort.name}
              <span className="contract-route-arrow">→</span>
              {toPort.name}
            </p>
            <div className="contract-facts">
              <div>
                <span className="contract-fact-label">貨物</span>
                <span className="contract-fact-value">{cargo.name} ×{acceptedContract.quantity}</span>
              </div>
              <div>
                <span className="contract-fact-label">到着期限</span>
                <span className="contract-fact-value">{deadlineLabel}</span>
              </div>
            </div>
            <div className="progress-block">
              <div className="progress-heading">
                <span>進捗状況</span>
                <span>{Math.round(sailingProgress * 100)}%</span>
              </div>
              <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
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

        {contracts.map((contract) => (
          <ContractCard key={contract.id} contract={contract} onSelect={() => onSelectContract(contract.id)} />
        ))}
      </div>
    </section>
  );
}
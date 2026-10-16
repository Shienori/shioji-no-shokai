import type {
  AcceptedContract,
  ContractTemplate,
  PortId,
  Voyage,
} from "../../domain/types";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";
import { ContractCard } from "./ContractCard";
import { ports, getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { formatDateTime, formatDuration } from "../../domain/time";

interface ContractBoardProps {
  selectedPortId: PortId;
  onSelectPort: (portId: PortId) => void;
  fixedContract: ContractTemplate | null;
  contracts: ContractTemplate[];
  nextRefreshAt: number;
  currentTime: number;
  acceptedContract: AcceptedContract | null;
  voyage: Voyage | null;
  progress: number;
  operationTime: number;
  onSelectContract: (contractId: string) => void;
}

function formatRefreshCountdown(remainingMs: number): string {
  const totalMinutes = Math.max(
    0,
    Math.ceil(remainingMs / (60 * 1000)),
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0
    ? `${hours}時間${minutes}分`
    : `${minutes}分`;
}

export function ContractBoard({
  selectedPortId,
  onSelectPort,
  fixedContract,
  contracts,
  nextRefreshAt,
  currentTime,
  acceptedContract,
  voyage,
  progress,
  operationTime,
  onSelectContract,
}: ContractBoardProps) {
  const selectedPort = getPortById(selectedPortId);
  const route = acceptedContract
    ? getRouteById(acceptedContract.routeId)
    : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const cargo = acceptedContract
    ? getCargoById(acceptedContract.cargoId)
    : null;

  const showEta =
    voyage?.phase === "loading" || voyage?.phase === "sailing";

  const remainingOperationMs = voyage
    ? Math.max(0, voyage.estimatedArrivalAt - operationTime)
    : 0;

  const remainingRealMs =
    remainingOperationMs / GAME_TIME_MULTIPLIER;

  const deadlineLabel = acceptedContract
    ? formatDateTime(acceptedContract.deadlineAt)
    : "";

  const estimatedArrivalLabel = showEta
    ? formatDateTime(currentTime + remainingRealMs)
    : "";

  const sailingProgress =
    voyage?.phase === "sailing"
      ? progress
      : voyage &&
          (voyage.phase === "unloading" ||
            voyage.phase === "completed")
        ? 1
        : 0;

  const refreshRemainingMs = Math.max(
    0,
    nextRefreshAt - currentTime,
  );

  return (
    <section className="contract-board">
      <header className="contract-board-header">
        <div>
          <h2>依頼板</h2>
          <p className="contract-board-subtitle">
            {selectedPort.name}発の輸送依頼
          </p>
        </div>
        <span className="contract-count">
          {contracts.length + (fixedContract ? 1 : 0)}件
        </span>
      </header>

      <div className="port-tabs">
        {ports.map((port) => (
          <button
            key={port.id}
            type="button"
            className={`port-tab${port.id === selectedPortId ? " active" : ""}`}
            onClick={() => onSelectPort(port.id)}
          >
            {port.name}
          </button>
        ))}
      </div>

      <div className="refresh-note">
        <span>依頼更新</span>
        <span>
          次まで {formatRefreshCountdown(refreshRemainingMs)}
        </span>
      </div>

      <div className="contract-list">
        {acceptedContract && route && fromPort && toPort && cargo && (
          <div className="contract-card active-contract-card">
            <div className="contract-card-heading">
              <h3>進行中の依頼</h3>
              <span className="contract-card-detail">
                {voyage?.phase ?? "loading"}
              </span>
            </div>

            <p className="contract-card-route">
              {fromPort.name}
              <span className="contract-route-arrow">→</span>
              {toPort.name}
            </p>

            <div className="contract-facts">
              <div>
                <span className="contract-fact-label">貨物</span>
                <span className="contract-fact-value">
                  {cargo.name} ×{acceptedContract.quantity}
                </span>
              </div>
              <div>
                <span className="contract-fact-label">到着期限</span>
                <span className="contract-fact-value">
                  {deadlineLabel}
                </span>
              </div>
            </div>

            <div className="progress-block">
              <div className="progress-heading">
                <span>進捗状況</span>
                <span>{Math.round(sailingProgress * 100)}%</span>
              </div>
              <div className="progress">
                <div
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                  }}
                />
              </div>
            </div>

            <div className="contract-facts">
              <div>
                <span className="contract-fact-label">到着まで</span>
                <span className="contract-fact-value">
                  {showEta ? formatDuration(remainingRealMs) : "-"}
                </span>
              </div>
              <div>
                <span className="contract-fact-label">ETA</span>
                <span className="contract-fact-value">
                  {showEta ? estimatedArrivalLabel : "-"}
                </span>
              </div>
            </div>
          </div>
        )}

        {fixedContract && (
          <div className="contract-card fixed-contract-card">
            <div className="contract-card-heading">
              <h3>固定依頼</h3>
              <span className="contract-card-detail">チュートリアル</span>
            </div>
            <ContractCard
              contract={fixedContract}
              onSelect={() => onSelectContract(fixedContract.id)}
            />
          </div>
        )}

        {contracts.map((contract) => (
          <ContractCard
            key={contract.id}
            contract={contract}
            onSelect={() => onSelectContract(contract.id)}
          />
        ))}
      </div>
    </section>
  );
}

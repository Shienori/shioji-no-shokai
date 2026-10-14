import { useEffect, useState } from "react";
import type { ContractTemplate, Ship } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { calculateExpense } from "../../domain/reward";
import { formatDateTime, formatDuration } from "../../domain/time";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";

interface ContractDetailScreenProps {
  contract: ContractTemplate | null;
  ships: Ship[];
  eligibleShips: Ship[];
  acceptReason: string | null;
  onAccept: (shipId: string) => void;
  onClose: () => void;
}

export function ContractDetailScreen({
  contract,
  ships,
  eligibleShips,
  acceptReason,
  onAccept,
  onClose
}: ContractDetailScreenProps) {
  const [showShipSelect, setShowShipSelect] = useState(false);

  useEffect(() => {
    setShowShipSelect(false);
  }, [contract?.id]);

  if (!contract) return null;

  const route = getRouteById(contract.routeId);
  const cargo = getCargoById(contract.cargoId);
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const expense = calculateExpense(contract.offeredReward);
  const netProfit = contract.offeredReward - expense;
  const realDeadlineMs = (contract.deadlineHours * 60 * 60 * 1000) / GAME_TIME_MULTIPLIER;
  const deadlineTime = new Date(Date.now() + realDeadlineMs);
  const estimatedArrivalTime = new Date(Date.now() + route.baseVoyageHours * 60 * 60 * 1000 / GAME_TIME_MULTIPLIER);
  const deadlineLabel = formatDateTime(deadlineTime.getTime());
  const estimatedArrivalLabel = formatDateTime(estimatedArrivalTime.getTime());
  const voyageDurationLabel = formatDuration(route.baseVoyageHours * 60 * 60 * 1000 / GAME_TIME_MULTIPLIER);
  const canAccept = eligibleShips.length > 0;

  return (
    <div className="contract-detail-screen">
      <header className="detail-header">
        <button className="back-btn" onClick={onClose}>← 戻る</button>
        <h2>{cargo.name}の輸送</h2>
      </header>

      <div className="detail-body">
        <div className="card detail-card">
          <div className="kv"><span>貨物</span><span>{cargo.name} ×{contract.quantity}</span></div>
          <div className="kv"><span>航路</span><span>{fromPort.name} → {toPort.name}</span></div>
          <div className="kv"><span>距離</span><span>{route.distance}海里</span></div>
          <div className="kv"><span>航海所要時間</span><span>{voyageDurationLabel}</span></div>
          <div className="kv"><span>予定到着時間</span><span>{estimatedArrivalLabel}</span></div>
          <div className="kv"><span>到着期限</span><span>{deadlineLabel}</span></div>
        </div>

        <div className="card detail-card">
          <div className="reward-row">
            <div className="reward-item"><div className="label">提示報酬</div><div className="value">{contract.offeredReward}G</div></div>
            <div className="reward-item net"><div className="label">見込純利益</div><div className="value">{netProfit}G</div></div>
          </div>
          <div className="kv"><span>経費</span><span>-{expense}G</span></div>
        </div>

        {showShipSelect && (
          <div className="card detail-card ship-select-card">
            <h3>積載する船を選択</h3>
            <div className="ship-select-list">
              {ships.map((ship) => {
                const isEligible = eligibleShips.some((item) => item.id === ship.id);
                return (
                  <button
                    key={ship.id}
                    type="button"
                    className="ship-select-item"
                    disabled={!isEligible}
                    onClick={() => onAccept(ship.id)}
                  >
                    <span className="ship-select-name">{ship.name}</span>
                    <span className="ship-select-meta">
                      積載量 {ship.maxLoadUnits}LU／状態 {ship.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <footer className="detail-footer">
        {acceptReason && <p className="accept-reason">{acceptReason}</p>}
        {!showShipSelect && (
          <button
            className="btn btn-primary"
            disabled={!canAccept}
            onClick={() => setShowShipSelect(true)}
          >
            受注する
          </button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>断る</button>
      </footer>
    </div>
  );
}

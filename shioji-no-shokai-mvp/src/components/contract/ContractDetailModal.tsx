import type { ContractTemplate } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { calculateExpense } from "../../domain/reward";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";

interface ContractDetailModalProps {
  contract: ContractTemplate | null;
  canAccept: boolean;
  onAccept: () => void;
  onClose: () => void;
}

export function ContractDetailModal({ contract, canAccept, onAccept, onClose }: ContractDetailModalProps) {
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
  const deadlineLabel = deadlineTime.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const estimatedArrivalLabel = estimatedArrivalTime.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="modal-backdrop open">
      <div className="modal">
        <button className="close" onClick={onClose}>×</button>
        <h2>{cargo.name}の輸送</h2>
        <div className="kv"><span>貨物</span><span>{cargo.name} ×{contract.quantity}</span></div>
        <div className="kv"><span>航路</span><span>{fromPort.name} → {toPort.name}</span></div>
        <div className="kv"><span>距離</span><span>{route.distance}海里</span></div>
        <div className="kv"><span>航海所要時間</span><span>{route.baseVoyageHours / GAME_TIME_MULTIPLIER}時間</span></div>
        <div className="kv"><span>予定到着時間</span><span>{estimatedArrivalLabel}</span></div>
        <div className="kv"><span>到着期限</span><span>{deadlineLabel}</span></div>
        <div className="reward-row">
          <div className="reward-item"><div className="label">提示報酬</div><div className="value">{contract.offeredReward}G</div></div>
          <div className="reward-item net"><div className="label">見込純利益</div><div className="value">{netProfit}G</div></div>
        </div>
        <div className="kv"><span>経費</span><span>-{expense}G</span></div>
        <button className="btn btn-primary" disabled={!canAccept} onClick={onAccept}>受注する</button>
        <button className="btn btn-secondary" onClick={onClose}>断る</button>
      </div>
    </div>
  );
}

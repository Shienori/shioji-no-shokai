import type { ContractTemplate } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";

interface ContractCardProps {
  contract: ContractTemplate;
  onSelect: () => void;
}

export function ContractCard({ contract, onSelect }: ContractCardProps) {
  const route = getRouteById(contract.routeId);
  const cargo = getCargoById(contract.cargoId);
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const netProfit = Math.floor(contract.offeredReward * 0.7);
  const realDeadlineMs = (contract.deadlineHours * 60 * 60 * 1000) / GAME_TIME_MULTIPLIER;
  const deadlineTime = new Date(Date.now() + realDeadlineMs);
  const deadlineLabel = deadlineTime.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button className="card" onClick={onSelect}>
      <h3>{cargo.name}の輸送</h3>
      <p className="route">{fromPort.name} → {toPort.name}</p>
      <div className="meta">
        <span>{cargo.name} ×{contract.quantity}</span>
        <span>{cargo.loadUnitsPerUnit * contract.quantity}LU</span>
        <span>納期：{deadlineLabel}</span>
      </div>
      <div className="reward-row">
        <div className="reward-item"><div className="label">提示報酬</div><div className="value">{contract.offeredReward}G</div></div>
        <div className="reward-item net"><div className="label">見込純利益</div><div className="value">{netProfit}G</div></div>
      </div>
    </button>
  );
}
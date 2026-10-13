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
  const requiredLoadUnits = cargo.loadUnitsPerUnit * contract.quantity;
  const realDeadlineMs = (contract.deadlineHours * 60 * 60 * 1000) / GAME_TIME_MULTIPLIER;
  const deadlineTime = new Date(Date.now() + realDeadlineMs);
  const estimatedDeliveryTime = new Date(Date.now() + route.baseVoyageHours * 60 * 60 * 1000 / GAME_TIME_MULTIPLIER);
  const deadlineLabel = deadlineTime.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const estimatedDeliveryLabel = estimatedDeliveryTime.toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button className="contract-card" onClick={onSelect}>
      <div className="contract-card-heading">
        <h3>{cargo.name}の輸送</h3>
        <span className="contract-card-detail">詳細 ›</span>
      </div>
      <p className="contract-card-route">
        {fromPort.name}
        <span className="contract-route-arrow">→</span>
        {toPort.name}
      </p>
      <div className="contract-facts">
        <div className="contract-fact">
          <span className="contract-fact-label">貨物</span>
          <span className="contract-fact-value">{cargo.name} ×{contract.quantity}</span>
        </div>
        <div className="contract-fact">
          <span className="contract-fact-label">必要積載量</span>
          <span className="contract-fact-value">{requiredLoadUnits}LU</span>
        </div>
      </div>
      <p className="contract-deadline">納品期限：{deadlineLabel}</p>
      <p className="contract-estimated-delivery">予定納品時間：{estimatedDeliveryLabel}</p>
      <div className="contract-reward">
        <div className="contract-reward-item">
          <span className="contract-fact-label">提示報酬</span>
          <span className="contract-fact-value reward-gold">{contract.offeredReward}G</span>
        </div>
        <div className="contract-reward-item">
          <span className="contract-fact-label">見込純利益</span>
          <span className="contract-fact-value reward-green">{netProfit}G</span>
        </div>
      </div>
    </button>
  );
}

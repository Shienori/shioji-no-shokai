import type { ContractTemplate } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { getContractCargoRequirements, getContractSchedule } from "../../domain/contractOffer";
import { formatDateTime, formatDuration } from "../../domain/time";

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
  const { requiredCargoVolume, requiredCargoWeight } = getContractCargoRequirements(contract, cargo);
  const { voyageDurationMs, estimatedArrivalAt, deadlineAt } = getContractSchedule(contract, route, Date.now());
  const deadlineLabel = formatDateTime(deadlineAt);
  const estimatedArrivalLabel = formatDateTime(estimatedArrivalAt);
  const voyageDurationLabel = formatDuration(voyageDurationMs);

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
      <div className="requirement-grid card-requirement-grid">
        <div className="requirement-item">
          <span className="requirement-label">必要スペース</span>
          <span className="requirement-value">{requiredCargoVolume}</span>
        </div>
        <div className="requirement-item">
          <span className="requirement-label">必要積載量</span>
          <span className="requirement-value">{requiredCargoWeight}</span>
        </div>
      </div>
      <div className="contract-facts">
        <div className="contract-fact">
          <span className="contract-fact-label">貨物</span>
          <span className="contract-fact-value">{cargo.name} ×{contract.quantity}</span>
        </div>
      </div>
      <p className="contract-deadline">航海所要時間：{voyageDurationLabel}</p>
      <p className="contract-estimated-delivery">到着期限：{deadlineLabel}</p>
      <p className="contract-estimated-delivery">ETA：{estimatedArrivalLabel}</p>
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

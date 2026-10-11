import type { ContractTemplate } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";

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

  return (
    <button className="card" onClick={onSelect}>
      <h3>{cargo.name}の輸送</h3>
      <p className="route">{fromPort.name} → {toPort.name}</p>
      <div className="meta">
        <span>{cargo.name} ×{contract.quantity}</span>
        <span>{cargo.loadUnitsPerUnit * contract.quantity}LU</span>
        <span>納期{contract.deadlineHours}時間</span>
      </div>
      <div className="reward-row">
        <div className="reward-item"><div className="label">提示報酬</div><div className="value">{contract.offeredReward}G</div></div>
        <div className="reward-item net"><div className="label">見込純利益</div><div className="value">{netProfit}G</div></div>
      </div>
    </button>
  );
}

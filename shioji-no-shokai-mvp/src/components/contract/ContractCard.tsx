import type { ContractTemplate, Ship } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoPresentation, getCargoFitForShip } from "../../domain/cargoPresentation";
import { getContractSchedule } from "../../domain/contractOffer";
import { calculateExpense, calculateNetProfit } from "../../domain/reward";
import { formatDateTime, formatDuration } from "../../domain/time";

interface ContractCardProps {
  contract: ContractTemplate;
  ships: Ship[];
  onSelect: () => void;
}

export function ContractCard({ contract, ships, onSelect }: ContractCardProps) {
  const route = getRouteById(contract.routeId);
  const display = getCargoPresentation(contract);
  if (!display) return <div className="contract-card" role="alert">貨物の数量・単位データを確認できません。</div>;
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const expense = calculateExpense(contract.offeredReward);
  const netProfit = calculateNetProfit(contract.offeredReward, expense);
  const { voyageDurationMs, estimatedArrivalAt, deadlineAt } = getContractSchedule(contract, route, Date.now());
  const deadlineLabel = formatDateTime(deadlineAt);
  const estimatedArrivalLabel = formatDateTime(estimatedArrivalAt);
  const voyageDurationLabel = formatDuration(voyageDurationMs);
  const anyShipCanCarry = ships.some(ship => {
    const fit = getCargoFitForShip(contract, ship);
    return fit?.canCarry ?? false;
  });
  const acceptanceLabel = anyShipCanCarry ? "受注可能" : "受注不可";
  const acceptanceColor = anyShipCanCarry ? "#166534" : "#991b1b";
  const acceptanceBackground = anyShipCanCarry ? "#dcfce7" : "#fee2e2";

  return (
    <button className="contract-card" type="button" onClick={onSelect}>
      <div className="contract-card-heading">
        <h3>{display.cargo.name}の輸送</h3>
        <span className="contract-card-detail">詳細 ›</span>
      </div>
      <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999, fontSize: 14, fontWeight: 600, color: acceptanceColor, background: acceptanceBackground, marginBottom: 8 }}>{acceptanceLabel}</span>
      <p className="contract-card-route">
        {fromPort.name}
        <span className="contract-route-arrow">→</span>
        {toPort.name}
      </p>
      <div className="requirement-grid card-requirement-grid">
        <div className="requirement-item">
          <span className="requirement-label">必要スペース</span>
          <span className="requirement-value">{display.volumeLabel}</span>
        </div>
        <div className="requirement-item">
          <span className="requirement-label">貨物重量</span>
          <span className="requirement-value">{display.weightLabel}</span>
        </div>
      </div>
      <div className="contract-facts">
        <div className="contract-fact">
          <span className="contract-fact-label">貨物</span>
          <span className="contract-fact-value">{display.label}</span>
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
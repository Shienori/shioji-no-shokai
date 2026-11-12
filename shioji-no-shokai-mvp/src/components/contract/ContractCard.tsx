import type { ContractTemplate, GameState, Ship } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoPresentation } from "../../domain/cargoPresentation";
import { getContractSchedule } from "../../domain/contractOffer";
import { calculateExpense, calculateNetProfit } from "../../domain/reward";
import { formatDateTime, formatDuration } from "../../domain/time";
import { evaluateContractAcceptance } from "../../domain/contractAcceptance";

interface ContractCardProps {
  contract: ContractTemplate;
  onSelect: () => void;
  gameState?: GameState;
  ships?: Ship[];
  offerId?: string;
  now?: number;
}

export function ContractCard({
  contract,
  onSelect,
  gameState,
  ships,
  offerId,
  now = Date.now(),
}: ContractCardProps) {
  const route = getRouteById(contract.routeId);
  const display = getCargoPresentation(contract);
  if (!display) return <div className="contract-card" role="alert">貨物の数量・単位データを確認できません。</div>;
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const expense = calculateExpense(contract.offeredReward);
  const netProfit = calculateNetProfit(contract.offeredReward, expense);
  const { voyageDurationMs, estimatedArrivalAt, deadlineAt } = getContractSchedule(contract, route, now);
  const deadlineLabel = formatDateTime(deadlineAt);
  const estimatedArrivalLabel = formatDateTime(estimatedArrivalAt);
  const voyageDurationLabel = formatDuration(voyageDurationMs);

  const acceptanceChecks =
    gameState && ships
      ? ships.map((ship) => ({
          ship,
          check: evaluateContractAcceptance(contract, ship, gameState, now, offerId),
        }))
      : [];
  const acceptableShip = acceptanceChecks.find((item) => item.check.canAccept);
  const canAccept = Boolean(acceptableShip);
  const rejectionReason = acceptableShip
    ? null
    : acceptanceChecks.find((item) => item.check.reason)?.check.reason ?? null;
  const acceptanceLabel = canAccept ? "受注可能" : "受注不可";
  const acceptanceColor = canAccept ? "#166534" : "#991b1b";
  const acceptanceBackground = canAccept ? "#dcfce7" : "#fee2e2";

  return (
    <button className="contract-card" type="button" onClick={onSelect}>
      <div className="contract-card-heading">
        <h3>{display.cargo.name}の輸送</h3>
        <span className="contract-card-detail">詳細 ›</span>
      </div>
      {gameState && ships && (
        <span
          style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 600,
            color: acceptanceColor,
            background: acceptanceBackground,
            marginBottom: 8,
          }}
        >
          {acceptanceLabel}
          {!canAccept && rejectionReason && `：${rejectionReason}`}
        </span>
      )}
      <p className="contract-card-route">
        {fromPort.name}
        <span className="contract-route-arrow">→</span>
        {toPort.name}
      </p>
      <div className="requirement-grid card-requirement-grid">
        <div className="requirement-item">
          <span className="requirement-label">必要貨物容積</span>
          <span className="requirement-value">{display.volumeLabel}</span>
        </div>
        <div className="requirement-item">
          <span className="requirement-label">必要貨物重量</span>
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
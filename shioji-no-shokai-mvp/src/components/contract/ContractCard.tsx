import type { ContractTemplate, GameState, Ship } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoPresentation } from "../../domain/cargoPresentation";
import { getContractSchedule } from "../../domain/contractOffer";
import { formatDateTime, formatDuration } from "../../domain/time";
import { evaluateContractAcceptance } from "../../domain/contractAcceptance";
import "../../styles/contractOffer.css";

interface ContractCardProps {
  contract: ContractTemplate;
  onSelect: () => void;
  gameState?: GameState;
  ships?: Ship[];
  offerId?: string;
  now?: number;
}

export function ContractCard({ contract, onSelect, gameState, ships, offerId, now = Date.now() }: ContractCardProps) {
  const route = getRouteById(contract.routeId);
  const display = getCargoPresentation(contract);
  if (!display) return <div className="contract-card" role="alert">貨物の数量・単位データを確認できません。</div>;
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const { voyageDurationMs, estimatedArrivalAt, deadlineAt } = getContractSchedule(contract, route, now);
  const checks = gameState && ships ? ships.map((ship) => evaluateContractAcceptance(contract, ship, gameState, now, offerId)) : [];
  const canAccept = checks.some((check) => check.canAccept);
  const rejectionReason = canAccept ? null : checks.find((check) => check.reason)?.reason ?? null;
  return <button className="contract-card contract-offer-card" type="button" onClick={onSelect}>
    <div className="contract-offer-main">
      <span className="contract-offer-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 9 16 3 28 9v14l-12 6-12-6V9Z" /><path d="m4 9 12 6 12-6M16 15v14M10 6l12 6v6" /></svg>
      </span>
      <div className="contract-offer-content">
        <div className="contract-card-heading"><h3>{display.cargo.name}の輸送</h3><span className="contract-card-detail">詳細 ›</span></div>
        <p className="contract-offer-meta">{fromPort.name} → {toPort.name}</p>
        <p className="contract-offer-meta">{display.label}</p>
        <p className="contract-offer-meta">重量 {display.weightLabel} / 容積 {display.volumeLabel}</p>
        {gameState && ships && <span className={`contract-acceptance-badge ${canAccept ? "is-available" : "is-unavailable"}`}>
          {canAccept ? "受注可能" : "受注不可"}{!canAccept && rejectionReason && `：${rejectionReason}`}
        </span>}
        <p className="contract-offer-timing">航海所要時間：{formatDuration(voyageDurationMs)} / ETA：{formatDateTime(estimatedArrivalAt)}</p>
      </div>
    </div>
    <div className="contract-offer-footer">
      <div className="contract-offer-deadline"><span className="contract-fact-label">到着期限</span><span>{formatDateTime(deadlineAt)}</span></div>
      <div className="contract-offer-reward"><span className="contract-fact-label">報酬</span><span className="contract-offer-amount">{contract.offeredReward.toLocaleString("ja-JP")} G</span></div>
    </div>
  </button>;
}

import type { Ship } from "../../domain/types";
import type { ConfirmedPlanReview } from "../../domain/confirmedPlanReview";
import { calculateFuelPrepaymentSummary } from "../../domain/fuelPrepayment";
import { PLAN_FUEL_MESSAGES } from "../../domain/voyagePlanPrediction";
import { formatFuelTons } from "../../domain/freeRefuel";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";
import { getPortById } from "../../data/ports";
import { PlanSpeedSelector } from "./PlanSpeedSelector";
import "../../styles/voyagePlanFlow.css";

const date = (time: number) => new Date(time).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const fuelLabels = { insufficient: "不足", lowReserve: "予備燃料僅少", sufficient: "充足", unreachable: "前区間不足のため算出不可" };

export interface SpeedSelectionPanelProps {
  ship: Ship;
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export function SpeedSelectionPanel({ ship, speed, onSpeedChange }: SpeedSelectionPanelProps) {
  return <section className="card" aria-label="速力の決定" data-selected-speed={speed}>
    <h3>速力の決定</h3>
    <PlanSpeedSelector cruisingSpeedKnots={ship.cruisingSpeedKnots} maxSpeedKnots={ship.maxSpeedKnots} selectedSpeedKnots={speed} onChange={onSpeedChange} />
  </section>;
}

export interface FuelCalculationPanelProps {
  ship: Ship;
  speed: number;
  review: ConfirmedPlanReview | null;
  money?: number;
  onRefresh: () => void;
}

export function FuelCalculationPanel({ ship, speed, review, money, onRefresh }: FuelCalculationPanelProps) {
  const plan = review?.prediction;
  const matching = review === null || (review.shipId === ship.id && review.selectedSpeedKnots === speed);
  const fuelPrepayment = plan && review ? calculateFuelPrepaymentSummary(review.route, review.ship, plan) : null;
  return <section className="card" aria-label="燃料補給" data-selected-speed={speed}>
    <h3>燃料補給</h3>
    <button type="button" className="btn btn-secondary" onClick={onRefresh}>時刻を更新</button>
    {plan && review && matching ? <>
      <div className="kv"><span>到着予想時刻</span><span data-plan-eta={plan.plannedEtaRealTime}>{date(plan.plannedEtaRealTime)}</span></div>
      <p>必要燃料 {formatFuelTons(plan.totalRequiredFuelTons)} ／ 到着時残量 {formatFuelTons(plan.finalFuelTons)}</p>
      {plan.sections.map((section, index) => section.fuelAssessment !== "sufficient" && <p key={index} role="alert">区間{index + 1}：{fuelLabels[section.fuelAssessment]}。{section.fuelAssessment === "unreachable" ? "前区間の燃料不足を確認してください。" : PLAN_FUEL_MESSAGES[section.fuelAssessment]}</p>)}
      {!plan.hasFuelShortage && plan.sections.every(section => section.fuelAssessment === "sufficient") && <p role="status">燃料：充足</p>}
      {plan.hasFuelShortage && <p role="alert">燃料不足。到着時刻は条件付きの計画値です。</p>}
      {fuelPrepayment && <div className="kv"><span>途中補油前払金（合計）</span><span>{fuelPrepayment.totalPrepaymentGold.toLocaleString("ja-JP")}G</span></div>}
      {fuelPrepayment && money !== undefined && <div className="kv"><span>支払い後の残高</span><span>{(money - fuelPrepayment.totalPrepaymentGold).toLocaleString("ja-JP")}G</span></div>}
      <p>到着時刻・燃料は計画値です。途中補油は120G/tで有料です。</p>
      <details><summary>計算の詳細</summary>
        <p>{plan.notice}</p>
        <p>現在燃料 {formatFuelTons(review.ship.fuel?.remainingTons ?? null)} ／ 距離 {plan.totalDistanceNm}海里</p>
        <p>航海所要（積込別）{Math.ceil(plan.totalVoyageHours * 60 / GAME_TIME_MULTIPLIER)}分 ／ 出港予定 {date(plan.departureRealTime)}</p>
        {plan.sections.map((section, index) => <div key={index}>
          <h4>{getPortById(review.route.sections[index].fromPortId).name} → {getPortById(review.route.sections[index].toPortId).name}</h4>
          <p>開始 {formatFuelTons(section.startingFuelTons)} ／ 必要 {formatFuelTons(section.requiredFuelTons)} ／ 到着 {formatFuelTons(section.arrivalFuelTons)}</p>
          <p>{fuelLabels[section.fuelAssessment]}</p>
          {index < plan.sections.length - 1 && <p>補油目標 {review.route.sections[index].refuelTargetPercent}% ／ 追加 {formatFuelTons(section.refuelAddedTons)} ／ 補油後 {formatFuelTons(section.departureAfterRefuelTons)}</p>}
          {index < plan.sections.length - 1 && <p>前払金 {fuelPrepayment?.sections[index]?.prepaymentGold.toLocaleString("ja-JP") ?? "0"}G ／ 予想返金額 {fuelPrepayment?.sections[index]?.estimatedRefundGold.toLocaleString("ja-JP") ?? "0"}G</p>}
        </div>)}
      </details>
    </> : <p role="alert">航路・船・速力・燃料を確認してください。</p>}
  </section>;
}

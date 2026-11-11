import { useEffect, useId, useRef, useState } from "react";
import type { ConfirmedPlanReview, PlanAcceptanceResult } from "../../domain/confirmedPlanReview";
import { calculateFuelPrepaymentSummary } from "../../domain/fuelPrepayment";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { getCargoPresentation } from "../../domain/cargoPresentation";
import { getPortById } from "../../data/ports";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";

const date = (value: number) => formatDateTime(ceilTo1Minute(value));
const tons = (value: number | null) => value === null ? "算出不可" : `${value.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}t`;
const labels = { insufficient: "不足", lowReserve: "予備燃料僅少", sufficient: "充足", unreachable: "前区間不足のため算出不可" };
export function VoyagePlanReviewDetails({ review, money }: { review: ConfirmedPlanReview; money?: number }) {
  const { contract, ship, prediction: plan, route } = review;
  const cargo = getCargoPresentation(contract);
  const realMinutes = Math.ceil(plan.totalVoyageHours * 60 / GAME_TIME_MULTIPLIER);
  const unknownFuel = plan.totalRequiredFuelTons === null || plan.finalFuelTons === null || plan.sections.some(section => section.fuelAssessment === "unreachable");
  const lowReserve = plan.sections.some(section => section.fuelAssessment === "lowReserve");
  const fuelLabel = plan.hasFuelShortage ? "不足" : unknownFuel ? "算出不可" : lowReserve ? "予備燃料僅少" : "充足";
  const fuelColor = plan.hasFuelShortage || unknownFuel ? "var(--red)" : lowReserve ? "var(--gold)" : "var(--green)";
  const stops = route.sections.slice(0, -1);
  const fuelPrepayment = calculateFuelPrepaymentSummary(route, ship, plan);
  return <div aria-label="確認対象の確定航海計画" data-plan-eta={plan.plannedEtaRealTime} data-plan-distance={plan.totalDistanceNm} data-plan-fuel={plan.totalRequiredFuelTons}>
    <div style={{ marginBottom: 12 }}>
      <h4>{getPortById(route.departurePortId).name} → {getPortById(route.destinationPortId).name}</h4>
      <p>{cargo?.label ?? "貨物情報を確認できません"}</p>
    </div>
    <div className="kv"><span>使用船</span><span>{ship.name} ／ {review.selectedSpeedKnots}ノット</span></div>
    <div className="kv"><span>提示報酬</span><span style={{ color: "var(--gold)", fontWeight: 700 }}>{contract.offeredReward}G</span></div>
    <div className="kv"><span>計画到着（荷卸し前）</span><span>{date(plan.plannedEtaRealTime)}</span></div>
    <div className="kv"><span>到着期限</span><span>{date(review.deadlineAt)}</span></div>
    <div className="kv"><span>燃料</span><span style={{ color: fuelColor, fontWeight: 700 }}>{fuelLabel}</span></div>
    <div className="kv"><span>途中補油前払金（合計）</span><span>{fuelPrepayment.totalPrepaymentGold.toLocaleString("ja-JP")}G</span></div>
    {money !== undefined && <div className="kv"><span>支払い後の残高</span><span>{(money - fuelPrepayment.totalPrepaymentGold).toLocaleString("ja-JP")}G</span></div>}
    {stops.length > 0 && <div className="kv"><span>途中寄港</span><span>{stops.map(section => getPortById(section.toPortId).name).join(" → ")}</span></div>}
    {plan.hasFuelShortage && <p role="alert" style={{ color: "var(--red)", marginTop: 8 }}>目的地までの燃料が足りません。途中港への到達・補油も保証されません。</p>}
    {!plan.hasFuelShortage && unknownFuel && <p role="alert" style={{ color: "var(--red)", marginTop: 8 }}>必要燃料を算出できません。戻って計画を確認してください。</p>}
    {!plan.hasFuelShortage && !unknownFuel && lowReserve && <p role="status" style={{ color: "var(--gold)", marginTop: 8 }}>予備燃料が少ない区間があります。</p>}
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer" }}>計画の詳細</summary>
      <div className="kv"><span>重量・容積</span><span>{cargo?.weightLabel} ／ {cargo?.volumeLabel}</span></div>
      <div className="kv"><span>出港予定（積込後）</span><span>{date(plan.departureRealTime)}</span></div>
      <div className="kv"><span>計画距離</span><span>{plan.totalDistanceNm}海里</span></div>
      <div className="kv"><span>航海所要（現実時間・積込別）</span><span>{Math.floor(realMinutes / 60)}時間{realMinutes % 60}分</span></div>
      <p>現在燃料 {tons(ship.fuel?.remainingTons ?? null)} ／ 計画必要燃料 {tons(plan.totalRequiredFuelTons)} ／ 最終計画残量 {tons(plan.finalFuelTons)}</p>
      {plan.sections.map((section, index) => <section key={index} style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 8 }}>
        <h4>区間{index + 1}：{getPortById(route.sections[index].fromPortId).name} → {getPortById(route.sections[index].toPortId).name}</h4>
        <p>{section.distanceNm}海里 ／ 到着予定 {date(section.plannedArrivalRealTime)}</p>
        <p>必要燃料 {tons(section.requiredFuelTons)} ／ 到着残量 {tons(section.arrivalFuelTons)} ／ {labels[section.fuelAssessment]}</p>
        {index < plan.sections.length - 1 && <p>補油目標 {route.sections[index].refuelTargetPercent}% ／ 追加 {tons(section.refuelAddedTons)} ／ 補油後 {tons(section.departureAfterRefuelTons)}</p>}
        {index < plan.sections.length - 1 && <p>前払金 {fuelPrepayment.sections[index]?.prepaymentGold.toLocaleString("ja-JP") ?? "0"}G ／ 予想返金額 {fuelPrepayment.sections[index]?.estimatedRefundGold.toLocaleString("ja-JP") ?? "0"}G</p>}
      </section>)}
    </details>
    <p style={{ fontSize: 12, color: "var(--sub)", marginTop: 10 }}>到着時刻・燃料は計画値です。途中補油の余りは自動返金します。</p>
  </div>;
}
interface Props {
  initialReview: ConfirmedPlanReview;
  onConfirm: (review: ConfirmedPlanReview) => PlanAcceptanceResult | void;
  onCancel: () => void;
}
export function VoyagePlanConfirmation({ initialReview, onConfirm, onCancel }: Props) {
  const [review, setReview] = useState(initialReview);
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const locked = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  function confirm() {
    if (locked.current) return;
    locked.current = true;
    let accepted = false;
    try {
      const result = onConfirm(review);
      if (result?.kind === "reviewRequired") {
        setReview(result.review);
        setMessage("条件または表示時刻が変わりました。更新した計画を確認し、もう一度確定してください。まだ受注していません。");
        dialog.current?.focus();
      } else if (result?.kind === "accepted") {
        accepted = true; setFinished(true); setMessage("受注・保存が完了しました。");
      } else setMessage("受注条件を満たさなくなった可能性があります。編集へ戻り、提示・期限・船・燃料を確認してください。受注は成立していません。");
    } catch {
      setMessage("受注または保存に失敗しました。この確認画面は保持しています。保存状態を確認してから再試行してください。");
    } finally { if (!accepted) locked.current = false; }
  }
  return <div className="confirmation-overlay" style={{ zIndex: 1000 }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="confirmation-modal" style={{ maxHeight: "90vh", overflowY: "auto" }} onKeyDown={event => {
      if (event.key === "Escape" && !locked.current) { event.preventDefault(); onCancel(); }
      if (event.key === "Tab") {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <h3 id={titleId}>最終受注確認</h3>
      <VoyagePlanReviewDetails review={review} />
      <p role="status" aria-live="polite">{message}</p>
      <div className="confirmation-actions">
        <button type="button" className="btn btn-secondary" disabled={finished} onClick={onCancel}>戻って修正</button>
        <button type="button" className="btn btn-primary" disabled={finished} onClick={confirm}>{review.prediction.hasFuelShortage ? "燃料不足の警告を確認して受注を確定" : "この計画で受注"}</button>
      </div>
    </div>
  </div>;
}

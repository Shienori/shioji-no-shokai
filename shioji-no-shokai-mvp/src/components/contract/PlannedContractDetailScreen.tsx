import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ContractTemplate, Ship } from "../../domain/types";
import type { ConfirmedVoyageRoute } from "../../domain/voyagePlanTypes";
import type { ConfirmedPlanReview, PlanAcceptanceResult } from "../../domain/confirmedPlanReview";
import { createConfirmedPlanReview } from "../../domain/confirmedPlanReview";
import { calculateContractSchedule } from "../../domain/contractSchedule";
import { getCargoPresentation, getLotCapacityForDisplay } from "../../domain/cargoPresentation";
import { PLAN_FUEL_MESSAGES } from "../../domain/voyagePlanPrediction";
import { isSelectedSpeedWithinLimits } from "../../domain/voyageSpeedValidation";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";
import { getRouteById } from "../../data/routes";
import { getPortById } from "../../data/ports";
import { findShipperById } from "../../data/shippers";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { VoyageRouteEditor } from "./VoyageRouteEditor";
import { CapacityGauge } from "./CapacityGauge";
import { VoyagePlanReviewDetails } from "./VoyagePlanConfirmation";
import { PlanWeatherChart } from "../map/PlanWeatherChart";
import "../../styles/voyagePlanFlow.css";

type PlanStep = 1 | 2 | 3 | 4;
const steps = ["依頼詳細", "ルート編集／気象予測", "ETA・燃料確認", "最終確認"] as const;
export function getVoyagePlanNextStep(step: PlanStep, canProceed: boolean): PlanStep {
  return canProceed && step < 4 ? (step + 1) as PlanStep : step;
}
export function getVoyagePlanPreviousStep(step: PlanStep): PlanStep { return Math.max(1, step - 1) as PlanStep; }
const date = (time: number) => formatDateTime(ceilTo1Minute(time));
const tons = (value: number | null) => value === null ? "算出不可" : `${value.toLocaleString("ja-JP", { maximumFractionDigits: 6 })}t`;
const fuelLabels = { insufficient: "不足", lowReserve: "予備燃料僅少", sufficient: "充足", unreachable: "前区間不足のため算出不可" };
interface Props {
  offerId: string; contract: ContractTemplate; ships: Ship[]; eligibleShips: Ship[];
  acceptReason: string | null; offeredDeadlineAt: number | null;
  onAccept: (shipId: string, speed: number, review: ConfirmedPlanReview) => PlanAcceptanceResult | void;
  onClose: () => void;
}
export function PlannedContractDetailScreen({ offerId, contract, ships, eligibleShips, acceptReason, offeredDeadlineAt, onAccept, onClose }: Props) {
  const [step, setStep] = useState<PlanStep>(1);
  const [shipId, setShipId] = useState<string | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState<number | null>(null);
  const [route, setRoute] = useState<ConfirmedVoyageRoute | null>(null);
  const [routeEdited, setRouteEdited] = useState(false);
  const [baseTime, setBaseTime] = useState(() => Date.now());
  const [confirmation, setConfirmation] = useState<ConfirmedPlanReview | null>(null);
  const [message, setMessage] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [finished, setFinished] = useState(false);
  const locked = useRef(false);
  const dialog = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleRoute = useCallback((edited: boolean, value: ConfirmedVoyageRoute) => {
    setRoute(value); setRouteEdited(edited); setConfirmation(null); setMessage("");
  }, []);
  const ship = ships.find(item => item.id === shipId) ?? null;
  const speed = selectedSpeed ?? ship?.cruisingSpeedKnots;
  const endpoints = getRouteById(contract.routeId);
  const cargo = getCargoPresentation(contract);
  const preview = useMemo(() => {
    if (!ship || !route || speed === undefined) return null;
    try {
      const deadline = offeredDeadlineAt ?? calculateContractSchedule(contract, endpoints, baseTime).deadlineAt;
      return createConfirmedPlanReview(offerId, contract, ship, route, speed, baseTime, deadline);
    } catch { return null; }
  }, [offerId, contract, ship, route, speed, offeredDeadlineAt, endpoints, baseTime]);
  const canUseShip = ship !== null && ship.kind === "powered" && eligibleShips.some(item => item.id === ship.id) && (ship.fuel?.remainingTons ?? 0) > 0;
  const canConfirm = canUseShip && preview !== null && ship !== null && speed !== undefined && isSelectedSpeedWithinLimits(ship, speed);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) requestAnimationFrame(() => { if (previous.isConnected) previous.focus(); });
    };
  }, []);
  useEffect(() => { dialog.current?.focus(); body.current?.scrollTo({ top: 0 }); }, [step, discardOpen]);
  function requestClose() {
    if (locked.current || finished) return;
    if (shipId !== null || routeEdited || selectedSpeed !== null) setDiscardOpen(true);
    else onClose();
  }
  function back() { setStep(getVoyagePlanPreviousStep(step)); setConfirmation(null); setMessage(""); }
  function forward() {
    const next = getVoyagePlanNextStep(step, step === 1 ? canUseShip : canConfirm);
    if (next !== 4) { setStep(next); setMessage(""); return; }
    if (!preview || !ship || speed === undefined) return;
    try {
      const now = Date.now();
      const deadline = offeredDeadlineAt ?? calculateContractSchedule(contract, endpoints, now).deadlineAt;
      setConfirmation(createConfirmedPlanReview(offerId, contract, ship, preview.route, speed, now, deadline));
      setBaseTime(now); setStep(4); setMessage("");
    } catch { setMessage("最終確認を作成できません。提示・航路・船・燃料を確認してください。"); }
  }
  function confirm() {
    if (step !== 4 || !confirmation || locked.current) return;
    locked.current = true;
    let accepted = false;
    try {
      const result = onAccept(confirmation.shipId, confirmation.selectedSpeedKnots, confirmation);
      if (result?.kind === "reviewRequired") {
        setConfirmation(result.review); setBaseTime(result.review.baseRealTime);
        setMessage("条件または表示時刻が変わりました。更新した計画を確認し、もう一度確定してください。まだ受注していません。");
        body.current?.scrollTo({ top: 0 }); dialog.current?.focus();
      } else if (result?.kind === "accepted") {
        accepted = true; setFinished(true); setMessage("受注・保存が完了しました。");
      } else setMessage("受注条件を満たさなくなった可能性があります。戻って提示・期限・船・燃料を確認してください。受注は成立していません。");
    } catch { setMessage("受注または保存に失敗しました。編集内容は保持しています。保存状態を確認してから再試行してください。"); }
    finally { if (!accepted) locked.current = false; }
  }
  const plan = preview?.prediction;
  return <div className="voyage-flow-backdrop">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="voyage-flow" data-active-step={step} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); if (discardOpen) setDiscardOpen(false); else requestClose(); }
      if (event.key === "Tab") {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), [href], [tabindex="0"]') ?? []).filter(item => !item.closest("[hidden]"));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="voyage-flow-header">
        <div><h2 id={titleId}>{discardOpen ? "計画を閉じますか" : steps[step - 1]}</h2><p>{cargo?.cargo.name ?? "貨物情報確認不可"}の輸送依頼 ／ {step} / 4</p></div>
        <button type="button" className="btn btn-secondary" disabled={finished} onClick={requestClose}>閉じる</button>
        <ol aria-label="受注計画の4段階">{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}>{index + 1}. {label}</li>)}</ol>
      </header>
      <div ref={body} className="voyage-flow-body">
        {discardOpen && <section aria-label="編集内容の破棄確認"><h3>編集内容を破棄しますか？</h3><p>このウィンドウ内の船・航路・補油率・速力の編集内容を破棄して依頼板へ戻ります。まだ受注は行いません。</p></section>}
        <section className="voyage-flow-panel" data-flow-step="1" hidden={discardOpen || step !== 1}>
          <div className="card"><h3>依頼詳細</h3>
            <p>依頼主：{findShipperById(contract.shipperId)?.name ?? "不明な依頼主"}</p><p>{findShipperById(contract.shipperId)?.description}</p>
            <p>{cargo?.label ?? "貨物情報を確認できません"} ／ {cargo?.packagingLabel}</p><p>重量 {cargo?.weightLabel} ／ 容積 {cargo?.volumeLabel}</p>
            <p>{getPortById(endpoints.fromPortId).name} → {getPortById(endpoints.toPortId).name}</p>
            <p>提示報酬 {contract.offeredReward}G ／ 到着期限 {date(offeredDeadlineAt ?? calculateContractSchedule(contract, endpoints, baseTime).deadlineAt)}</p>
          </div>
          <div className="card"><h3>使用する船</h3><div className="ship-select-list">{ships.map(item => {
            const eligible = !!cargo && item.kind === "powered" && eligibleShips.some(candidate => candidate.id === item.id);
            const capacity = getLotCapacityForDisplay(item);
            return <button type="button" key={item.id} disabled={!eligible} className={`ship-select-item${shipId === item.id ? " selected" : ""}`} onClick={() => {
              if (shipId !== item.id) { setShipId(item.id); setSelectedSpeed(null); setBaseTime(Date.now()); setConfirmation(null); setMessage(""); }
            }}><span>{item.name} {!eligible && "（受注不可）"}</span>
              <CapacityGauge requiredLabel="必要貨物重量" maximumLabel="最大貨物重量" required={cargo?.requiredCargoWeight ?? 0} maximum={capacity?.maxCargoWeightTons ?? null} unit="t" />
              <CapacityGauge requiredLabel="必要貨物容積" maximumLabel="最大貨物容積" required={cargo?.requiredCargoVolume ?? 0} maximum={capacity?.maxCargoVolumeM3 ?? null} unit="m³" />
            </button>;
          })}</div></div>
          {!canUseShip && <p role="status">{acceptReason ?? "受注可能な船を選択してください。"}</p>}
        </section>
        <section className="voyage-flow-panel" data-flow-step="2" hidden={discardOpen || step !== 2}>
          <p>{selectedSpeed === null ? `速力は${ship?.cruisingSpeedKnots ?? "—"}ノット（巡航速力）を仮使用しています。次の段階で設定できます。` : `選択済みの設定速力${selectedSpeed}ノットで計画船位・気象評価を表示しています。`}</p>
          <VoyageRouteEditor departurePortId={endpoints.fromPortId} destinationPortId={endpoints.toPortId} onEditedChange={handleRoute} acceptanceEnabled />
          {preview && <PlanWeatherChart route={preview.route} baseRealTime={preview.baseRealTime} departureRealTime={preview.prediction.departureRealTime}
            plannedEtaRealTime={preview.prediction.plannedEtaRealTime} selectedSpeedKnots={preview.selectedSpeedKnots} forecastCapturedAt={preview.baseRealTime} ships={ship ? [ship] : []} />}
        </section>
        <section className="voyage-flow-panel" data-flow-step="3" hidden={discardOpen || step !== 3}>
          <div className="card"><h3>ETA・燃料計算の確認</h3>
            {ship && speed !== undefined && <><label htmlFor="planned-contract-speed">設定速力 {speed}ノット{selectedSpeed === null ? "（巡航速力）" : ""}</label>
              <input id="planned-contract-speed" type="range" min={ship.cruisingSpeedKnots} max={ship.maxSpeedKnots} step={1} value={speed} onChange={event => { setSelectedSpeed(Number(event.target.value)); setConfirmation(null); }} />
              <button type="button" onClick={() => { setBaseTime(Date.now()); setConfirmation(null); setMessage(""); }}>計画を更新</button></>}
            {plan && preview ? <>
              <p>{plan.notice}</p><p>計画距離 {plan.totalDistanceNm}海里 ／ 計画航海時間 {plan.totalVoyageHours.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}時間</p>
              <p>航海所要（現実時間・積込別）{Math.ceil(plan.totalVoyageHours * 60 / GAME_TIME_MULTIPLIER)}分 ／ 積込後の出港予定 {date(plan.departureRealTime)}</p>
              <div className="kv"><span>計画ETA（荷卸し前）</span><span>{date(plan.plannedEtaRealTime)}</span></div>
              <p>現在燃料 {tons(preview.ship.fuel?.remainingTons ?? null)} ／ 全行程必要燃料 {tons(plan.totalRequiredFuelTons)} ／ 最終計画残量 {tons(plan.finalFuelTons)}</p>
              {plan.sections.map((section, index) => <div key={index} className="card"><h4>区間{index + 1}：{getPortById(preview.route.sections[index].fromPortId).name} → {getPortById(preview.route.sections[index].toPortId).name}</h4>
                <p>開始 {tons(section.startingFuelTons)} ／ 必要 {tons(section.requiredFuelTons)} ／ 到着 {tons(section.arrivalFuelTons)}</p>
                <p>{fuelLabels[section.fuelAssessment]}：{section.fuelAssessment === "unreachable" ? "前区間不足のため残量・補油を算出しません。" : PLAN_FUEL_MESSAGES[section.fuelAssessment]}</p>
                {index < plan.sections.length - 1 && <p>補油目標{preview.route.sections[index].refuelTargetPercent}% ／ 追加 {tons(section.refuelAddedTons)} ／ 補油後 {tons(section.departureAfterRefuelTons)}</p>}
              </div>)}
              {plan.hasFuelShortage && <p role="alert">燃料不足があります。ETAは条件付きの計画時刻です。警告を確認したうえで最終確認へ進めます。</p>}
            </> : <p role="alert">航路・船・速力・燃料を確認してください。</p>}
            <p>速力を変更してルート編集へ戻ると、その速力で計画船位と気象評価を更新します。戻る操作では編集内容を保持します。</p>
          </div>
        </section>
        <section className="voyage-flow-panel" data-flow-step="4" hidden={discardOpen || step !== 4}>
          <h3>最終受注確認</h3>{confirmation && <VoyagePlanReviewDetails review={confirmation} />}
          <p>この段階の確定操作でのみ受注処理を呼び、保存成功後に船団画面へ移動します。</p>
        </section>
        {!discardOpen && <p role="status" aria-live="polite">{message}</p>}
      </div>
      <footer className="voyage-flow-footer">
        <div className="voyage-flow-actions" hidden={!discardOpen}><button type="button" className="btn btn-secondary" onClick={() => setDiscardOpen(false)}>編集を続ける</button><button type="button" className="btn btn-primary" onClick={onClose}>破棄して閉じる</button></div>
        <div className="voyage-flow-actions" hidden={discardOpen || step !== 1}><button type="button" className="btn btn-secondary" onClick={requestClose}>依頼板へ戻る</button><button type="button" className="btn btn-primary" disabled={!canUseShip || !cargo} onClick={forward}>ルート編集へ</button></div>
        <div className="voyage-flow-actions" hidden={discardOpen || step !== 2}><button type="button" className="btn btn-secondary" onClick={back}>依頼詳細へ戻る</button><button type="button" className="btn btn-primary" disabled={!canConfirm} onClick={forward}>ETA・燃料確認へ</button></div>
        <div className="voyage-flow-actions" hidden={discardOpen || step !== 3}><button type="button" className="btn btn-secondary" onClick={back}>ルート編集へ戻る</button><button type="button" className="btn btn-primary" disabled={!canConfirm} onClick={forward}>最終確認へ</button></div>
        <div className="voyage-flow-actions" hidden={discardOpen || step !== 4}><button type="button" className="btn btn-secondary" disabled={finished} onClick={back}>ETA・燃料確認へ戻る</button><button type="button" className="btn btn-primary" disabled={!confirmation || finished} onClick={confirm}>{confirmation?.prediction.hasFuelShortage ? "燃料不足の警告を確認して受注を確定" : "この計画で受注を確定"}</button></div>
      </footer>
    </div>
  </div>;
}

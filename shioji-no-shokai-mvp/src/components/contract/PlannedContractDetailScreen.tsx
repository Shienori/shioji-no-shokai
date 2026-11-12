import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ContractTemplate, Ship } from "../../domain/types";
import type { ConfirmedVoyageRoute } from "../../domain/voyagePlanTypes";
import type { ConfirmedPlanReview, PlanAcceptanceResult } from "../../domain/confirmedPlanReview";
import { createConfirmedPlanReview } from "../../domain/confirmedPlanReview";
import { calculateContractSchedule } from "../../domain/contractSchedule";
import { getCargoPresentation, getLotCapacityForDisplay } from "../../domain/cargoPresentation";
import { getCargoForContract } from "../../domain/lotContract";
import { isSelectedSpeedWithinLimits } from "../../domain/voyageSpeedValidation";
import { getRouteById } from "../../data/routes";
import { getPortById } from "../../data/ports";
import { findShipperById } from "../../data/shippers";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { useGameStore } from "../../state/gameStore";
import { VoyageRouteEditor } from "./VoyageRouteEditor";
import { CapacityGauge } from "./CapacityGauge";
import { VoyagePlanReviewDetails } from "./VoyagePlanConfirmation";
import { SpeedSelectionPanel, FuelCalculationPanel } from "./VoyagePlanCalculationPanel";
import "../../styles/voyagePlanFlow.css";

type PlanStep = 1 | 2 | 3;
const steps = ["依頼・船選択", "航海計画", "最終確認"] as const;
export function getVoyagePlanNextStep(step: PlanStep, canProceed: boolean): PlanStep {
  return canProceed && step < 3 ? (step + 1) as PlanStep : step;
}
export function getVoyagePlanPreviousStep(step: PlanStep): PlanStep { return Math.max(1, step - 1) as PlanStep; }
const date = (time: number) => formatDateTime(ceilTo1Minute(time));

export function PlannedContractDetailScreen({ offerId, contract, ships, eligibleShips, acceptReason, offeredDeadlineAt, onAccept, onClose }: Props) {
  const money = useGameStore(state => state.gameState.money);
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
  const autoRefuelParams = ship && speed !== undefined ? {
    ship,
    speed,
    baseRealTime: baseTime,
    loadingDurationOperationMs: (getCargoForContract(contract)?.loadingTimeMsPerUnit ?? 0) * contract.quantity,
  } : undefined;
  const preview = useMemo(() => {
    if (!ship || !route || speed === undefined) return null;
    try {
      const deadline = offeredDeadlineAt ?? calculateContractSchedule(contract, endpoints, baseTime).deadlineAt;
      return createConfirmedPlanReview(offerId, contract, ship, route, speed, baseTime, deadline);
    } catch { return null; }
  }, [offerId, contract, ship, route, speed, offeredDeadlineAt, endpoints, baseTime]);
  const canUseShip = ship !== null && ship.kind === "powered" && eligibleShips.some(item => item.id === ship.id) && (ship.fuel?.remainingTons ?? 0) > 0;
  const canConfirm = canUseShip && preview !== null && ship !== null && speed !== undefined && (speed === ship.cruisingSpeedKnots || speed === ship.maxSpeedKnots) && isSelectedSpeedWithinLimits(ship, speed);
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
    if (next === step) return;
    if (next !== 3) { setStep(next); setMessage(""); return; }
    if (!preview || !ship || speed === undefined) return;
    try {
      const now = Date.now();
      const deadline = offeredDeadlineAt ?? calculateContractSchedule(contract, endpoints, now).deadlineAt;
      setConfirmation(createConfirmedPlanReview(offerId, contract, ship, preview.route, speed, now, deadline));
      setBaseTime(now); setStep(3); setMessage("");
    } catch { setMessage("最終確認を作成できません。提示・航路・船・燃料を確認してください。"); }
  }
  function confirm() {
    if (step !== 3 || !confirmation || locked.current) return;
    locked.current = true;
    let accepted = false;
    try {
      const result = onAccept(confirmation.shipId, confirmation.selectedSpeedKnots, confirmation);
      if (result?.kind === "reviewRequired") {
        setConfirmation(result.review); setBaseTime(result.review.baseRealTime);
        setMessage("条件が変わりました。更新した計画を確認し、もう一度確定してください。まだ受注していません。");
        body.current?.scrollTo({ top: 0 }); dialog.current?.focus();
      } else if (result?.kind === "accepted") {
        accepted = true; setFinished(true); setMessage("受注・保存が完了しました。");
      } else setMessage("受注条件を確認してください。受注は成立していません。");
    } catch { setMessage("受注または保存に失敗しました。編集内容は保持しています。保存状態を確認してから再試行してください。"); }
    finally { if (!accepted) locked.current = false; }
  }
  return <div className="voyage-flow-backdrop">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="voyage-flow" data-active-step={step} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); if (discardOpen) setDiscardOpen(false); else requestClose(); }
      if (event.key === "Tab") {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), [href], [tabindex="0"]') ?? []).filter(item => item.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header className="voyage-flow-header">
        <div><h2 id={titleId}>{discardOpen ? "計画を閉じますか" : steps[step - 1]}</h2><p>{cargo?.cargo.name ?? "貨物情報確認不可"}の輸送依頼 ／ {step} / 3</p></div>
        <button type="button" className="btn btn-secondary" disabled={finished} onClick={requestClose}>閉じる</button>
        <ol aria-label="受注計画の3段階">{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}>{index + 1}. {label}</li>)}</ol>
      </header>
      <div ref={body} className="voyage-flow-body">
        {discardOpen && <section aria-label="編集内容の破棄確認"><h3>編集内容を破棄しますか？</h3><p>船・航路・補油設定・速力を破棄して依頼板へ戻ります。まだ受注していません。</p></section>}
        <section className="voyage-flow-panel" data-flow-step="1" hidden={discardOpen || step !== 1}>
          <div className="card"><h3>依頼詳細</h3>
            <p>依頼主：{findShipperById(contract.shipperId)?.name ?? "不明な依頼主"}</p>
            <details><summary>依頼主について</summary><p>{findShipperById(contract.shipperId)?.description}</p></details>
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
          <VoyageRouteEditor departurePortId={endpoints.fromPortId} destinationPortId={endpoints.toPortId} onEditedChange={handleRoute} acceptanceEnabled autoRefuelParams={autoRefuelParams} />
          {ship && speed !== undefined && <SpeedSelectionPanel ship={ship} speed={speed} onSpeedChange={value => { setSelectedSpeed(value); setConfirmation(null); setMessage(""); }} />}
          {ship && speed !== undefined && <FuelCalculationPanel ship={ship} speed={speed} review={preview} money={money} onRefresh={() => { setBaseTime(Date.now()); setConfirmation(null); setMessage(""); }} />}
        </section>
        <section className="voyage-flow-panel" data-flow-step="3" hidden={discardOpen || step !== 3}>
          <h3>最終受注確認</h3>{confirmation && <><p>速力：{confirmation.selectedSpeedKnots === confirmation.ship.cruisingSpeedKnots ? "ECO" : "MAX"} · {confirmation.selectedSpeedKnots}ノット</p><VoyagePlanReviewDetails review={confirmation} money={money} /></>}
        </section>
        {!discardOpen && <p role="status" aria-live="polite">{message}</p>}
      </div>
      <footer className="voyage-flow-footer">
        <div className="voyage-flow-actions" hidden={!discardOpen}><button type="button" className="btn btn-secondary" onClick={() => setDiscardOpen(false)}>編集を続ける</button><button type="button" className="btn btn-primary" onClick={onClose}>破棄して閉じる</button></div>
        <div className="voyage-flow-actions" hidden={discardOpen || step !== 1}><button type="button" className="btn btn-secondary" onClick={requestClose}>依頼板へ戻る</button><button type="button" className="btn btn-primary" disabled={!canUseShip || !cargo} onClick={forward}>航海計画へ</button></div>
        <div className="voyage-flow-actions" hidden={discardOpen || step !== 2}><button type="button" className="btn btn-secondary" onClick={back}>依頼詳細へ戻る</button><button type="button" className="btn btn-primary" disabled={!canConfirm} onClick={forward}>最終確認へ</button></div>
        <div className="voyage-flow-actions" hidden={discardOpen || step !== 3}><button type="button" className="btn btn-secondary" disabled={finished} onClick={back}>航海計画へ戻る</button><button type="button" className="btn btn-primary" disabled={!confirmation || finished} onClick={confirm}>{confirmation?.prediction.hasFuelShortage ? "燃料不足の警告を確認して受注を確定" : "この計画で受注を確定"}</button></div>
      </footer>
    </div>
  </div>;
}

interface Props {
  offerId: string; contract: ContractTemplate; ships: Ship[]; eligibleShips: Ship[];
  acceptReason: string | null; offeredDeadlineAt: number | null;
  onAccept: (shipId: string, speed: number, review: ConfirmedPlanReview) => PlanAcceptanceResult | void;
  onClose: () => void;
}
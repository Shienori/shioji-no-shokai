import { useCallback, useMemo, useState } from "react";
import type { ContractTemplate, Ship } from "../../domain/types";
import type { ConfirmedVoyageRoute } from "../../domain/voyagePlanTypes";
import type { ConfirmedPlanReview, PlanAcceptanceResult } from "../../domain/confirmedPlanReview";
import { createConfirmedPlanReview } from "../../domain/confirmedPlanReview";
import { calculateContractSchedule } from "../../domain/contractSchedule";
import { getCargoPresentation, getLotCapacityForDisplay } from "../../domain/cargoPresentation";
import { isSelectedSpeedWithinLimits } from "../../domain/voyageSpeedValidation";
import { getRouteById } from "../../data/routes";
import { getPortById } from "../../data/ports";
import { findShipperById } from "../../data/shippers";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { VoyageRouteEditor } from "./VoyageRouteEditor";
import { CapacityGauge } from "./CapacityGauge";
import { VoyagePlanConfirmation, VoyagePlanReviewDetails } from "./VoyagePlanConfirmation";

interface Props {
  offerId: string;
  contract: ContractTemplate;
  ships: Ship[];
  eligibleShips: Ship[];
  acceptReason: string | null;
  offeredDeadlineAt: number | null;
  onAccept: (shipId: string, speed: number, review: ConfirmedPlanReview) => PlanAcceptanceResult | void;
  onClose: () => void;
}
export function PlannedContractDetailScreen({ offerId, contract, ships, eligibleShips, acceptReason, offeredDeadlineAt, onAccept, onClose }: Props) {
  const [shipId, setShipId] = useState<string | null>(null);
  const [selectedSpeed, setSelectedSpeed] = useState<number | null>(null);
  const [route, setRoute] = useState<ConfirmedVoyageRoute | null>(null);
  const [baseTime, setBaseTime] = useState(() => Date.now());
  const [confirmation, setConfirmation] = useState<ConfirmedPlanReview | null>(null);
  const [error, setError] = useState("");
  const handleRoute = useCallback((_edited: boolean, value: ConfirmedVoyageRoute) => {
    setRoute(value); setConfirmation(null); setError("");
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
  const canConfirm = preview !== null && ship !== null && ship.kind === "powered" &&
    eligibleShips.some(item => item.id === ship.id) && speed !== undefined && isSelectedSpeedWithinLimits(ship, speed) &&
    (ship.fuel?.remainingTons ?? 0) > 0;
  function openConfirmation() {
    if (!canConfirm || !preview || !ship || speed === undefined) return;
    try {
      const now = Date.now();
      const deadline = offeredDeadlineAt ?? calculateContractSchedule(contract, endpoints, now).deadlineAt;
      const fresh = createConfirmedPlanReview(offerId, contract, ship, preview.route, speed, now, deadline);
      setBaseTime(now); setConfirmation(fresh); setError("");
    } catch { setError("最終確認を作成できません。提示・航路・船・燃料を確認してください。"); }
  }
  if (!cargo) return <div className="contract-detail-screen"><p role="alert">貨物情報を確認できません。</p><button type="button" onClick={onClose}>戻る</button></div>;
  return <div className="contract-detail-screen">
    <div aria-hidden={confirmation ? true : undefined} style={confirmation ? { pointerEvents: "none" } : undefined}>
      <header className="detail-header"><button type="button" className="back-btn" disabled={!!confirmation} onClick={onClose}>← 戻る</button><h2>{cargo.cargo.name}の輸送依頼</h2></header>
      <div className="detail-body">
        <section className="card detail-card"><h3>依頼確認</h3>
          <p>依頼主：{findShipperById(contract.shipperId)?.name ?? "不明な依頼主"}</p>
          <p>{findShipperById(contract.shipperId)?.description}</p>
          <p>{cargo.label} ／ {cargo.packagingLabel} ／ {cargo.weightLabel} ／ {cargo.volumeLabel}</p>
          <p>{getPortById(endpoints.fromPortId).name} → {getPortById(endpoints.toPortId).name} ／ 提示報酬 {contract.offeredReward}G</p>
          {offeredDeadlineAt !== null && <p>到着期限 {formatDateTime(ceilTo1Minute(offeredDeadlineAt))}</p>}
          <p>v8の新保存方式を使用します。受注確定前は燃料・所持金・保存データを変更しません。</p>
        </section>
        <section className="card detail-card"><h3>使用する船</h3>
          <div className="ship-select-list">{ships.map(item => {
            const eligible = item.kind === "powered" && eligibleShips.some(candidate => candidate.id === item.id);
            const capacity = getLotCapacityForDisplay(item);
            return <button type="button" key={item.id} disabled={!eligible} className={`ship-select-item${shipId === item.id ? " selected" : ""}`} onClick={() => {
              setShipId(item.id); setSelectedSpeed(item.cruisingSpeedKnots); setBaseTime(Date.now()); setConfirmation(null); setError("");
            }}><span>{item.name} {!eligible && "（受注不可）"}</span>
              <CapacityGauge requiredLabel="必要貨物重量" maximumLabel="最大貨物重量" required={cargo.requiredCargoWeight} maximum={capacity?.maxCargoWeightTons ?? null} unit="t" />
              <CapacityGauge requiredLabel="必要貨物容積" maximumLabel="最大貨物容積" required={cargo.requiredCargoVolume} maximum={capacity?.maxCargoVolumeM3 ?? null} unit="m³" />
            </button>;
          })}</div>
        </section>
        <VoyageRouteEditor departurePortId={endpoints.fromPortId} destinationPortId={endpoints.toPortId} onEditedChange={handleRoute} acceptanceEnabled />
        <section className="card detail-card"><h3>航海計画2：速力・時間・燃料</h3>
          {ship && speed !== undefined && <div>
            <label htmlFor="planned-contract-speed">設定速力 {speed}ノット</label>
            <input id="planned-contract-speed" type="range" min={ship.cruisingSpeedKnots} max={ship.maxSpeedKnots} step={1} value={speed} style={{ width: "100%" }} onChange={event => { setSelectedSpeed(Number(event.target.value)); setConfirmation(null); }} />
            <button type="button" onClick={() => { setBaseTime(Date.now()); setConfirmation(null); }}>計画を更新</button>
          </div>}
          {preview ? <VoyagePlanReviewDetails review={preview} /> : <p>{ship ? "計画を計算できません。航路・速力・燃料を確認してください。" : "船を選択すると計画ETAと燃料試算を表示します。"}</p>}
          <p>航路・速力・補油率の変更では基準時刻を固定します。最終確認を開く際は現在時刻から再計算します。</p>
        </section>
      </div>
      <footer className="detail-footer">
        {!canConfirm && acceptReason && <p className="accept-reason">{acceptReason}</p>}
        <p role="alert">{error}</p>
        <button type="button" className="btn btn-primary" disabled={!canConfirm || !!confirmation} onClick={openConfirmation}>最終確認へ</button>
        <button type="button" className="btn btn-secondary" disabled={!!confirmation} onClick={onClose}>依頼板へ戻る</button>
      </footer>
    </div>
    {confirmation && <VoyagePlanConfirmation initialReview={confirmation} onCancel={() => setConfirmation(null)} onConfirm={review => onAccept(review.shipId, review.selectedSpeedKnots, review)} />}
  </div>;
}

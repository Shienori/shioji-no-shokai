import { useCallback, useMemo, useState } from "react";
import type { ContractTemplate, Ship } from "../../domain/types";
import type { ConfirmedVoyageRoute } from "../../domain/voyagePlanTypes";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoPresentation, getLotCapacityForDisplay, getCargoFitForShip } from "../../domain/cargoPresentation";
import { findShipperById } from "../../data/shippers";
import { getHexById } from "../../data/hexMap";
import { getRouteHexIds } from "../../domain/routePath";
import { calculateEstimatedArrivalAt } from "../../domain/seaCondition";
import { getContractSchedule } from "../../domain/contractOffer";
import { calculateExpense } from "../../domain/reward";
import { getHeavyLoadSpeedFactor } from "../../domain/voyage";
import { isSelectedSpeedWithinLimits } from "../../domain/voyageSpeedValidation";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { createContractWindForecast } from "../../domain/contractWindForecast";
import { prepareContractWindPreview, formatContractPreviewEta } from "../../domain/contractWindPreview";
import { ForecastMap } from "../map/ForecastMap";
import { UnifiedWindFuelSummary } from "./UnifiedWindFuelSummary";
import { CapacityGauge } from "./CapacityGauge";
import { RouteSeaConditionTab } from "./RouteSeaConditionTab";
import { FuelTrialPanel } from "./FuelTrialPanel";
import { VoyageRouteEditor } from "./VoyageRouteEditor";
import { VoyagePlanSummary } from "./VoyagePlanSummary";

interface ContractDetailScreenProps {
  contract: ContractTemplate | null;
  ships: Ship[];
  eligibleShips: Ship[];
  acceptReason: string | null;
  offeredDeadlineAt: number | null;
  onAccept: (shipId: string, selectedSpeedKnots: number) => void;
  onClose: () => void;
}
export function ContractDetailScreen(props: ContractDetailScreenProps) {
  return <ContractDetail key={props.contract?.id ?? "none"} {...props} />;
}
function formatMargin(hours: number) {
  const totalMinutes = Math.max(0, Math.floor(hours * 60));
  const hourPart = Math.floor(totalMinutes / 60);
  const minutePart = totalMinutes % 60;
  if (hourPart > 0) return `${hourPart}時間${minutePart}分`;
  return `${minutePart}分`;
}
function ContractDetail({ contract, ships, eligibleShips, acceptReason, offeredDeadlineAt, onAccept, onClose }: ContractDetailScreenProps) {
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [selectedSpeedKnots, setSelectedSpeedKnots] = useState<number | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [hasEditedRoute, setHasEditedRoute] = useState(false);
  const [plannedRoute, setPlannedRoute] = useState<ConfirmedVoyageRoute | null>(null);
  const handleRouteChange = useCallback((edited: boolean, confirmedRoute: ConfirmedVoyageRoute) => {
    setHasEditedRoute(edited); setPlannedRoute(confirmedRoute); setShowConfirmation(false);
  }, []);
  const [departureAt, setDepartureAt] = useState(() => Date.now());
  const route = contract ? getRouteById(contract.routeId) : null;
  const selectedShip = ships.find((ship) => ship.id === selectedShipId) ?? null;
  const seaHexIds = useMemo(() => route ? (getRouteHexIds(route.fromPortId, route.toPortId) ?? []).filter((id) => getHexById(id).kind === "sea") : [], [route]);
  const speed = selectedShip ? selectedSpeedKnots ?? selectedShip.cruisingSpeedKnots : undefined;
  // Calculation copy only: the actual ship specification is never edited here.
  const previewShip = useMemo(() => selectedShip && speed !== undefined ? { ...selectedShip, cruisingSpeedKnots: speed } : null, [selectedShip, speed]);
  const forecast = useMemo(() => {
    try { return route ? createContractWindForecast(route, departureAt) : null; } catch { return null; }
  }, [route, departureAt]);
  const previews = useMemo(() => new Map(ships.filter(ship => ship.kind === "powered").map(ship => [ship.id,
    contract ? prepareContractWindPreview(contract, ship, ship.id === selectedShipId ? speed ?? ship.cruisingSpeedKnots : ship.cruisingSpeedKnots, departureAt, forecast) : { kind: "unavailable" as const, message: "依頼を選択してください。" },
  ])), [ships, contract, selectedShipId, speed, departureAt, forecast]);
  const numericPreview = selectedShip?.kind === "powered" ? previews.get(selectedShip.id) ?? null : null;
  const estimatedArrivalAt = useMemo(() => selectedShip?.kind === "powered"
    ? numericPreview?.kind === "ready" ? numericPreview.prediction.etaRealTime : null
    : speed && seaHexIds.length > 0 && selectedShip && contract ? calculateEstimatedArrivalAt(seaHexIds, departureAt, speed * getHeavyLoadSpeedFactor(contract, selectedShip)) : null,
  [numericPreview, seaHexIds, departureAt, speed, selectedShip, contract]);
  const etaLabel = selectedShip?.kind === "powered" ? formatContractPreviewEta(numericPreview) : estimatedArrivalAt === null ? "—" : formatDateTime(ceilTo1Minute(estimatedArrivalAt));
  if (!contract || !route) return null;
  const display = getCargoPresentation(contract);
  if (!display) return <div className="contract-detail-screen"><p role="alert">貨物の数量・単位データを確認できません。</p><button className="btn btn-secondary" type="button" onClick={onClose}>戻る</button></div>;
  const cargo = display.cargo;
  const shipper = findShipperById(contract.shipperId);
  const requesterName = shipper?.name ?? "不明な依頼主";
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const expense = calculateExpense(contract.offeredReward);
  const netProfit = contract.offeredReward - expense;
  const deadlineLabel = formatDateTime(offeredDeadlineAt ?? getContractSchedule(contract, route, departureAt).deadlineAt);
  const { requiredCargoVolume, requiredCargoWeight } = display;
  const validSpeed = selectedShip !== null && speed !== undefined &&
    isSelectedSpeedWithinLimits(selectedShip, speed) &&
    (selectedShip.kind === "powered" || speed === selectedShip.cruisingSpeedKnots);
  const canAccept = !hasEditedRoute && eligibleShips.some((ship) => ship.id === selectedShipId) && validSpeed;
  const getSuitability = (ship: Ship) => {
    if (hasEditedRoute) return { label: "編集航路は下の計画値を確認", color: "#64748b", background: "#f1f5f9" };
    if (!eligibleShips.some((item) => item.id === ship.id)) {
      return { label: "受注不可", color: "#64748b", background: "#f1f5f9" };
    }
    const setting = ship.id === selectedShipId ? speed ?? ship.cruisingSpeedKnots : ship.cruisingSpeedKnots;
    const candidate = previews.get(ship.id);
    const shipEta = ship.kind === "powered" ? candidate?.kind === "ready" ? candidate.prediction.etaRealTime : null : seaHexIds.length > 0
      ? calculateEstimatedArrivalAt(seaHexIds, departureAt, setting * getHeavyLoadSpeedFactor(contract, ship)) : null;
    if (ship.kind === "powered" && shipEta === null) return { label: "ETA予測不可", color: "#64748b", background: "#f1f5f9" };
    const etaMarginHours = shipEta !== null && offeredDeadlineAt !== null ? (offeredDeadlineAt - shipEta) / 3600000 : null;
    const marginLabel = etaMarginHours === null ? "" : `（余裕 ${formatMargin(etaMarginHours)}）`;
    if (etaMarginHours !== null && etaMarginHours > 2) return { label: `余裕あり${marginLabel}`, color: "#166534", background: "#dcfce7" };
    if (etaMarginHours !== null && etaMarginHours >= 0.5) return { label: `注意${marginLabel}`, color: "#92400e", background: "#fef3c7" };
    return { label: `ぎりぎり${marginLabel}`, color: "#991b1b", background: "#fee2e2" };
  };
  const getCargoFitReason = (ship: Ship) => {
    const fit = getCargoFitForShip(contract, ship);
    if (!fit) return { label: "判定不可", color: "#64748b", background: "#f1f5f9" };
    if (fit.canCarry) return { label: "この船で運べます", color: "#166534", background: "#dcfce7" };
    const reasons: string[] = [];
    if (!fit.weightOk) reasons.push(`重量超過 ${fit.weightExcess.toFixed(2)}t`);
    if (!fit.volumeOk) reasons.push(`容積不足 ${fit.volumeExcess.toFixed(2)}m³`);
    return { label: `この船では運べません（${reasons.join("、")}）`, color: "#991b1b", background: "#fee2e2" };
  };
  return <div className="contract-detail-screen">
    <header className="detail-header">
      <button className="back-btn" onClick={onClose}>← 戻る</button>
      <h2>{cargo.name}の輸送依頼</h2>
    </header>
    <div className="detail-body">
      <section className="detail-tab-panel"><div className="card detail-card">
        <h3>依頼</h3>
        <div className="kv"><span>依頼主</span><span>{requesterName}</span></div>
        {shipper?.description && <p style={{ margin: "8px 0", fontSize: 12, lineHeight: 1.6, color: "var(--sub)" }}>{shipper.description}</p>}
        <div className="kv"><span>貨物</span><span>{display.label}</span></div>
        <div className="kv"><span>荷姿</span><span>{display.packagingLabel}</span></div>
        <div className="kv"><span>航路</span><span>{fromPort.name} → {toPort.name}</span></div>
        <div className="kv"><span>最短距離</span><span>{route.distance}海里</span></div>
        <div className="requirement-grid">
          <div className="requirement-item"><span className="requirement-label">必要貨物容積</span><span className="requirement-value">{display.volumeLabel}</span></div>
          <div className="requirement-item"><span className="requirement-label">必要貨物重量</span><span className="requirement-value">{display.weightLabel}</span></div>
        </div>
        <div className="kv"><span>到着期限</span><span>{deadlineLabel}</span></div>
        <div className="reward-row">
          <div className="reward-item"><div className="label">提示報酬</div><div className="value">{contract.offeredReward}G</div></div>
          <div className="reward-item net"><div className="label">見込純利益</div><div className="value">{netProfit}G</div></div>
        </div>
        <div className="kv"><span>経費</span><span>-{expense}G</span></div>
      </div></section>
      <VoyageRouteEditor departurePortId={route.fromPortId} destinationPortId={route.toPortId} onEditedChange={handleRouteChange} />
      <section className="detail-tab-panel"><div className="card detail-card ship-select-card">
        <h3>船</h3>
        <div className="ship-select-list">{ships.map((ship) => {
          const isEligible = eligibleShips.some((item) => item.id === ship.id);
          const suitability = getSuitability(ship);
          const capacity = getLotCapacityForDisplay(ship);
          const isHeavyLoad = isEligible && getHeavyLoadSpeedFactor(contract, ship) === 0.9;
          const cargoFit = getCargoFitReason(ship);
          return <button key={ship.id} type="button" className={`ship-select-item${isEligible ? " eligible" : ""}${selectedShipId === ship.id ? " selected" : ""}`} disabled={!isEligible} onClick={() => {
            if (selectedShipId !== ship.id) { setSelectedShipId(ship.id); setSelectedSpeedKnots(ship.cruisingSpeedKnots); setDepartureAt(Date.now()); setShowConfirmation(false); }
          }}>
            <span className="ship-select-name">
              {ship.name}
              <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999, fontSize: 12, color: cargoFit.color, background: cargoFit.background }}>{cargoFit.label}</span>
              {isHeavyLoad && <span style={{ marginLeft: 6, fontSize: 12, color: "#92400e" }}>貨物重量90%以上：速度-10%</span>}
            </span>
            <CapacityGauge requiredLabel="必要貨物容積" maximumLabel="最大貨物容積" required={requiredCargoVolume} maximum={capacity?.maxCargoVolumeM3 ?? null} unit="m³" />
            <CapacityGauge requiredLabel="必要貨物重量" maximumLabel="最大貨物重量" required={requiredCargoWeight} maximum={capacity?.maxCargoWeightTons ?? null} unit="t" />
            {!capacity && <span>新ロット方式の積載上限が未設定です</span>}
          </button>;
        })}</div>
        {selectedShip?.kind === "powered" && <div style={{ marginTop: 12 }}>
          <label htmlFor="voyage-speed-setting">設定速力：{speed}ノット</label>
          <input id="voyage-speed-setting" type="range" min={selectedShip.cruisingSpeedKnots} max={selectedShip.maxSpeedKnots} step={1}
            value={speed ?? selectedShip.cruisingSpeedKnots} style={{ width: "100%" }} aria-valuetext={`${speed}ノット`}
            onChange={(event) => { setSelectedSpeedKnots(Number(event.target.value)); setShowConfirmation(false); }} />
          <p style={{ fontSize: 12, lineHeight: 1.6 }}>巡航{selectedShip.cruisingSpeedKnots}〜連続最大{selectedShip.maxSpeedKnots}ノットを1ノット刻みで選択します。速力を上げると毎時の石炭消費が増えます。受注確定後は今回の航海設定として固定します。</p>
          <button type="button" onClick={() => { setDepartureAt(Date.now()); setShowConfirmation(false); }}>{hasEditedRoute ? "計画を更新" : "予報・試算を更新"}</button>
        </div>}
        {hasEditedRoute ? plannedRoute ? <VoyagePlanSummary contract={contract} route={plannedRoute} ship={selectedShip} selectedSpeedKnots={speed} baseRealTime={departureAt} /> : <p>編集航路を確認中です。</p> : selectedShip?.kind === "powered" ? <UnifiedWindFuelSummary preview={numericPreview} /> : previewShip ? <FuelTrialPanel key={`${previewShip.id}:${departureAt}`} route={route} ship={previewShip} departureAt={departureAt} loadSpeedFactor={getHeavyLoadSpeedFactor(contract, previewShip)} selectedSpeedKnots={speed} /> : <p>船を選択すると、速力設定と石炭予測が表示されます。</p>}
      </div></section>
      {!hasEditedRoute && <section className="detail-tab-panel chart-tab-panel"><div className="chart-fullscreen">
        {selectedShip?.kind === "powered" && numericPreview ? <ForecastMap key={`${selectedShip.id}:${departureAt}:${speed}`} ships={[selectedShip]} voyage={null} contract={null} currentRealTime={departureAt} preview={numericPreview} /> : <RouteSeaConditionTab routeId={contract.routeId} fromPortId={route.fromPortId} toPortId={route.toPortId} selectedShip={previewShip} departureAt={departureAt} estimatedArrivalAt={estimatedArrivalAt} etaLabel={etaLabel} />}
      </div></section>}
    </div>
    <footer className="detail-footer">
      {hasEditedRoute && <p role="status">航路編集の試用中です。編集航路での受注はまだできません。</p>}
      {acceptReason && <p className="accept-reason">{acceptReason}</p>}
      <button className={`btn ${canAccept ? "btn-primary" : "btn-secondary"}`} disabled={!canAccept} onClick={() => { setDepartureAt(Date.now()); setShowConfirmation(true); }}>{hasEditedRoute ? "編集航路の受注は未接続" : selectedShipId ? "受注する" : "船を選択してください"}</button>
      <button className="btn btn-secondary" onClick={onClose}>断る</button>
    </footer>
    {showConfirmation && !hasEditedRoute && selectedShip && <div className="confirmation-overlay"><div className="confirmation-modal">
      <h3>受注内容の確認</h3>
      <div className="kv"><span>依頼主</span><span>{requesterName}</span></div>
      <div className="kv"><span>貨物</span><span>{display.label}</span></div>
      <div className="kv"><span>貨物重量</span><span>{display.weightLabel}</span></div>
      <div className="kv"><span>貨物容積</span><span>{display.volumeLabel}</span></div>
      <div className="kv"><span>航路</span><span>{fromPort.name} → {toPort.name}</span></div>
      <div className="kv"><span>船</span><span>{selectedShip.name}</span></div>
      <div className="kv"><span>設定速力</span><span>{speed}ノット</span></div>
      <div className="kv"><span>ETA</span><span>{etaLabel}</span></div>
      {selectedShip.kind === "powered" && <p>積込後に出港し、港へ到着する時刻の予測です（荷卸し前）。閲覧用で、受注時に保存する記録ETAの変更は今回含みません。</p>}
      <div className="kv"><span>到着期限</span><span>{deadlineLabel}</span></div>
      <div className="kv"><span>提示報酬</span><span>{contract.offeredReward}G</span></div>
      <div className="confirmation-actions">
        <button className="btn btn-secondary" type="button" onClick={() => setShowConfirmation(false)}>キャンセル</button>
        <button className="btn btn-primary" type="button" disabled={!canAccept} onClick={() => onAccept(selectedShip.id, speed ?? selectedShip.cruisingSpeedKnots)}>受注する</button>
      </div>
    </div></div>}
  </div>;
}

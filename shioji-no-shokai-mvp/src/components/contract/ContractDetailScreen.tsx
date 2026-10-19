import { useMemo, useState } from "react";
import type { ContractTemplate, Ship } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { getHexById } from "../../data/hexMap";
import { getRouteHexIds } from "../../domain/routePath";
import { calculateEstimatedArrivalAt } from "../../domain/seaCondition";
import { getContractCargoRequirements, getContractSchedule } from "../../domain/contractOffer";
import { calculateExpense } from "../../domain/reward";
import { getHeavyLoadSpeedFactor } from "../../domain/voyage";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { CapacityGauge } from "./CapacityGauge";
import { RouteSeaConditionTab } from "./RouteSeaConditionTab";

interface ContractDetailScreenProps {
  contract: ContractTemplate | null;
  ships: Ship[];
  eligibleShips: Ship[];
  acceptReason: string | null;
  offeredDeadlineAt: number | null;
  onAccept: (shipId: string) => void;
  onClose: () => void;
}
export function ContractDetailScreen(props: ContractDetailScreenProps) {
  return <ContractDetail key={props.contract?.id ?? "none"} {...props} />;
}
function ContractDetail({ contract, ships, eligibleShips, acceptReason, offeredDeadlineAt, onAccept, onClose }: ContractDetailScreenProps) {
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [departureAt, setDepartureAt] = useState(() => Date.now());
  const route = contract ? getRouteById(contract.routeId) : null;
  const selectedShip = ships.find((ship) => ship.id === selectedShipId) ?? null;
  const seaHexIds = useMemo(() => route ? (getRouteHexIds(route.fromPortId, route.toPortId) ?? []).filter((id) => getHexById(id).kind === "sea") : [], [route]);
  const speed = selectedShip?.cruisingSpeedKnots;
  const estimatedArrivalAt = useMemo(() => speed && seaHexIds.length > 0 && selectedShip && contract ? calculateEstimatedArrivalAt(seaHexIds, departureAt, speed * getHeavyLoadSpeedFactor(contract, selectedShip)) : null, [seaHexIds, departureAt, speed, selectedShip, contract]);
  const etaLabel = estimatedArrivalAt === null ? "—" : formatDateTime(ceilTo1Minute(estimatedArrivalAt));
  if (!contract || !route) return null;
  const cargo = getCargoById(contract.cargoId);
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const expense = calculateExpense(contract.offeredReward);
  const netProfit = contract.offeredReward - expense;
  const deadlineLabel = formatDateTime(offeredDeadlineAt ?? getContractSchedule(contract, route, departureAt).deadlineAt);
  const { requiredCargoVolume, requiredCargoWeight } = getContractCargoRequirements(contract, cargo);
  const canAccept = eligibleShips.some((ship) => ship.id === selectedShipId);
  const getSuitability = (ship: Ship) => {
    if (!eligibleShips.some((item) => item.id === ship.id)) {
      return { label: "受注不可", color: "#64748b", background: "#f1f5f9" };
    }
    const shipEta = seaHexIds.length > 0
      ? calculateEstimatedArrivalAt(seaHexIds, departureAt, ship.cruisingSpeedKnots * getHeavyLoadSpeedFactor(contract, ship))
      : null;
    const etaMarginHours = shipEta !== null && offeredDeadlineAt !== null
      ? (offeredDeadlineAt - shipEta) / 3600000
      : null;
    if (etaMarginHours !== null && etaMarginHours >= 2) {
      return { label: "余裕あり", color: "#166534", background: "#dcfce7" };
    }
    if (etaMarginHours !== null && etaMarginHours >= 0.5) {
      return { label: "注意", color: "#92400e", background: "#fef3c7" };
    }
    return { label: "ぎりぎり", color: "#991b1b", background: "#fee2e2" };
  };
  return <div className="contract-detail-screen">
    <header className="detail-header">
      <button className="back-btn" onClick={onClose}>← 戻る</button>
      <h2>{cargo.name}の輸送依頼</h2>
    </header>
    <div className="detail-body">
      <section className="detail-tab-panel"><div className="card detail-card">
        <h3>依頼</h3>
        <div className="kv"><span>貨物</span><span>{cargo.name} ×{contract.quantity}</span></div>
        <div className="kv"><span>航路</span><span>{fromPort.name} → {toPort.name}</span></div>
        <div className="kv"><span>距離</span><span>{route.distance}海里</span></div>
        <div className="requirement-grid">
          <div className="requirement-item"><span className="requirement-label">必要スペース</span><span className="requirement-value">{requiredCargoVolume}</span></div>
          <div className="requirement-item"><span className="requirement-label">必要積載量</span><span className="requirement-value">{requiredCargoWeight}</span></div>
        </div>
        <div className="kv"><span>到着期限</span><span>{deadlineLabel}</span></div>
        <div className="reward-row">
          <div className="reward-item"><div className="label">提示報酬</div><div className="value">{contract.offeredReward}G</div></div>
          <div className="reward-item net"><div className="label">見込純利益</div><div className="value">{netProfit}G</div></div>
        </div>
        <div className="kv"><span>経費</span><span>-{expense}G</span></div>
      </div></section>
      <section className="detail-tab-panel"><div className="card detail-card ship-select-card">
        <h3>船</h3>
        <div className="ship-select-list">{ships.map((ship) => {
          const isEligible = eligibleShips.some((item) => item.id === ship.id);
          const suitability = getSuitability(ship);
          const isHeavyLoad = ship.maxCargoWeight > 0 && requiredCargoWeight / ship.maxCargoWeight >= 0.9;
          return <button key={ship.id} type="button" className={`ship-select-item${isEligible ? " eligible" : ""}${selectedShipId === ship.id ? " selected" : ""}`} disabled={!isEligible} onClick={() => {
            if (selectedShipId !== ship.id) { setSelectedShipId(ship.id); setDepartureAt(Date.now()); setShowConfirmation(false); }
          }}>
            <span className="ship-select-name">
              {ship.name}
              <span style={{ marginLeft: 8, padding: "2px 8px", borderRadius: 999, fontSize: 12, color: suitability.color, background: suitability.background }}>{suitability.label}</span>
              {isHeavyLoad && <span style={{ marginLeft: 6, fontSize: 12, color: "#92400e" }}>積載90%超：速度-10%</span>}
            </span>
            <CapacityGauge requiredLabel="必要スペース" maximumLabel="最大スペース" required={requiredCargoVolume} maximum={ship.maxCargoVolume} />
            <CapacityGauge requiredLabel="必要積載量" maximumLabel="最大積載量" required={requiredCargoWeight} maximum={ship.maxCargoWeight} />
          </button>;
        })}</div>
      </div></section>
      <section className="detail-tab-panel chart-tab-panel"><div className="chart-fullscreen">
        <RouteSeaConditionTab routeId={contract.routeId} fromPortId={route.fromPortId} toPortId={route.toPortId} selectedShip={selectedShip} departureAt={departureAt} estimatedArrivalAt={estimatedArrivalAt} etaLabel={etaLabel} />
      </div></section>
    </div>
    <footer className="detail-footer">
      {acceptReason && <p className="accept-reason">{acceptReason}</p>}
      <button className={`btn ${canAccept ? "btn-primary" : "btn-secondary"}`} disabled={!canAccept} onClick={() => setShowConfirmation(true)}>{selectedShipId ? "受注する" : "船を選択してください"}</button>
      <button className="btn btn-secondary" onClick={onClose}>断る</button>
    </footer>
    {showConfirmation && selectedShip && <div className="confirmation-overlay"><div className="confirmation-modal">
      <h3>受注内容の確認</h3>
      <div className="kv"><span>貨物</span><span>{cargo.name} ×{contract.quantity}</span></div>
      <div className="kv"><span>航路</span><span>{fromPort.name} → {toPort.name}</span></div>
      <div className="kv"><span>船</span><span>{selectedShip.name}</span></div>
      <div className="kv"><span>ETA</span><span>{etaLabel}</span></div>
      <div className="kv"><span>到着期限</span><span>{deadlineLabel}</span></div>
      <div className="kv"><span>提示報酬</span><span>{contract.offeredReward}G</span></div>
      <div className="confirmation-actions">
        <button className="btn btn-secondary" type="button" onClick={() => setShowConfirmation(false)}>キャンセル</button>
        <button className="btn btn-primary" type="button" disabled={!canAccept} onClick={() => onAccept(selectedShip.id)}>受注する</button>
      </div>
    </div></div>}
  </div>;
}

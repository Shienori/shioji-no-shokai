import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPlannedShipPresentation } from "../../domain/plannedShipPresentation";
import { getCargoPresentation, getLotCapacityForDisplay, formatCargoMeasure } from "../../domain/cargoPresentation";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { getHexById } from "../../data/hexMap";
import { getPortById } from "../../data/ports";

import type { VoyageDisplayClock } from "../../domain/voyageTimePresentation";
import { VoyageTimeFacts } from "./VoyageTimeFacts";

interface Props { clock: VoyageDisplayClock; ship: Ship; voyage: Voyage; contract: AcceptedContract | null; onSelectShip: (shipId: string) => void; }
const statuses = { loading: "積込中", sailing: "航海中", unloading: "揚荷中", completed: "精算待ち" };
const date = (time: number) => formatDateTime(ceilTo1Minute(time));
export function PlannedFleetShipCard({ ship, voyage, contract, clock, onSelectShip }: Props) {
  let model: ReturnType<typeof getPlannedShipPresentation>;
  try {
    if (!contract) throw new Error("Missing matching contract");
    model = getPlannedShipPresentation(ship, voyage, contract);
  } catch {
    return <div className="contract-card fleet-card" data-planned-ship={ship.id}>
      <h3>{ship.name}</h3><p role="alert">確定計画または進行状態を確認できません。従来の航路・ETAで代用しません。</p>
      <button className="ship-detail-button" type="button" onClick={() => onSelectShip(ship.id)}>詳細</button>
    </div>;
  }
  const hex = getHexById(model.currentHexId);
  const location = hex.kind === "port" ? getPortById(hex.portId!).name : `海域 ${hex.id}`;
  const cargo = contract ? getCargoPresentation(contract) : null;
  const capacity = getLotCapacityForDisplay(ship);
  const from = getPortById(model.sections[0].fromPortId).name;
  const to = getPortById(model.sections[model.sections.length - 1].toPortId).name;
  return <div className="contract-card fleet-card" data-planned-ship={ship.id} data-plan-eta={model.plannedEtaRealTime} data-distance-progress={model.progress}>
    <div className="contract-card-heading"><h3>{ship.name}</h3><span className="contract-card-detail">{statuses[voyage.phase]}</span></div>
    <div className="contract-card-route"><span>現在位置（実船位）</span><span className="contract-route-arrow">→</span><span>{location}</span></div>
    <div className="contract-card-route"><span>受注依頼</span><span className="contract-route-arrow">→</span><span>{cargo ? `${cargo.label}／${from}→${to}` : "貨物データ確認不可"}</span></div>
    <div className="contract-facts">
      <div><span className="contract-fact-label">貨物重量</span><span className="contract-fact-value">{cargo?.weightLabel ?? "確認不可"}</span></div>
      <div><span className="contract-fact-label">貨物容積</span><span className="contract-fact-value">{cargo?.volumeLabel ?? "確認不可"}</span></div>
      <div><span className="contract-fact-label">新規受注の重量上限</span><span className="contract-fact-value">{capacity ? formatCargoMeasure(capacity.maxCargoWeightTons, "t") : "未設定"}</span></div>
      <div><span className="contract-fact-label">新規受注の容積上限</span><span className="contract-fact-value">{capacity ? formatCargoMeasure(capacity.maxCargoVolumeM3, "m³") : "未設定"}</span></div>
    </div>
    <VoyageTimeFacts voyage={voyage} contract={contract} clock={clock} />
    <div className="progress-block"><div className="progress-heading"><span>航路距離の進捗</span><span>{Math.round(model.progress * 100)}%</span></div>
      <div className="progress"><div style={{ width: `${model.progress * 100}%` }} /></div>
    </div>
    <p className="contract-card-detail">{model.traveledDistanceNm.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}海里 / {model.totalDistanceNm.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}海里（積込・荷卸しを除く）</p>
    <div className="contract-facts">
      <div><span className="contract-fact-label">現在区間</span><span className="contract-fact-value">{model.currentSectionIndex + 1}/{model.sections.length}：{getPortById(model.currentSection.fromPortId).name}→{getPortById(model.currentSection.toPortId).name}</span></div>
      <div><span className="contract-fact-label">次の到着先</span><span className="contract-fact-value">{model.nextPortId ? getPortById(model.nextPortId).name : "最終目的港へ到着済み"}</span></div>
      <div><span className="contract-fact-label">計画ETA（受注時固定）</span><span className="contract-fact-value">{date(model.plannedEtaRealTime)}</span></div>
      <div><span className="contract-fact-label">実到着（荷卸し前）</span><span className="contract-fact-value">{model.actualArrivalRealTime === null ? "未到着" : date(model.actualArrivalRealTime)}</span></div>
      <div><span className="contract-fact-label">期限</span><span className="contract-fact-value">{contract ? date(contract.deadlineAt) : "確認不可"}</span></div>
      <div><span className="contract-fact-label">設定速力</span><span className="contract-fact-value">{model.selectedSpeedKnots}ノット</span></div>
      <div><span className="contract-fact-label">実燃料残量</span><span className="contract-fact-value">{formatCargoMeasure(model.fuelRemainingTons, "t")}</span></div>
      <div><span className="contract-fact-label">途中補油処理済み</span><span className="contract-fact-value">{model.portCalls.length}/{model.sections.length - 1}港</span></div>
    </div>
    <p className="contract-card-detail">計画ETAは受注時の計画値で、現在時刻からの到着予測ではありません。</p>
    <button className="ship-detail-button" type="button" onClick={() => onSelectShip(ship.id)}>詳細</button>
  </div>;
}

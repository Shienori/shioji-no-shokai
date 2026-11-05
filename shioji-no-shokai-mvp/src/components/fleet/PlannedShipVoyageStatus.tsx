import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPlannedShipPresentation } from "../../domain/plannedShipPresentation";
import { getCargoPresentation, formatCargoMeasure } from "../../domain/cargoPresentation";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { getPortById } from "../../data/ports";
import { getHexById } from "../../data/hexMap";
import { getWindAt } from "../../domain/windTimeline";
import { HexMap } from "../map/HexMap";

const date = (time: number) => formatDateTime(ceilTo1Minute(time));
import type { VoyageDisplayClock } from "../../domain/voyageTimePresentation";
import { VoyageTimeFacts } from "./VoyageTimeFacts";

interface Props { clock: VoyageDisplayClock; ship: Ship; voyage: Voyage; contract: AcceptedContract | null; }
export function PlannedShipVoyageStatus({ ship, voyage, contract, clock }: Props) {
  let model: ReturnType<typeof getPlannedShipPresentation>;
  try {
    if (!contract) throw new Error("Missing contract");
    model = getPlannedShipPresentation(ship, voyage, contract);
  } catch {
    return <section className="contract-card fleet-card"><h3>確定計画の現在状況</h3><p role="alert">確定航路または進行状態を確認できません。従来の最短航路へ置き換えて表示しません。</p></section>;
  }
  const hex = getHexById(model.currentHexId);
  const location = hex.kind === "port" ? getPortById(hex.portId!).name : `海域 ${hex.id}`;
  const cargo = contract ? getCargoPresentation(contract) : null;
  let actualWind = "航行中のみ表示";
  if (voyage.phase === "sailing") {
    try {
      const { wind } = getWindAt(model.currentHexId, model.processedRealTime);
      actualWind = `${wind.speedMps.toFixed(1)}m/s ／ ${wind.fromDeg === null ? "無風" : `風向 ${Math.round(wind.fromDeg)}度（吹いてくる方向）`}`;
    } catch { actualWind = "実況風を確認できません"; }
  }
  return <section className="contract-card fleet-card" aria-label="確定計画の船詳細" data-plan-eta={model.plannedEtaRealTime} data-distance-progress={model.progress}>
    <h3>現在状況（確定計画）</h3>
    <VoyageTimeFacts voyage={voyage} contract={contract} clock={clock} />
    <div className="kv"><span>現在位置（実船位）</span><span>{location}</span></div>
    <div className="kv"><span>最終処理時点の実況風</span><span>{actualWind}</span></div>
    <div className="kv"><span>航行の最終処理時刻</span><span>{voyage.phase === "loading" ? "積込中・未出港" : date(model.processedRealTime)}</span></div>
    <div className="progress-block"><div className="progress-heading"><span>航路距離の進捗</span><span>{Math.round(model.progress * 100)}%</span></div>
      <div className="progress"><div style={{ width: `${model.progress * 100}%` }} /></div>
    </div>
    <p>{model.traveledDistanceNm.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}海里 / {model.totalDistanceNm.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}海里。積込・荷卸し時間を含まない航路上の進捗です。</p>
    <div className="kv"><span>受注依頼</span><span>{cargo?.label ?? "貨物情報確認不可"}</span></div>
    <div className="kv"><span>貨物重量・容積</span><span>{cargo?.weightLabel} ／ {cargo?.volumeLabel}</span></div>
    <div className="kv"><span>設定速力</span><span>{model.selectedSpeedKnots}ノット</span></div>
    <div className="kv"><span>現在区間</span><span>{model.currentSectionIndex + 1} / {model.sections.length}：{getPortById(model.currentSection.fromPortId).name} → {getPortById(model.currentSection.toPortId).name}</span></div>
    <div className="kv"><span>次の到着先</span><span>{model.nextPortId ? getPortById(model.nextPortId).name : "最終目的港へ到着済み"}</span></div>
    <div className="kv"><span>計画ETA（受注時固定）</span><span>{date(model.plannedEtaRealTime)}</span></div>
    <div className="kv"><span>実到着（荷卸し前）</span><span>{model.actualArrivalRealTime === null ? "未到着" : date(model.actualArrivalRealTime)}</span></div>
    <div className="kv"><span>到着期限</span><span>{contract ? date(contract.deadlineAt) : "確認不可"}</span></div>
    <div className="kv"><span>実燃料残量</span><span>{formatCargoMeasure(model.fuelRemainingTons, "t")}</span></div>
    <div className="kv"><span>累計実燃料消費</span><span>{formatCargoMeasure(model.fuelConsumedTons, "t")}</span></div>
    <p>計画ETAは風・積載減速なしの受注時の計画値です。現在時刻からの到着予測ではなく、航行中に書き換えません。</p>
    <div className="voyage-route-map"><HexMap ships={[{ name: ship.name, hexId: model.currentHexId }]} routeHexIds={model.routeHexIds} currentHexId={model.currentHexId} ariaLabel="受注時に確定した全区間の航路と実船位" /></div>
    <h4>途中寄港と補油</h4>
    {model.sections.length === 1 ? <p>途中寄港なし</p> : model.sections.slice(0, -1).map((section, index) => {
      const record = model.portCalls.find(item => item.sectionIndex === index);
      return <div key={index} style={{ borderTop: "1px solid #cbd5e1", marginTop: 8, paddingTop: 8 }}>
        <p>{getPortById(section.toPortId).name} ／ 目標{section.refuelTargetPercent}% ／ {record ? "補油処理済み" : "未到達"}</p>
        {record && <p>入港 {date(record.arrivedAtRealTime)} ／ 到着残量 {formatCargoMeasure(record.arrivalFuelTons, "t")} ／ 補油量 {formatCargoMeasure(record.addedFuelTons, "t")} ／ 再出港残量 {formatCargoMeasure(record.departureFuelTons, "t")}</p>}
      </div>;
    })}
  </section>;
}

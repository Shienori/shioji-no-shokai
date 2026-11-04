import type { ContractTemplate, Ship } from "../../domain/types";
import type { ConfirmedVoyageRoute } from "../../domain/voyagePlanTypes";
import type { VoyagePlanPrediction } from "../../domain/voyagePlanPrediction";
import { predictVoyagePlan, PLAN_FUEL_MESSAGES } from "../../domain/voyagePlanPrediction";
import { getCargoForContract } from "../../domain/lotContract";
import { getRouteById } from "../../data/routes";
import { getPortById } from "../../data/ports";
import { GAME_TIME_MULTIPLIER } from "../../data/gameConstants";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";

interface Props { contract: ContractTemplate; route: ConfirmedVoyageRoute; ship: Ship | null; selectedSpeedKnots: number | undefined; baseRealTime: number; }
const tons = (value: number | null) => value === null ? "算出不可" : `${value.toLocaleString("ja-JP", { maximumFractionDigits: 6 })}t`;
const time = (value: number) => formatDateTime(ceilTo1Minute(value));
const labels = { insufficient: "不足", lowReserve: "予備燃料僅少", sufficient: "充足", unreachable: "前区間の不足により算出不可" };
export function VoyagePlanSummary({ contract, route, ship, selectedSpeedKnots, baseRealTime }: Props) {
  if (!ship) return <p>船を選択すると、編集航路の計画ETAと燃料試算を表示します。</p>;
  if (ship.kind !== "powered") return <p>編集航路の燃料試算は動力船が対象です。</p>;
  let plan: VoyagePlanPrediction;
  let loadingMs: number;
  try {
    const endpoints = getRouteById(contract.routeId);
    if (route.departurePortId !== endpoints.fromPortId || route.destinationPortId !== endpoints.toPortId) throw new Error("Route mismatch");
    const cargo = getCargoForContract(contract);
    loadingMs = cargo.loadingTimeMsPerUnit * contract.quantity;
    plan = predictVoyagePlan({ route, ship, selectedSpeedKnots: selectedSpeedKnots ?? ship.cruisingSpeedKnots,
      baseRealTime, loadingDurationOperationMs: loadingMs });
  } catch {
    return <p role="alert">編集航路の計画を計算できません。航路・船・速力・燃料・貨物データを確認してください。</p>;
  }
  const minutes = Math.ceil(plan.totalVoyageHours * 60 / GAME_TIME_MULTIPLIER);
  const overall = plan.hasFuelShortage ? "不足する区間があります" : plan.sections.some(section => section.fuelAssessment === "lowReserve")
    ? "予備燃料僅少の区間があります" : "計画上は各区間の燃料が充足しています";
  return <section aria-label="編集航路の計画ETAと燃料" data-plan-distance={plan.totalDistanceNm} data-plan-eta={plan.plannedEtaRealTime} data-plan-fuel={plan.totalRequiredFuelTons}>
    <h3>航海計画2：時間・燃料（閲覧用）</h3>
    <p>{plan.notice}</p>
    <p>基準時刻 {time(baseRealTime)}。ルート・速力・補油率の変更では基準時刻を固定します。「計画を更新」で現在時刻から再計算します。</p>
    <div className="kv"><span>船・設定速力</span><span>{ship.name} ／ {selectedSpeedKnots ?? ship.cruisingSpeedKnots}ノット</span></div>
    <div className="kv"><span>編集航路の計画距離</span><span>{plan.totalDistanceNm}海里</span></div>
    <div className="kv"><span>積込所要（現実時間）</span><span>{Math.ceil(loadingMs / GAME_TIME_MULTIPLIER / 60000)}分</span></div>
    <div className="kv"><span>積込後の出港予定</span><span>{time(plan.departureRealTime)}</span></div>
    <div className="kv"><span>計画航海時間（航海時間）</span><span>{plan.totalVoyageHours.toLocaleString("ja-JP", { maximumFractionDigits: 3 })}時間</span></div>
    <div className="kv"><span>航海所要（現実時間・積込別）</span><span>{Math.floor(minutes / 60)}時間{minutes % 60}分</span></div>
    <div className="kv"><span>計画ETA（荷卸し前）</span><span>{time(plan.plannedEtaRealTime)}</span></div>
    <div className="kv"><span>現在燃料</span><span>{tons(ship.fuel!.remainingTons)}</span></div>
    <div className="kv"><span>全行程の計画必要燃料</span><span>{tons(plan.totalRequiredFuelTons)}</span></div>
    <div className="kv"><span>最終計画残燃料</span><span>{tons(plan.finalFuelTons)}</span></div>
    <p role="status">{overall}</p>
    {plan.hasFuelShortage && <p>ETAは燃料が足りる場合の条件付き計画時刻です。不足区間の先へ到達・補油できることを意味しません。</p>}
    {ship.fuel!.remainingTons === 0 && <p>燃料残量0の船は受注できません。</p>}
    {plan.sections.map((section, index) => <div key={index} style={{ borderTop: "1px solid #cbd5e1", marginTop: 8, paddingTop: 8 }}>
      <h4>区間{index + 1}：{getPortById(route.sections[index].fromPortId).name} → {getPortById(route.sections[index].toPortId).name}</h4>
      <p>{section.distanceNm}海里 ／ 出港予定 {time(section.plannedDepartureRealTime)} ／ 到着予定 {time(section.plannedArrivalRealTime)}</p>
      <p>開始燃料 {tons(section.startingFuelTons)} ／ 必要 {tons(section.requiredFuelTons)} ／ 到着残量 {tons(section.arrivalFuelTons)}</p>
      <p>{labels[section.fuelAssessment]}：{section.fuelAssessment === "unreachable" ? "前区間で燃料不足のため、この区間の残量や補油は算出しません。" : PLAN_FUEL_MESSAGES[section.fuelAssessment]}</p>
      {index < plan.sections.length - 1 && <p>補油目標 {route.sections[index].refuelTargetPercent}% ／ 計画補油量 {tons(section.refuelAddedTons)} ／ 補油後 {tons(section.departureAfterRefuelTons)}</p>}
    </div>)}
    <p>燃料判定は表示丸め前の値で行います。必要量の120%以上で充足、必要量以上120%未満で予備燃料僅少です。途中補油は無料・待ち時間0。計画値は実際の到着を保証しません。</p>
    <p>閲覧用の試算です。編集航路の受注・保存・実航行への有効化はまだ行いません。</p>
  </section>;
}

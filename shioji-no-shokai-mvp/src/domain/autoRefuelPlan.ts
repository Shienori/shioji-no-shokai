import { ports, getPortById } from "../data/ports";
import type { Ship } from "./types";
import { isValidShipFuel } from "./coalFuel";
import { calculateFuelPrepaymentSummary } from "./fuelPrepayment";
import { buildVoyagePlanRoute } from "./voyagePlanRoute";
import { predictVoyagePlan } from "./voyagePlanPrediction";
import type { VoyagePlanPrediction } from "./voyagePlanPrediction";
import type { ConfirmedVoyageRoute, FixedRouteEndpoints, VoyagePlanRouteDraft } from "./voyagePlanTypes";

export interface AutoRefuelPlanParams {
  endpoints: FixedRouteEndpoints;
  ship: Ship;
  selectedSpeedKnots: number;
  baseRealTime: number;
  loadingDurationOperationMs: number;
}

export interface AutoRefuelPlanResult {
  ok: boolean;
  message: string;
  draft?: VoyagePlanRouteDraft;
  route?: ConfirmedVoyageRoute;
}

const directDraft = (): VoyagePlanRouteDraft => ({ stops: [], legs: [{ waypointHexIds: [] }] });

function evaluateDraft(params: AutoRefuelPlanParams, draft: VoyagePlanRouteDraft) {
  try {
    const built = buildVoyagePlanRoute(params.endpoints, draft);
    if (!built.ok) return null;
    const plan = predictVoyagePlan({
      route: built.route,
      ship: params.ship,
      selectedSpeedKnots: params.selectedSpeedKnots,
      baseRealTime: params.baseRealTime,
      loadingDurationOperationMs: params.loadingDurationOperationMs,
    });
    return { built, plan };
  } catch {
    return null;
  }
}

export function suggestAutoRefuelPlan(params: AutoRefuelPlanParams): AutoRefuelPlanResult {
  const direct = evaluateDraft(params, directDraft());
  if (direct && !direct.plan.hasFuelShortage) {
    return { ok: true, message: "補油なしで到達できる見込みです。", draft: directDraft(), route: direct.built.route };
  }

  const capacityTons = params.ship.fuel?.capacityTons ?? 0;
  if (!Number.isFinite(capacityTons) || capacityTons <= 0) {
    return { ok: false, message: "船の燃料容量を確認できないため、自動補油案を作成できません。" };
  }

  const candidates = ports
    .filter(port => port.id !== params.endpoints.departurePortId && port.id !== params.endpoints.destinationPortId)
    .map(port => port.id)
    .sort((a, b) => a.localeCompare(b));

  for (const portId of candidates) {
    const probeDraft: VoyagePlanRouteDraft = {
      stops: [{ portId, refuelTargetPercent: 100 }],
      legs: [{ waypointHexIds: [] }, { waypointHexIds: [] }],
    };
    const probe = evaluateDraft(params, probeDraft);
    if (!probe || probe.plan.sections.length < 2) continue;

    const firstRequired = probe.plan.sections[0].requiredFuelTons;
    const nextRequired = probe.plan.sections[1].requiredFuelTons;
    const remainingTons = params.ship.fuel?.remainingTons ?? 0;
    const arrivalTons = Math.max(0, remainingTons - firstRequired);
    const neededTons = nextRequired * 1.2;
    const targetPercent = arrivalTons >= neededTons
      ? 0
      : Math.min(100, Math.ceil(((neededTons - arrivalTons) / capacityTons) * 100));

    const adjustedDraft: VoyagePlanRouteDraft = {
      stops: [{ portId, refuelTargetPercent: targetPercent }],
      legs: [{ waypointHexIds: [] }, { waypointHexIds: [] }],
    };
    const check = evaluateDraft(params, adjustedDraft);
    if (check && !check.plan.hasFuelShortage) {
      return {
        ok: true,
        message: `${portId}で補油する自動案を作成しました。`,
        draft: adjustedDraft,
        route: check.built.route,
      };
    }
  }

  return { ok: false, message: "自動補油案を作成できませんでした。手動で航路・補油を調整してください。" };
}

// ------------------------------------------------------------------
// ルート自動編集（寄港地の選定 + 補油目標の自動設定）
// ------------------------------------------------------------------

/** 「充足」の基準。必要燃料の120%以上（voyagePlanPrediction.ts の assessPlanFuel と同じ）。 */
const SUFFICIENT_RATIO = 1.2;
/** 自動で作る寄港地の最大数。 */
const DEFAULT_MAX_STOPS = 3;
/** 探索する港の並びの上限（処理が重くなりすぎないための安全弁）。 */
const MAX_PROBES = 600;
const CAPACITY_TOLERANCE = 1e-9;

export type AutoRoutePlanStatus =
  | "alreadySufficient"
  | "departureRefuelOnly"
  | "planned"
  | "infeasible";

export interface AutoRoutePlanParams extends AutoRefuelPlanParams {
  /** 寄港地の最大数。省略時は3。 */
  maxStops?: number;
}

export interface AutoRoutePlanResult {
  status: AutoRoutePlanStatus;
  message: string;
  /** 反映すべき航路の下書き。手動で置いた通過地点は含まない（最短経路）。 */
  draft?: VoyagePlanRouteDraft;
  route?: ConfirmedVoyageRoute;
  /** 出発時にこれ以上の燃料があれば、第1区間が「充足」になる量（t）。 */
  requiredDepartureFuelTons?: number;
  /** 今の燃料との差（t）。0なら出発港での追加補給は不要。 */
  departureShortfallTons?: number;
  totalRefuelTons?: number;
  /** 受注時に前払いする最大額（G）。 */
  prepaymentGold?: number;
}

type StopDraft = { portId: string; refuelTargetPercent: number };
type EvaluatedDraft = NonNullable<ReturnType<typeof evaluateDraft>>;

interface RouteCandidate {
  sequence: string[];
  draft: VoyagePlanRouteDraft;
  evaluated: EvaluatedDraft;
  needDepartureTons: number;
  startTons: number;
  totalRefuelTons: number;
}

function isAllSufficient(plan: VoyagePlanPrediction): boolean {
  return !plan.hasFuelShortage && plan.sections.every(section => section.fuelAssessment === "sufficient");
}

function permutations(ids: readonly string[], length: number): string[][] {
  if (length === 0) return [[]];
  const result: string[][] = [];
  for (const id of ids) {
    for (const rest of permutations(ids.filter(other => other !== id), length - 1)) {
      result.push([id, ...rest]);
    }
  }
  return result;
}

/** 画面の石炭補給（小数第2位表示）と合わせるため、小数第2位に切り上げる。 */
function formatTons(value: number): string {
  return (Math.ceil(value * 100 - 1e-9) / 100).toFixed(2);
}

export function suggestAutoRoute(params: AutoRoutePlanParams): AutoRoutePlanResult {
  const fuel = params.ship.fuel;
  if (params.ship.kind !== "powered" || !isValidShipFuel(fuel)) {
    return { status: "infeasible", message: "動力船の燃料データを確認できないため、ルート自動編集を実行できません。" };
  }
  const capacityTons = fuel.capacityTons;
  const currentTons = fuel.remainingTons;
  const withFuel = (tons: number): AutoRefuelPlanParams => ({
    ...params,
    ship: { ...params.ship, fuel: { ...fuel, remainingTons: tons } },
  });
  const toPercent = (tons: number): number =>
    Math.min(100, Math.max(0, Math.ceil((tons / capacityTons) * 100 - 1e-9)));
  const exceedsCapacity = (tons: number): boolean => tons > capacityTons * (1 + CAPACITY_TOLERANCE);

  // 1. 最短ルートのまま、今の燃料で全区間が「充足」ならそのまま使える。
  const direct = evaluateDraft(params, directDraft());
  if (!direct) {
    return { status: "infeasible", message: "最短ルートを作成できません。出発港・目的港・速力・燃料データを確認してください。" };
  }
  if (isAllSufficient(direct.plan)) {
    return {
      status: "alreadySufficient",
      message: "補油なしで、全区間の燃料が充足する見込みです（最短ルート）。",
      draft: directDraft(),
      route: direct.built.route,
      departureShortfallTons: 0,
      totalRefuelTons: 0,
      prepaymentGold: 0,
    };
  }

  // 2. 出発港で満タンにすれば最短ルートで足りる場合は、ルートを変えず案内だけにする。
  const fullTank = evaluateDraft(withFuel(capacityTons), directDraft());
  if (fullTank && isAllSufficient(fullTank.plan)) {
    const needTons = Math.min(capacityTons, direct.plan.sections[0].requiredFuelTons * SUFFICIENT_RATIO);
    return {
      status: "departureRefuelOnly",
      message: `寄港なしで到達できます。出発港の「石炭補給」で${formatTons(needTons)}t（${toPercent(needTons)}%）以上まで補給してから受注してください。`,
      draft: directDraft(),
      route: direct.built.route,
      requiredDepartureFuelTons: needTons,
      departureShortfallTons: Math.max(0, needTons - currentTons),
      totalRefuelTons: 0,
      prepaymentGold: 0,
    };
  }

  // 3. 寄港地を増やしながら、港の並びを総当たりで試す。
  const candidatePorts = ports
    .filter(port => port.id !== params.endpoints.departurePortId && port.id !== params.endpoints.destinationPortId)
    .map(port => port.id)
    .sort((a, b) => a.localeCompare(b));
  const maxStops = Math.min(params.maxStops ?? DEFAULT_MAX_STOPS, candidatePorts.length);
  let probes = 0;

  const buildCandidate = (sequence: string[]): RouteCandidate | null => {
    const emptyLegs = () => Array.from({ length: sequence.length + 1 }, () => ({ waypointHexIds: [] as string[] }));

    // 補油目標0%で一度組み立て、区間ごとの必要燃料（これは補油目標に左右されない）を得る。
    const probe = evaluateDraft(params, {
      stops: sequence.map(portId => ({ portId, refuelTargetPercent: 0 })),
      legs: emptyLegs(),
    });
    if (!probe || probe.plan.sections.length !== sequence.length + 1) return null;
    const required = probe.plan.sections.map(section => section.requiredFuelTons);

    // 出発時に必要な燃料（第1区間の必要量の120%）。容量を超えるならこの並びは不可。
    const needDepartureTons = required[0] * SUFFICIENT_RATIO;
    if (exceedsCapacity(needDepartureTons)) return null;
    const startTons = Math.min(capacityTons, Math.max(currentTons, needDepartureTons));

    // 寄港地ごとに、次の区間が「充足」になる最小の目標%を決める。
    let fuelTons = startTons;
    const stops: StopDraft[] = [];
    for (let index = 0; index < sequence.length; index += 1) {
      const arrivalTons = Math.max(0, fuelTons - required[index]);
      const needNextTons = required[index + 1] * SUFFICIENT_RATIO;
      if (exceedsCapacity(needNextTons)) return null;
      const percent = arrivalTons >= needNextTons ? 0 : toPercent(needNextTons);
      stops.push({ portId: sequence[index], refuelTargetPercent: percent });
      fuelTons = Math.max(arrivalTons, (capacityTons * percent) / 100);
    }

    // 実際に計算し直して検証。丸め誤差で足りなければ、手前の寄港の目標を1%ずつ上げる。
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const draft: VoyagePlanRouteDraft = { stops: stops.map(stop => ({ ...stop })), legs: emptyLegs() };
      const evaluated = evaluateDraft(withFuel(startTons), draft);
      if (!evaluated) return null;
      const badIndex = evaluated.plan.sections.findIndex(section => section.fuelAssessment !== "sufficient");
      if (badIndex < 0) {
        return {
          sequence,
          draft,
          evaluated,
          needDepartureTons,
          startTons,
          totalRefuelTons: evaluated.plan.sections.reduce((sum, section) => sum + (section.refuelAddedTons ?? 0), 0),
        };
      }
      const stop = stops[badIndex - 1];
      if (badIndex === 0 || !stop || stop.refuelTargetPercent >= 100) return null;
      stop.refuelTargetPercent += 1;
    }
    return null;
  };

  for (let length = 1; length <= maxStops; length += 1) {
    const found: RouteCandidate[] = [];
    for (const sequence of permutations(candidatePorts, length)) {
      if (probes >= MAX_PROBES) break;
      probes += 1;
      const candidate = buildCandidate(sequence);
      if (candidate) found.push(candidate);
    }
    if (found.length === 0) continue;

    // 寄港数が最少の案の中から、総距離 → 補油量 → 港ID順で1案を選ぶ。
    found.sort((a, b) =>
      a.evaluated.built.totalDistanceNm - b.evaluated.built.totalDistanceNm ||
      a.totalRefuelTons - b.totalRefuelTons ||
      a.sequence.join(",").localeCompare(b.sequence.join(",")));
    const best = found[0];
    const stops = best.draft.stops;
    const shortfallTons = Math.max(0, best.needDepartureTons - currentTons);

    let prepaymentGold: number | undefined;
    try {
      prepaymentGold = calculateFuelPrepaymentSummary(
        best.evaluated.built.route,
        withFuel(best.startTons).ship,
        best.evaluated.plan,
      ).totalPrepaymentGold;
    } catch {
      prepaymentGold = undefined;
    }

    const targetText = stops.map(stop => `${getPortById(stop.portId).name} ${stop.refuelTargetPercent}%`).join("、");
    let message = `${stops.map(stop => getPortById(stop.portId).name).join("・")}に寄港する案を作成しました（補油目標：${targetText}）。`;
    if (shortfallTons > 0) {
      message += `出発時の燃料が不足しています。出発港の「石炭補給」で${formatTons(best.needDepartureTons)}t（${toPercent(best.needDepartureTons)}%）以上まで補給してから受注してください。`;
    }
    if (prepaymentGold !== undefined) {
      message += `前払金は最大${prepaymentGold.toLocaleString("ja-JP")}Gです。`;
    }

    return {
      status: "planned",
      message,
      draft: best.draft,
      route: best.evaluated.built.route,
      requiredDepartureFuelTons: best.needDepartureTons,
      departureShortfallTons: shortfallTons,
      totalRefuelTons: best.totalRefuelTons,
      prepaymentGold,
    };
  }

  return {
    status: "infeasible",
    message: "寄港地を組み合わせても、全区間で予備燃料20%以上を確保する案を作成できませんでした。手動で航路・補油を調整してください。",
  };
}

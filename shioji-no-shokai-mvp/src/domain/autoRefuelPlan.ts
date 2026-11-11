import { ports } from "../data/ports";
import type { Ship } from "./types";
import { buildVoyagePlanRoute } from "./voyagePlanRoute";
import { predictVoyagePlan } from "./voyagePlanPrediction";
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

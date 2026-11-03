import type { GameState } from "./types";
import { advanceConfirmedPlanNavigation } from "./confirmedPlanNavigation";
import { advancePlannedVoyage } from "./plannedVoyage";
import { buildVoyagePlanRoute } from "./voyagePlanRoute";
import { buildRouteWindLegs } from "./routeWind";
import { predictVoyagePlan } from "./voyagePlanPrediction";
import { readCargoLotSnapshot } from "./lotContract";
import { getHeavyLoadSpeedFactor } from "./voyage";
import { getRouteById } from "../data/routes";
import { getPortHexId } from "../data/hexMap";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";

function requireValue(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Invalid planned save: ${message}`);
}
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a - b));
/** No clock/wind reads, navigation, repair or migration. Never replaces saved routes/checkpoints. */
export function assertValidPlannedSave(state: GameState): void {
  const voyage = state.activeVoyage;
  if (!voyage || voyage.plannedNavigation === undefined) return;
  const plan = voyage.plannedNavigation;
  requireValue(plan !== null && typeof plan === "object", "missing plan");
  const contract = state.acceptedContract;
  requireValue(contract !== null && contract.id === voyage.contractId, "contract reference");
  if (!contract) throw new Error("Missing planned contract");
  requireValue(["loading", "sailing", "unloading", "completed"].includes(voyage.phase) && voyage.settled === false, "phase");
  const ship = state.ships.find(item => item.id === voyage.shipId);
  if (!ship) throw new Error("Missing planned ship");
  advanceConfirmedPlanNavigation({ ...voyage, phase: "loading" }, ship, plan.checkpoint.processedRealTime);
  const snapshot = readCargoLotSnapshot(contract);
  if (!snapshot) throw new Error("Planned save requires a cargo snapshot");
  const endpoints = getRouteById(contract.routeId);
  requireValue(plan.route.schemaVersion === 1 && plan.route.departurePortId === endpoints.fromPortId &&
    plan.route.destinationPortId === endpoints.toPortId, "route endpoints");
  const rebuilt = buildVoyagePlanRoute({ departurePortId: endpoints.fromPortId, destinationPortId: endpoints.toPortId }, {
    stops: plan.route.sections.slice(0, -1).map(section => ({ portId: section.toPortId, refuelTargetPercent: section.refuelTargetPercent! })),
    legs: plan.route.sections.map(section => ({ waypointHexIds: [...section.waypointHexIds] })),
  });
  requireValue(rebuilt.ok, "route validity");
  if (!rebuilt.ok) throw new Error("Invalid confirmed route");
  requireValue(rebuilt.route.sections.length === plan.route.sections.length && rebuilt.route.sections.every((section, index) => {
    const original = plan.route.sections[index];
    return section.fromPortId === original.fromPortId && section.toPortId === original.toPortId &&
      section.refuelTargetPercent === original.refuelTargetPercent && section.hexIds.length === original.hexIds.length &&
      section.hexIds.every((id, position) => id === original.hexIds[position]);
  }), "saved HEX order");
  const checkpoint = plan.checkpoint;
  const checked = advancePlannedVoyage({ route: plan.route, settings: plan.settings, checkpoint,
    fuel: ship.fuel!, untilRealTime: checkpoint.processedRealTime,
    readActualWind: () => { throw new Error("Save validation must not read wind"); } });
  requireValue(JSON.stringify(checked.checkpoint) === JSON.stringify(checkpoint) &&
    near(checked.fuel.remainingTons, ship.fuel!.remainingTons), "checkpoint would advance or refuel during validation");
  requireValue(checkpoint.portCalls.every(record => record.arrivedAtRealTime >= plan.departureRealTime), "port call before departure");
  const legs = buildRouteWindLegs(plan.route.sections[checkpoint.currentSectionIndex].hexIds);
  const arrived = voyage.phase === "unloading" || voyage.phase === "completed";
  requireValue(arrived ? checked.status === "arrived" : checked.status !== "arrived" && checked.status !== "fuelDepleted", "phase versus progress");
  requireValue(near(voyage.lastProcessedRealTime, checkpoint.processedRealTime) && voyage.currentSeaHexIndex === checkpoint.legIndex &&
    near(voyage.distanceIntoHexNm, checkpoint.distanceIntoLegNm) && voyage.shipSpeedKnots === plan.settings.selectedSpeedKnots, "duplicate progress fields");
  requireValue(Number.isFinite(state.operationTime) && state.operationTime >= voyage.loadingStartedAt &&
    Number.isFinite(state.lastRealTimeSyncedAt) && Number.isFinite(state.currentGameTime), "state clocks");
  if (voyage.phase === "loading") {
    requireValue(checkpoint.currentSectionIndex === 0 && checkpoint.legIndex === 0 && checkpoint.distanceIntoLegNm === 0 &&
      checkpoint.totalFuelUsedTons === 0 && checkpoint.portCalls.length === 0 && checkpoint.processedRealTime === plan.departureRealTime, "loading checkpoint");
  } else requireValue(checkpoint.processedRealTime <= state.lastRealTimeSyncedAt, "progress beyond saved clock");
  const expectedPosition = voyage.phase === "loading" ? getPortHexId(plan.route.departurePortId)
    : arrived ? getPortHexId(plan.route.destinationPortId) : legs[checkpoint.legIndex].hexId;
  requireValue(ship.currentHexId === expectedPosition && ship.status === (voyage.phase === "completed" ? "unloading" : voyage.phase), "ship position/status");
  requireValue(plan.settings.loadSpeedFactor === getHeavyLoadSpeedFactor(contract, ship), "load factor");
  const prediction = predictVoyagePlan({ route: plan.route, ship, selectedSpeedKnots: plan.settings.selectedSpeedKnots,
    baseRealTime: contract.acceptedAt, loadingDurationOperationMs: snapshot.loadingDurationMs });
  requireValue(near(voyage.loadingCompletedAt, voyage.loadingStartedAt + snapshot.loadingDurationMs) &&
    near(voyage.departedAt, voyage.loadingCompletedAt) && near(voyage.departedRealTime, prediction.departureRealTime) &&
    near(voyage.forecastEtaRealTime, prediction.plannedEtaRealTime), "fixed plan times");
  requireValue(near(voyage.arrivalDeadlineAt, voyage.loadingStartedAt + (contract.deadlineAt - contract.acceptedAt) * GAME_TIME_MULTIPLIER), "deadline");
  if (arrived) {
    const expectedArrival = voyage.departedAt + (checkpoint.processedRealTime - voyage.departedRealTime) * GAME_TIME_MULTIPLIER;
    requireValue(voyage.arrivedAt !== null && voyage.unloadingStartedAt !== null && near(voyage.arrivedAt, expectedArrival) &&
      near(voyage.unloadingStartedAt, expectedArrival) && near(voyage.estimatedArrivalAt, expectedArrival), "actual arrival");
    if (voyage.phase === "completed") {
      const unloadedAt = expectedArrival + snapshot.unloadingDurationMs;
      requireValue(voyage.unloadingCompletedAt !== null && near(voyage.unloadingCompletedAt, unloadedAt) && state.operationTime >= unloadedAt &&
        voyage.completedAtWorldTime !== null && near(voyage.completedAtWorldTime, contract.acceptedAt + (unloadedAt - voyage.loadingStartedAt) / GAME_TIME_MULTIPLIER), "completion");
    }
  } else requireValue(voyage.arrivedAt === null && voyage.unloadingStartedAt === null && voyage.unloadingCompletedAt === null &&
    voyage.completedAtWorldTime === null && near(voyage.estimatedArrivalAt, voyage.loadingStartedAt + (prediction.plannedEtaRealTime - contract.acceptedAt) * GAME_TIME_MULTIPLIER), "pre-arrival fields");
  const memos = state.voyageMemos.filter(memo => memo.contractId === contract.id && memo.shipId === ship.id &&
    memo.acceptedAt === contract.acceptedAt && memo.settlement === null && !memo.fuelDepletionReturn);
  requireValue(memos.length === 1 && near(memos[0].plannedEtaRealTime, voyage.forecastEtaRealTime) &&
    near(memos[0].acceptedOperationTime, voyage.loadingStartedAt) && near(memos[0].fuelConsumedTons ?? 0, checkpoint.totalFuelUsedTons), "active memo");
  const added = checkpoint.portCalls.reduce((sum, record) => sum + record.addedFuelTons, 0);
  const initial = ship.fuel!.remainingTons + checkpoint.totalFuelUsedTons - added;
  const tolerance = Number.EPSILON * 128 * Math.max(1, ship.fuel!.capacityTons, checkpoint.totalFuelUsedTons, added);
  requireValue(Number.isFinite(initial) && initial > 0 && initial <= ship.fuel!.capacityTons + tolerance, "fuel conservation");
  let previousFuel = initial;
  for (const record of checkpoint.portCalls) {
    requireValue(record.arrivalFuelTons <= previousFuel + tolerance, "historical fuel gain");
    previousFuel = record.departureFuelTons;
  }
  requireValue(ship.fuel!.remainingTons <= previousFuel + tolerance, "unrecorded refuel");
}

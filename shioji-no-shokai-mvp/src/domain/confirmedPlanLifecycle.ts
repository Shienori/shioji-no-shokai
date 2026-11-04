import type { GameState, Ship } from "./types";
import type { WindNavigationInput } from "./windNavigation";
import { advanceConfirmedPlanNavigation } from "./confirmedPlanNavigation";
import { calculateArrivalLateHours, progressVoyage } from "./voyage";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { getPortHexId } from "../data/hexMap";
import { getRouteById } from "../data/routes";
import { isValidShipFuel } from "./coalFuel";

/** Returns one candidate state. Caller advances clocks, saves successfully, then publishes.
 * Does not enable new acceptance, migrate saves, settle contracts or progress legacy sailing.
 */
export function progressConfirmedPlanLifecycle(
  state: GameState, currentRealTime: number, readActualWind?: WindNavigationInput["readWind"],
): GameState {
  let voyage = state.activeVoyage;
  if (!voyage || voyage.plannedNavigation === undefined) return state;
  const contract = state.acceptedContract;
  if (!contract || voyage.contractId !== contract.id) throw new Error("Missing planned contract");
  if (!Number.isFinite(state.operationTime) || state.operationTime < 0) throw new RangeError("Invalid operation clock");
  let ship = state.ships.find(item => item.id === voyage!.shipId);
  if (!ship) throw new Error("Missing planned ship");
  // Validate even while loading/unloading; invalid present data never selects legacy sailing.
  advanceConfirmedPlanNavigation({ ...voyage, phase: "loading" }, ship, currentRealTime, readActualWind);
  const plan = voyage.plannedNavigation;
  const endpoints = getRouteById(contract.routeId);
  if (plan.route.departurePortId !== endpoints.fromPortId || plan.route.destinationPortId !== endpoints.toPortId) throw new Error("Contract endpoints mismatch");
  let memoIndex = -1;
  for (let index = state.voyageMemos.length - 1; index >= 0; index--) {
    const memo = state.voyageMemos[index];
    if (memo.contractId === contract.id && memo.shipId === ship.id && memo.acceptedAt === contract.acceptedAt &&
        memo.settlement === null && !memo.fuelDepletionReturn) { memoIndex = index; break; }
  }
  if (memoIndex < 0) throw new Error("Missing active planned memo");
  if (voyage.phase === "loading" && state.operationTime >= voyage.loadingCompletedAt && currentRealTime >= voyage.departedRealTime) {
    voyage = { ...voyage, phase: "sailing", departedAt: voyage.loadingCompletedAt };
  }
  if (voyage.phase === "sailing") {
    const advanced = advanceConfirmedPlanNavigation(voyage, ship, currentRealTime, readActualWind);
    voyage = advanced.voyage;
    ship = advanced.ship;
    const navigation = advanced.navigation!;
    if (navigation.status === "fuelDepleted") {
      if (!isValidShipFuel(ship.fuel)) throw new Error("Invalid depleted balance");
      const checkpoint = navigation.checkpoint;
      const lastCall = checkpoint.portCalls[checkpoint.portCalls.length - 1];
      const stoppedHexId = lastCall && lastCall.arrivedAtRealTime === checkpoint.processedRealTime && lastCall.departureFuelTons === 0
        ? getPortHexId(lastCall.portId) : ship.currentHexId;
      const returnedShip: Ship = { ...ship, status: "docked", activeContractId: null,
        currentPortId: plan.route.departurePortId, currentHexId: getPortHexId(plan.route.departurePortId),
        fuel: { ...ship.fuel, remainingTons: ship.fuel.capacityTons } };
      const fuelDepletionReturn = { reason: "fuel_depleted" as const, occurredAtRealTime: checkpoint.processedRealTime,
        stoppedHexId, distanceIntoHexNm: checkpoint.distanceIntoLegNm, returnedToPortId: plan.route.departurePortId,
        fuelConsumedTons: checkpoint.totalFuelUsedTons, fuelRefilledTons: ship.fuel.capacityTons - ship.fuel.remainingTons };
      return { ...state, activeVoyage: null, acceptedContract: null,
        ships: state.ships.map(item => item.id === returnedShip.id ? returnedShip : item),
        voyageMemos: state.voyageMemos.map((memo, index) => index === memoIndex
          ? { ...memo, fuelConsumedTons: checkpoint.totalFuelUsedTons, fuelDepletionReturn } : memo) };
    }
    if (navigation.status === "arrived") {
      const arrivedAt = voyage.departedAt + (navigation.arrivalRealTime! - voyage.departedRealTime) * GAME_TIME_MULTIPLIER;
      const arrivalLateHours = calculateArrivalLateHours(arrivedAt, voyage.arrivalDeadlineAt);
      voyage = { ...voyage, phase: "unloading", arrivedAt, estimatedArrivalAt: arrivedAt,
        arrivalLateHours, isOnTime: arrivalLateHours <= 0, unloadingStartedAt: arrivedAt };
    }
  }
  // Only non-sailing phases may use the existing unloading/completion implementation.
  if (voyage.phase === "unloading" || voyage.phase === "completed") {
    voyage = progressVoyage(voyage, contract, state.operationTime, currentRealTime);
  }
  const arrived = voyage.phase === "unloading" || voyage.phase === "completed";
  const updatedShip: Ship = { ...ship, status: voyage.phase === "loading" ? "loading" : voyage.phase === "sailing" ? "sailing" : "unloading",
    ...(arrived ? { currentPortId: plan.route.destinationPortId, currentHexId: getPortHexId(plan.route.destinationPortId) }
      : voyage.phase === "loading" ? { currentHexId: getPortHexId(plan.route.departurePortId) } : {}) };
  const fuelConsumedTons = voyage.plannedNavigation!.checkpoint.totalFuelUsedTons;
  return { ...state, activeVoyage: voyage, ships: state.ships.map(item => item.id === updatedShip.id ? updatedShip : item),
    voyageMemos: state.voyageMemos.map((memo, index) => index === memoIndex ? { ...memo, fuelConsumedTons } : memo) };
}

import type { Ship, Voyage } from "./types";
import { isValidShipFuel } from "./coalFuel";
import { advancePlannedVoyage } from "./plannedVoyage";
import type { PlannedVoyageAdvanceResult } from "./plannedVoyage";
import type { WindNavigationInput } from "./windNavigation";
import { buildRouteWindLegs } from "./routeWind";
import { SHIP_PERFORMANCE_MODEL_VERSION } from "./shipPerformance";
import { getWindAt, WIND_MODEL_VERSION } from "./windTimeline";
import { getPortHexId } from "../data/hexMap";
import { isSelectedSpeedWithinLimits } from "./voyageSpeedValidation";

export interface ConfirmedPlanNavigationResult {
  ship: Ship;
  voyage: Voyage;
  navigation: PlannedVoyageAdvanceResult | null;
}
const readActualModelWind: WindNavigationInput["readWind"] = (hexId, time) => {
  const slot = getWindAt(hexId, time);
  return { wind: slot.wind, startsAt: slot.startsAt, endsAt: slot.endsAt };
};
/** Pure sailing adapter. Caller handles loading, arrival, depletion return and atomic saving.
 * Never send a planned voyage through legacy sailing. Section-local progress lives in checkpoint.
 */
export function advanceConfirmedPlanNavigation(
  voyage: Voyage, ship: Ship, currentRealTime: number,
  readActualWind: WindNavigationInput["readWind"] = readActualModelWind,
): ConfirmedPlanNavigationResult {
  const plan = voyage.plannedNavigation;
  if (plan === undefined) return { ship, voyage, navigation: null };
  if (plan === null || voyage.fuelNavigation !== undefined || plan.modelVersion !== "planned-voyage-v1" ||
      plan.shipPerformanceModelVersion !== SHIP_PERFORMANCE_MODEL_VERSION || plan.windModelVersion !== WIND_MODEL_VERSION) {
    throw new Error("Invalid or conflicting planned navigation model");
  }
  if (plan.voyageId !== voyage.id || plan.shipId !== ship.id || voyage.shipId !== ship.id ||
      plan.contractId !== voyage.contractId || ship.activeContractId !== voyage.contractId ||
      plan.departureRealTime !== voyage.departedRealTime) throw new Error("Planned voyage references mismatch");
  if (ship.kind !== "powered" || !isValidShipFuel(ship.fuel) ||
      !isSelectedSpeedWithinLimits(ship, plan.settings.selectedSpeedKnots)) throw new Error("Invalid planned ship settings");
  if (![currentRealTime, plan.checkpoint.processedRealTime, plan.departureRealTime].every(
    time => Number.isFinite(time) && Math.abs(time) <= 8.64e15,
  ) || plan.checkpoint.processedRealTime < plan.departureRealTime) throw new RangeError("Invalid planned voyage time");
  if (voyage.phase !== "sailing") return { ship, voyage, navigation: null };
  if (currentRealTime < plan.checkpoint.processedRealTime) throw new RangeError("Cannot rewind planned voyage");
  const navigation = advancePlannedVoyage({ route: plan.route, settings: plan.settings,
    checkpoint: plan.checkpoint, fuel: ship.fuel, untilRealTime: currentRealTime, readActualWind });
  const checkpoint = navigation.checkpoint;
  const section = plan.route.sections[checkpoint.currentSectionIndex];
  const legs = buildRouteWindLegs(section.hexIds);
  const position = navigation.status === "arrived" ? getPortHexId(plan.route.destinationPortId)
    : legs[Math.min(checkpoint.legIndex, legs.length - 1)].hexId;
  return {
    ship: { ...ship, currentHexId: position, fuel: navigation.fuel },
    voyage: { ...voyage, lastProcessedRealTime: checkpoint.processedRealTime,
      currentSeaHexIndex: checkpoint.legIndex, distanceIntoHexNm: checkpoint.distanceIntoLegNm,
      plannedNavigation: { ...plan, checkpoint } },
    navigation,
  };
}

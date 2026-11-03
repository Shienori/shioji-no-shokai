import type { Route, Ship, Voyage, VoyageFuelNavigation } from "./types";
import { isValidShipFuel } from "./coalFuel";
import { getRouteWindLegs, calculateRouteLegPerformance } from "./routeWind";
import { SHIP_PERFORMANCE_MODEL_VERSION } from "./shipPerformance";
import { getWindAt, WIND_MODEL_VERSION } from "./windTimeline";
import { advanceWindNavigation } from "./windNavigation";
import type { WindNavigationInput, WindNavigationResult } from "./windNavigation";

export const COAL_VOYAGE_MODEL_VERSION = "coal-fuel-v1";

/** New voyages only. Does not mutate the ship, charge money or enable itself. */
export function createCoalVoyageNavigation(
  ship: Ship,
  route: Route,
  loadSpeedFactor: number,
  selectedSpeedKnots: number = ship.cruisingSpeedKnots,
): VoyageFuelNavigation {
  if (ship.kind !== "powered" || !isValidShipFuel(ship.fuel)) throw new Error("Valid powered-ship fuel data required");
  if (ship.fuel.remainingTons === 0) throw new Error("Cannot start a coal voyage with zero fuel");
  if (!Number.isFinite(ship.maxSpeedKnots) || ship.maxSpeedKnots <= 0 || selectedSpeedKnots > ship.maxSpeedKnots) {
    throw new RangeError("Selected speed exceeds engine setting limit");
  }
  calculateRouteLegPerformance(
    { headingDeg: 0 }, selectedSpeedKnots, loadSpeedFactor, { speedMps: 0, fromDeg: null },
    ship.fuel.referenceConsumptionTonsPerVoyageHour, ship.fuel.referenceSpeedKnots,
  );
  return {
    modelVersion: COAL_VOYAGE_MODEL_VERSION,
    shipPerformanceModelVersion: SHIP_PERFORMANCE_MODEL_VERSION,
    windModelVersion: WIND_MODEL_VERSION,
    fuelType: ship.fuel.fuelType,
    selectedSpeedKnots, loadSpeedFactor,
    referenceSpeedKnots: ship.fuel.referenceSpeedKnots,
    referenceConsumptionTonsPerVoyageHour: ship.fuel.referenceConsumptionTonsPerVoyageHour,
    routeLegs: getRouteWindLegs(route).map(leg => ({ ...leg })),
    fuelConsumedTons: 0,
  };
}

export interface CoalVoyageAdvanceResult {
  ship: Ship;
  voyage: Voyage;
  navigation: WindNavigationResult | null;
}

const readCurrentModelWind: WindNavigationInput["readWind"] = (hexId, realTime) => {
  const slot = getWindAt(hexId, realTime);
  return { wind: slot.wind, startsAt: slot.startsAt, endsAt: slot.endsAt };
};

/**
 * Explicit consumption adapter, not called by the store yet.
 * Legacy voyages, loading, unloading and completed voyages consume nothing here.
 * The default source is actual wind, never a forecast. The optional reader is
 * for deterministic tests or a compatible actual-wind backend.
 * Returns ship balance and voyage checkpoint together; caller must persist both
 * in one state update. Arrival/free-return transitions remain the caller's job.
 * Never pass the returned fuel-enabled voyage through legacy sailing afterward.
 */
export function advanceCoalVoyage(
  voyage: Voyage,
  ship: Ship,
  currentRealTime: number,
  readActualWind: WindNavigationInput["readWind"] = readCurrentModelWind,
): CoalVoyageAdvanceResult {
  const navigation = voyage.fuelNavigation;
  if (navigation === undefined) return { ship, voyage, navigation: null };
  if (voyage.shipId !== ship.id || voyage.contractId !== ship.activeContractId) {
    throw new Error("Ship and voyage references do not match");
  }
  if (navigation.modelVersion !== COAL_VOYAGE_MODEL_VERSION ||
      navigation.shipPerformanceModelVersion !== SHIP_PERFORMANCE_MODEL_VERSION ||
      navigation.windModelVersion !== WIND_MODEL_VERSION) {
    throw new Error("Unsupported coal voyage model; do not silently use a new model");
  }
  if (!isValidShipFuel(ship.fuel) || navigation.fuelType !== ship.fuel.fuelType) {
    throw new Error("Missing or invalid fuel balance; automatic refill is not allowed");
  }
  if (voyage.phase !== "sailing") return { ship, voyage, navigation: null };
  if (![currentRealTime, voyage.lastProcessedRealTime, voyage.departedRealTime].every(
    value => Number.isFinite(value) && Math.abs(value) <= 8.64e15,
  )) throw new RangeError("Invalid voyage time");
  const processedRealTime = Math.max(voyage.lastProcessedRealTime, voyage.departedRealTime);
  if (currentRealTime <= processedRealTime) return { ship, voyage, navigation: null };

  const result = advanceWindNavigation({
    legs: navigation.routeLegs,
    state: {
      processedRealTime,
      legIndex: voyage.currentSeaHexIndex,
      distanceIntoLegNm: voyage.distanceIntoHexNm,
      fuelRemaining: ship.fuel.remainingTons,
      totalFuelUsed: navigation.fuelConsumedTons,
    },
    selectedSpeedKnots: navigation.selectedSpeedKnots,
    loadSpeedFactor: navigation.loadSpeedFactor,
    referenceSpeedKnots: navigation.referenceSpeedKnots,
    referenceFuelPerVoyageHour: navigation.referenceConsumptionTonsPerVoyageHour,
    untilRealTime: currentRealTime,
    readWind: readActualWind,
  });
  return {
    ship: { ...ship, fuel: { ...ship.fuel, remainingTons: result.state.fuelRemaining } },
    voyage: {
      ...voyage,
      lastProcessedRealTime: result.state.processedRealTime,
      currentSeaHexIndex: result.state.legIndex,
      distanceIntoHexNm: result.state.distanceIntoLegNm,
      fuelNavigation: { ...navigation, fuelConsumedTons: result.state.totalFuelUsed },
    },
    navigation: result,
  };
}

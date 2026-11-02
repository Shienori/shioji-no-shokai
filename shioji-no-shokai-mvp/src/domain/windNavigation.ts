import type { Wind } from "./coastalWind";
import type { RouteWindLeg } from "./routeWind";
import { calculateRouteLegPerformance } from "./routeWind";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { SEA_CONDITION_SLOT_MS } from "./seaCondition";
import type { ContractWindForecastSnapshot } from "./contractWindForecast";
import { getSavedWindForecastAt, isValidContractWindForecast } from "./contractWindForecast";

const HOUR_MS = 3_600_000;
const MAX_STEPS = 100_000;
export interface WindNavigationState {
  processedRealTime: number;
  legIndex: number;
  distanceIntoLegNm: number;
  fuelRemaining: number;
  totalFuelUsed: number;
}
export interface NavigationWindSample { wind: Wind; startsAt: number; endsAt: number; }
export interface WindNavigationInput {
  legs: readonly RouteWindLeg[];
  state: Readonly<WindNavigationState>;
  selectedSpeedKnots: number;
  loadSpeedFactor: number;
  referenceFuelPerVoyageHour: number;
  referenceSpeedKnots?: number;
  untilRealTime: number;
  readWind: (hexId: string, realTime: number) => NavigationWindSample | null;
}
export type WindNavigationStatus = "arrived" | "timeReached" | "fuelDepleted" | "windUnavailable";
export interface WindNavigationResult {
  status: WindNavigationStatus;
  state: WindNavigationState;
  arrivalRealTime: number | null;
}
function nonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Invalid ${name}`);
}
function time(value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > 8.64e15) throw new RangeError("Invalid time");
}

/**
 * Sailing only. No loading/unloading, persistence, prices or rescue policy.
 * Fuel rate is per voyage hour: real elapsed hours are multiplied exactly once.
 * Resume with the returned state and unchanged route, settings and wind source.
 * Forecast consumers must pass forecast samples; no weather is generated here.
 */
export function advanceWindNavigation(input: WindNavigationInput): WindNavigationResult {
  const { legs, readWind } = input;
  let state = { ...input.state };
  time(state.processedRealTime);
  time(input.untilRealTime);
  if (input.untilRealTime < state.processedRealTime) throw new RangeError("Cannot integrate backwards");
  if (legs.length === 0 || !Number.isSafeInteger(state.legIndex) || state.legIndex < 0 || state.legIndex > legs.length) {
    throw new RangeError("Invalid route or leg index");
  }
  for (const leg of legs) {
    if (!leg.hexId || !Number.isFinite(leg.distanceNm) || leg.distanceNm <= 0 ||
        !Number.isFinite(leg.headingDeg) || leg.headingDeg < 0 || leg.headingDeg >= 360) {
      throw new RangeError("Invalid navigation leg");
    }
  }
  nonNegative(state.distanceIntoLegNm, "distance");
  nonNegative(state.fuelRemaining, "fuel remaining");
  nonNegative(state.totalFuelUsed, "fuel used");
  if (state.legIndex === legs.length ? state.distanceIntoLegNm !== 0 : state.distanceIntoLegNm >= legs[state.legIndex].distanceNm) {
    throw new RangeError("Invalid distance for current leg");
  }
  const referenceSpeed = input.referenceSpeedKnots ?? 6;
  const configuration = calculateRouteLegPerformance(
    { headingDeg: 0 }, input.selectedSpeedKnots, input.loadSpeedFactor,
    { speedMps: 0, fromDeg: null }, input.referenceFuelPerVoyageHour, referenceSpeed,
  );
  if (configuration.fuelPerVoyageHour <= 0) throw new RangeError("Fuel rate must be positive");
  const finish = (status: WindNavigationStatus): WindNavigationResult => ({
    status, state: { ...state }, arrivalRealTime: status === "arrived" ? state.processedRealTime : null,
  });
  if (state.legIndex === legs.length) return finish("arrived");
  let steps = 0;
  while (state.processedRealTime < input.untilRealTime) {
    if (++steps > MAX_STEPS) throw new RangeError("Navigation step limit exceeded");
    if (state.fuelRemaining === 0) return finish("fuelDepleted");
    const leg = legs[state.legIndex];
    const sample = readWind(leg.hexId, state.processedRealTime);
    if (!sample) return finish("windUnavailable");
    time(sample.startsAt);
    time(sample.endsAt);
    if (sample.startsAt > state.processedRealTime || sample.endsAt <= state.processedRealTime) {
      throw new RangeError("Wind sample does not cover current time");
    }
    const rates = calculateRouteLegPerformance(
      leg, input.selectedSpeedKnots, input.loadSpeedFactor, sample.wind,
      input.referenceFuelPerVoyageHour, referenceSpeed,
    );
    const realMsPerVoyageHour = HOUR_MS / GAME_TIME_MULTIPLIER;
    const exitAt = state.processedRealTime +
      (leg.distanceNm - state.distanceIntoLegNm) / rates.speedKnots * realMsPerVoyageHour;
    const emptyAt = state.processedRealTime +
      state.fuelRemaining / rates.fuelPerVoyageHour * realMsPerVoyageHour;
    const nextSlot = (Math.floor(state.processedRealTime / SEA_CONDITION_SLOT_MS) + 1) * SEA_CONDITION_SLOT_MS;
    const target = Math.min(input.untilRealTime, sample.endsAt, nextSlot, exitAt, emptyAt);
    if (!(target > state.processedRealTime)) throw new RangeError("Interval below clock precision");
    const hours = (target - state.processedRealTime) / realMsPerVoyageHour;
    const used = target === emptyAt ? state.fuelRemaining :
      Math.min(state.fuelRemaining, rates.fuelPerVoyageHour * hours);
    const distance = Math.min(leg.distanceNm, state.distanceIntoLegNm + rates.speedKnots * hours);
    const exited = target === exitAt || distance === leg.distanceNm;
    const totalFuelUsed = state.totalFuelUsed + used;
    if (!Number.isFinite(totalFuelUsed)) throw new RangeError("Fuel total overflow");
    state = {
      processedRealTime: target,
      legIndex: state.legIndex + (exited ? 1 : 0),
      distanceIntoLegNm: exited ? 0 : distance,
      fuelRemaining: Math.max(0, state.fuelRemaining - used),
      totalFuelUsed,
    };
    if (state.legIndex === legs.length) return finish("arrived");
    if (state.fuelRemaining === 0) return finish("fuelDepleted");
  }
  return finish("timeReached");
}

/**
 * Arrival ETA and predicted fuel balance using ONLY a saved forecast edition.
 * No future actual wind, regeneration or latest-edition fallback.
 * Arrival excludes unloading; ETA is null unless arrival is reached with fuel.
 * This is a preview: input state and game fuel balances are not modified.
 */
export function estimateSavedWindArrival(
  input: Omit<WindNavigationInput, "readWind" | "untilRealTime">,
  snapshot: ContractWindForecastSnapshot,
): WindNavigationResult {
  if (!isValidContractWindForecast(snapshot, snapshot.routeId, snapshot.capturedAt)) {
    throw new Error("Invalid saved forecast");
  }
  if (snapshot.seaHexIds.length !== input.legs.length ||
      snapshot.seaHexIds.some((id, index) => id !== input.legs[index].hexId)) {
    throw new Error("Forecast route does not match navigation legs");
  }
  if (input.state.processedRealTime < snapshot.validFrom || input.state.processedRealTime > snapshot.validTo) {
    throw new RangeError("Navigation time outside forecast coverage");
  }
  return advanceWindNavigation({
    ...input, untilRealTime: snapshot.validTo,
    readWind: (hexId, realTime) => {
      const slot = getSavedWindForecastAt(snapshot, hexId, Math.floor(realTime));
      return slot ? { wind: slot.forecastWind, startsAt: slot.startsAt, endsAt: Math.min(slot.endsAt, snapshot.validTo) } : null;
    },
  });
}

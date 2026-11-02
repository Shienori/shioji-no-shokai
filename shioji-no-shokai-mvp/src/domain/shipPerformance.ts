import type { Wind } from "./coastalWind";
import { windToVector } from "./coastalWind";

export const SHIP_PERFORMANCE_MODEL_VERSION = "ship-performance-v1";

function requirePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be finite and positive`);
  }
}

function requireFiniteResult(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} exceeds the supported numeric range`);
  }
  return value;
}

/**
 * Game balance approximation, not resolved ship aerodynamics.
 * Bearings are clockwise from north in [0, 360). Wind uses FROM bearing.
 * Calm wind must be { speedMps: 0, fromDeg: null }.
 * No clock, forecast generation, map lookup or state mutation.
 */
export function calculateWindSpeedFactor(headingDeg: number, wind: Wind): number {
  if (!Number.isFinite(headingDeg) || headingDeg < 0 || headingDeg >= 360) {
    throw new RangeError("headingDeg must be in [0, 360)");
  }
  windToVector(wind); // Reuse the existing wind input validation.
  if (wind.speedMps === 0) return 1;

  const angle = ((wind.fromDeg as number) - headingDeg) * Math.PI / 180;
  const longitudinal = wind.speedMps * Math.cos(angle);
  const head = Math.max(longitudinal, 0) / 10;
  const tail = Math.max(-longitudinal, 0) / 10;
  const cross = Math.abs(wind.speedMps * Math.sin(angle)) / 10;
  const raw = requireFiniteResult(
    1 - 0.20 * head ** 2 + 0.08 * tail ** 2 - 0.05 * cross ** 2,
    "wind speed factor",
  );
  return Math.max(0.60, Math.min(1.08, raw));
}

/**
 * Sailing speed in knots. selectedSpeedKnots is the unloaded calm-water setting.
 * Apply the load factor exactly once; do not pass a load-adjusted speed.
 * Do not additionally apply the legacy seaConditionSpeedMultiplier.
 * Engine setting limits are enforced by the caller, not by this function.
 */
export function calculateEffectiveSpeedKnots(
  selectedSpeedKnots: number,
  loadSpeedFactor: number,
  headingDeg: number,
  wind: Wind,
): number {
  requirePositive(selectedSpeedKnots, "selectedSpeedKnots");
  requirePositive(loadSpeedFactor, "loadSpeedFactor");
  if (loadSpeedFactor > 1) {
    throw new RangeError("loadSpeedFactor must not exceed 1");
  }
  const speed = requireFiniteResult(
    selectedSpeedKnots * loadSpeedFactor * calculateWindSpeedFactor(headingDeg, wind),
    "effective speed",
  );
  requirePositive(speed, "effective speed");
  return speed;
}

/**
 * Fuel units per VOYAGE hour, in the same units as referenceFuelPerVoyageHour.
 * At the reference setting, the result equals the reference fuel rate.
 * Uses the engine setting, never wind-reduced actual speed or load-adjusted speed.
 * Longer passage time accounts for wind/load fuel cost; no extra wind multiplier.
 * Sailing engine only: stopped/idling engines and fuel depletion are out of scope.
 * Real-time conversion (currently 6x) is the navigation caller's responsibility.
 */
export function calculateFuelRate(
  selectedSpeedKnots: number,
  referenceFuelPerVoyageHour: number,
  referenceSpeedKnots: number = 6,
): number {
  requirePositive(selectedSpeedKnots, "selectedSpeedKnots");
  requirePositive(referenceFuelPerVoyageHour, "referenceFuelPerVoyageHour");
  requirePositive(referenceSpeedKnots, "referenceSpeedKnots");
  return requireFiniteResult(
    referenceFuelPerVoyageHour * (0.20 + 0.80 * (selectedSpeedKnots / referenceSpeedKnots) ** 3),
    "fuel rate",
  );
}

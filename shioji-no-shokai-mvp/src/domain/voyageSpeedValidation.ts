import type { Ship } from "./types";

type ShipSpeedLimits = Pick<
  Ship,
  "cruisingSpeedKnots" | "maxSpeedKnots"
>;

/**
 * Checks the selected speed only.
 * Ship specification validity and ship-kind restrictions remain caller-owned.
 */
export function isSelectedSpeedWithinLimits(
  ship: ShipSpeedLimits,
  speed: number,
): boolean {
  return Number.isSafeInteger(speed) &&
    speed >= ship.cruisingSpeedKnots &&
    speed <= ship.maxSpeedKnots;
}

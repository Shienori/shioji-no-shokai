import type { Ship } from "./types";

type ShipSpeedLimits = Pick<
  Ship,
  "economicalSpeedKnots" | "standardSpeedKnots" | "cruisingSpeedKnots" | "maxSpeedKnots"
>;

/**
 * Checks the selected speed only.
 * Ship specification validity and ship-kind restrictions remain caller-owned.
 */
export function isSelectedSpeedWithinLimits(
  ship: ShipSpeedLimits,
  speed: number,
): boolean {
  const allowedSpeeds = [
    ship.economicalSpeedKnots,
    ship.standardSpeedKnots,
    ship.cruisingSpeedKnots,
    ship.maxSpeedKnots,
  ];

  return Number.isSafeInteger(speed) &&
    allowedSpeeds.includes(speed);
}

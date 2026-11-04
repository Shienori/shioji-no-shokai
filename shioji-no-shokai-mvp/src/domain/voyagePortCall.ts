import type { ShipFuelState } from "./types";
import { isValidShipFuel } from "./coalFuel";

export interface VoyagePortCallRecord {
  sectionIndex: number;
  portId: string;
  arrivedAtRealTime: number;
  arrivalFuelTons: number;
  targetPercent: number;
  addedFuelTons: number;
  departureFuelTons: number;
}
/** Amount calculation only. Arrival and route authorization belong to caller. */
export function calculateVoyagePortRefuel(
  fuel: ShipFuelState,
  targetPercent: number,
): { addedFuelTons: number; departureFuelTons: number } {
  if (!isValidShipFuel(fuel)) throw new RangeError("Invalid fuel state");
  if (!Number.isInteger(targetPercent) || targetPercent < 0 || targetPercent > 100) throw new RangeError("Invalid refuel target");
  const target = fuel.capacityTons * (targetPercent / 100);
  const departureFuelTons = Math.max(fuel.remainingTons, target);
  return { addedFuelTons: departureFuelTons - fuel.remainingTons, departureFuelTons };
}

import type { Ship } from "./types";
import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import { isValidShipFuel } from "./coalFuel";

export interface FreeRefuelPlan {
  targetTenths: number;
  targetTons: number;
  beforeTons: number;
  addedTons: number;
  afterTons: number;
  costGold: 0;
}

function requireNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Invalid ${name}`);
}

export function calculateFreeRefuel(remainingTons: number, capacityTons: number, targetTenths: number): FreeRefuelPlan {
  requireNonNegativeFinite(remainingTons, "remaining fuel");
  requireNonNegativeFinite(capacityTons, "fuel capacity");
  if (capacityTons <= 0 || remainingTons > capacityTons) throw new RangeError("Invalid fuel balance");
  if (!Number.isSafeInteger(targetTenths) || targetTenths < 0) throw new RangeError("Target must use 0.1t units");
  const targetTons = targetTenths / 10;
  if (targetTons > capacityTons) throw new RangeError("Refuel target exceeds capacity");
  const afterTons = Math.max(remainingTons, targetTons);
  return { targetTenths, targetTons, beforeTons: remainingTons, addedTons: Math.max(0, afterTons - remainingTons), afterTons, costGold: 0 };
}

export function applyFreeRefuel(ship: Ship, targetTenths: number): { ship: Ship; refuel: FreeRefuelPlan } {
  if (ship.kind !== "powered" || !isValidShipFuel(ship.fuel)) throw new Error("Valid powered ship fuel required");
  const refuel = calculateFreeRefuel(ship.fuel.remainingTons, ship.fuel.capacityTons, targetTenths);
  return { ship: { ...ship, fuel: { ...ship.fuel, remainingTons: refuel.afterTons } }, refuel };
}

export function applyDepartureFreeRefuel(ship: Ship, route: ConfirmedVoyageRoute): { ship: Ship; refuel: FreeRefuelPlan | null } {
  if (ship.kind !== "powered" || !isValidShipFuel(ship.fuel)) return { ship, refuel: null };
  const percent = route.sections[0]?.refuelTargetPercent ?? 0;
  if (!Number.isFinite(percent) || percent <= 0) return { ship, refuel: null };
  if (percent > 100) throw new RangeError("Departure refuel target exceeds 100%");
  const targetTenths = Math.round(ship.fuel.capacityTons * percent / 10);
  return applyFreeRefuel(ship, targetTenths);
}

export function formatFuelTons(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return "算出不可";
  if (value > 0 && value < 0.05) return "0.1t未満";
  return `${value.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}t`;
}

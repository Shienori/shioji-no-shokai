import type { GameState, Ship, ShipFuelState } from "./types";

export const SHIONAMI_SHIP_ID = "ship_shionami";
export const SHIONAMI_FUEL_CAPACITY_TONS = 5;
export const SHIONAMI_REFERENCE_SPEED_KNOTS = 6;
export const SHIONAMI_REFERENCE_CONSUMPTION_TONS_PER_VOYAGE_HOUR = 0.20;

/** Fresh object. Initial allocation is free, not a purchase or a recurring refill. */
export function createInitialShionamiFuel(): ShipFuelState {
  return {
    fuelType: "coal",
    capacityTons: SHIONAMI_FUEL_CAPACITY_TONS,
    remainingTons: SHIONAMI_FUEL_CAPACITY_TONS,
    referenceSpeedKnots: SHIONAMI_REFERENCE_SPEED_KNOTS,
    referenceConsumptionTonsPerVoyageHour: SHIONAMI_REFERENCE_CONSUMPTION_TONS_PER_VOYAGE_HOUR,
  };
}

/** Validation only: never replace invalid data or round stored quantities. */
export function isValidShipFuel(value: unknown): value is ShipFuelState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const fuel = value as Record<string, unknown>;
  const positive = (item: unknown): item is number => typeof item === "number" && Number.isFinite(item) && item > 0;
  return fuel.fuelType === "coal" && positive(fuel.capacityTons) &&
    typeof fuel.remainingTons === "number" && Number.isFinite(fuel.remainingTons) &&
    fuel.remainingTons >= 0 && fuel.remainingTons <= fuel.capacityTons &&
    positive(fuel.referenceSpeedKnots) && positive(fuel.referenceConsumptionTonsPerVoyageHour);
}

/**
 * Known starter ship only. Existing fuel (including zero, partial or malformed)
 * is retained. A fuel-enabled voyage missing its balance is not a legacy ship
 * eligible for a free initialization. No money, contract, voyage or memo changes.
 * Loading does not write storage; the next ordinary save persists initialization.
 */
export function initializeLegacyCoalFuel(state: GameState): GameState {
  let changed = false;
  const ships = state.ships.map((ship): Ship => {
    if (ship.id !== SHIONAMI_SHIP_ID) return ship;
    const hasFuel = Object.prototype.hasOwnProperty.call(ship, "fuel");
    const fuelVoyage = state.activeVoyage?.shipId === ship.id && state.activeVoyage.fuelNavigation !== undefined;
    if (!hasFuel && fuelVoyage) return ship;
    const oldStarterPropulsion = ship.kind === "sailing" && ship.engineType === "帆走" &&
      ship.engineOutput === "風力推進" && ship.cruisingSpeedKnots === 6 && ship.maxSpeedKnots === 8;
    if (hasFuel && !oldStarterPropulsion) return ship;
    changed = true;
    return {
      ...ship,
      ...(oldStarterPropulsion ? { kind: "powered" as const, maxSpeedKnots: 7, engineType: "初期蒸気機関", engineOutput: "外輪式推進" } : {}),
      ...(!hasFuel ? { fuel: createInitialShionamiFuel() } : {}),
    };
  });
  return changed ? { ...state, ships } : state;
}

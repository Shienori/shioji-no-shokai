import type { Ship } from "./types";
import { FUEL_PRICE_GOLD_PER_TON } from "../data/gameConstants";

export interface ManualRefuelResult {
  refuelTons: number;
  cost: number;
  ship: Ship;
}

export function calculateManualRefuel(
  ship: Ship,
  requestedTons: number,
): ManualRefuelResult {
  if (ship.kind !== "powered") {
    throw new Error("この船は石炭補油に対応していません");
  }

  const fuel = ship.fuel;

  if (!fuel) {
    throw new Error("燃料データがありません");
  }

  if (!Number.isFinite(requestedTons) || requestedTons <= 0) {
    throw new RangeError("補油量は0より大きい数値で指定してください");
  }

  const remainingCapacityTons =
    fuel.capacityTons - fuel.remainingTons;

  if (remainingCapacityTons <= 0) {
    throw new RangeError("燃料タンクは満タンです");
  }

  const refuelTons = Math.min(
    requestedTons,
    remainingCapacityTons,
  );

  if (!Number.isFinite(refuelTons) || refuelTons <= 0) {
    throw new RangeError("補油量を計算できません");
  }

  const cost = Math.ceil(
    refuelTons * FUEL_PRICE_GOLD_PER_TON,
  );

  if (!Number.isSafeInteger(cost) || cost < 0) {
    throw new RangeError("燃料代を計算できません");
  }

  return {
    refuelTons,
    cost,
    ship: {
      ...ship,
      fuel: {
        ...fuel,
        remainingTons: fuel.remainingTons + refuelTons,
      },
    },
  };
}

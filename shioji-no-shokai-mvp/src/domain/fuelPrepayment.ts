import { FUEL_PRICE_GOLD_PER_TON } from "../data/gameConstants";
import type { Ship } from "./types";
import type { ConfirmedVoyageRoute, ConfirmedVoyageRouteSection } from "./voyagePlanTypes";
import type { VoyagePlanPrediction } from "./voyagePlanPrediction";

export interface FuelPrepaymentSection {
  index: number;
  targetTons: number | null;
  prepaymentGold: number;
  plannedRefuelTons: number | null;
  estimatedRefundGold: number;
}

export interface FuelPrepaymentSummary {
  totalPrepaymentGold: number;
  sections: FuelPrepaymentSection[];
}

export function calculateFuelPrepaymentSummary(
  route: ConfirmedVoyageRoute,
  ship: Ship,
  plan: VoyagePlanPrediction,
): FuelPrepaymentSummary {
  const capacityTons = ship.fuel?.capacityTons ?? 0;
  const sections: FuelPrepaymentSection[] = [];
  let totalPrepaymentGold = 0;

  if (
    !Number.isFinite(capacityTons) ||
    capacityTons <= 0 ||
    !Number.isFinite(FUEL_PRICE_GOLD_PER_TON) ||
    FUEL_PRICE_GOLD_PER_TON <= 0
  ) {
    return { totalPrepaymentGold: 0, sections };
  }

  route.sections.slice(0, -1).forEach((section: ConfirmedVoyageRouteSection, index: number) => {
    const targetPercent = section.refuelTargetPercent;
    if (targetPercent === undefined) {
      sections.push({
        index,
        targetTons: null,
        prepaymentGold: 0,
        plannedRefuelTons: null,
        estimatedRefundGold: 0,
      });
      return;
    }

    const targetTons = capacityTons * (targetPercent / 100);
    const prepaymentGold = Math.ceil(
      targetTons * FUEL_PRICE_GOLD_PER_TON,
    );
    const arrivalTons = plan.sections[index]?.arrivalFuelTons ?? null;
    const plannedRefuelTons =
      arrivalTons === null
        ? null
        : Math.max(0, targetTons - arrivalTons);
    const estimatedRefundGold =
      plannedRefuelTons === null
        ? 0
        : prepaymentGold -
          Math.ceil(plannedRefuelTons * FUEL_PRICE_GOLD_PER_TON);

    totalPrepaymentGold += prepaymentGold;
    sections.push({
      index,
      targetTons,
      prepaymentGold,
      plannedRefuelTons,
      estimatedRefundGold,
    });
  });

  return { totalPrepaymentGold, sections };
}

import type { Ship } from "./types";
import type { CargoRequest } from "./lotContract";
import { getCargoForContract, getLotShipCapacity, isLegacyCargoContract, readCargoLotSnapshot } from "./lotContract";
import { getCargoLotById } from "../data/cargoLots";

export function formatCargoMeasure(value: number, unit: "t" | "m³"): string {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value > 0 && value < 0.01) return `0.01${unit}未満`;
  return `${value.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${unit}`;
}

/** Read-only presentation; old abstract quantities are never relabeled as physical units. */
export function getCargoPresentation(contract: CargoRequest) {
  try {
    const cargo = getCargoForContract(contract);
    const legacy = isLegacyCargoContract(contract);
    const quantity = contract.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
    const snapshot = readCargoLotSnapshot(contract);
    const requiredCargoWeight = snapshot?.totalWeightTons ?? cargo.weightPerUnit * quantity;
    const requiredCargoVolume = snapshot?.totalVolumeM3 ?? cargo.unitVolume * quantity;
    if (![requiredCargoWeight, requiredCargoVolume].every(n => Number.isFinite(n) && n >= 0)) return null;
    return {
      cargo, legacy, requiredCargoWeight, requiredCargoVolume,
      label: legacy ? `${cargo.name} ×${quantity}（旧単位）` : `${cargo.name} ${quantity}ロット`,
      packagingLabel: legacy ? "旧契約の記録" : snapshot?.packagingLabel ?? getCargoLotById(contract.cargoId).packagingLabel,
      weightLabel: legacy ? `${requiredCargoWeight}（旧重量単位）` : formatCargoMeasure(requiredCargoWeight, "t"),
      volumeLabel: legacy ? `${requiredCargoVolume}（旧容積単位）` : formatCargoMeasure(requiredCargoVolume, "m³"),
    };
  } catch { return null; }
}

export function getLotCapacityForDisplay(ship: Ship) {
  try { return getLotShipCapacity(ship); }
  catch { return null; }
}

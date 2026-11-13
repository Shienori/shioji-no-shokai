import type { CargoCategory, CargoId, CommodityId } from "./types";

export const CARGO_LOT_DATA_VERSION = "cargo-lot-v1";

export interface CargoLotDefinition {
  readonly dataVersion: typeof CARGO_LOT_DATA_VERSION;
  readonly id: CargoId;
  readonly name: string;
  readonly commodity: CommodityId;
  readonly category: CargoCategory;
  readonly transportUnitLabel: "ロット";
  readonly packagingLabel: string;
  readonly weightTonsPerLot: number;
  readonly volumeM3PerLot: number;
  readonly unitPrice: number;
  readonly loadingTimeMsPerLot: number;
  readonly unloadingTimeMsPerLot: number;
  readonly rewardMultiplier: number;
  readonly initialLotQuantities: { readonly small: number; readonly standard: number; readonly large: number };
}

export interface CargoLotRequirements {
  totalWeightTons: number;
  totalVolumeM3: number;
  cargoValue: number;
  loadingDurationMs: number;
  unloadingDurationMs: number;
}

export interface CargoLotSnapshot extends CargoLotRequirements {
  dataVersion: typeof CARGO_LOT_DATA_VERSION;
  cargoId: CargoId;
  cargoName: string;
  transportUnitLabel: "ロット";
  packagingLabel: string;
  quantityLots: number;
  weightTonsPerLot: number;
  volumeM3PerLot: number;
  unitPrice: number;
  loadingTimeMsPerLot: number;
  unloadingTimeMsPerLot: number;
}

export function calculateCargoLotRequirements(lot: CargoLotDefinition, quantityLots: number): CargoLotRequirements {
  if (lot.dataVersion !== CARGO_LOT_DATA_VERSION || lot.transportUnitLabel !== "ロット") throw new Error("Unsupported cargo unit version");
  if (!Number.isSafeInteger(quantityLots) || quantityLots <= 0) throw new RangeError("Cargo quantity must be a positive integer number of lots");
  for (const value of [lot.weightTonsPerLot, lot.volumeM3PerLot, lot.loadingTimeMsPerLot, lot.unloadingTimeMsPerLot]) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError("Invalid cargo lot specification");
  }
  if (!Number.isFinite(lot.unitPrice) || lot.unitPrice < 0) throw new RangeError("Invalid cargo unit price");
  const result = {
    totalWeightTons: lot.weightTonsPerLot * quantityLots,
    totalVolumeM3: lot.volumeM3PerLot * quantityLots,
    cargoValue: lot.unitPrice * quantityLots,
    loadingDurationMs: lot.loadingTimeMsPerLot * quantityLots,
    unloadingDurationMs: lot.unloadingTimeMsPerLot * quantityLots,
  };
  if (Object.values(result).some(value => !Number.isFinite(value))) throw new RangeError("Cargo lot total overflow");
  return result;
}

/** New-unit contracts only. Legacy abstract quantities are never converted here. */
export function createCargoLotSnapshot(lot: CargoLotDefinition, quantityLots: number): CargoLotSnapshot {
  return {
    dataVersion: CARGO_LOT_DATA_VERSION,
    cargoId: lot.id, cargoName: lot.name, transportUnitLabel: lot.transportUnitLabel,
    packagingLabel: lot.packagingLabel, quantityLots,
    weightTonsPerLot: lot.weightTonsPerLot, volumeM3PerLot: lot.volumeM3PerLot,
    unitPrice: lot.unitPrice,
    loadingTimeMsPerLot: lot.loadingTimeMsPerLot,
    unloadingTimeMsPerLot: lot.unloadingTimeMsPerLot,
    ...calculateCargoLotRequirements(lot, quantityLots),
  };
}

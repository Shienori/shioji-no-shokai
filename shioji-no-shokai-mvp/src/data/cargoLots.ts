import { CARGO_LOT_DATA_VERSION } from "../domain/cargoLotUnits";
import type { CargoLotDefinition } from "../domain/cargoLotUnits";

// Migration destination only. Existing getCargoById consumers still use legacy units.
const common = { dataVersion: CARGO_LOT_DATA_VERSION, transportUnitLabel: "ロット" } as const;

export const cargoLots: readonly CargoLotDefinition[] = [
  { ...common, id: "cargo_wheat", name: "袋詰め小麦", commodity: "wheat", category: "normal", packagingLabel: "袋詰め・パレット積み", weightTonsPerLot: 0.50, volumeM3PerLot: 1.00, unitPrice: 3, loadingTimeMsPerLot: 30000, unloadingTimeMsPerLot: 30000, rewardMultiplier: 1.0, initialLotQuantities: { small: 2, standard: 4, large: 8 } },
  { ...common, id: "cargo_steel", name: "鋼材", commodity: "steel", category: "normal", packagingLabel: "鋼材・パレット積み", weightTonsPerLot: 2.00, volumeM3PerLot: 0.50, unitPrice: 7, loadingTimeMsPerLot: 45000, unloadingTimeMsPerLot: 45000, rewardMultiplier: 1.3, initialLotQuantities: { small: 1, standard: 2, large: 4 } },
  { ...common, id: "cargo_silk", name: "絹布", commodity: "silk", category: "valuable", packagingLabel: "反物入り梱包箱のまとまり", weightTonsPerLot: 0.20, volumeM3PerLot: 2.00, unitPrice: 5, loadingTimeMsPerLot: 40000, unloadingTimeMsPerLot: 40000, rewardMultiplier: 0.7, initialLotQuantities: { small: 1, standard: 2, large: 4 } },
  { ...common, id: "cargo_iron_ore", name: "鉄鉱石", commodity: "iron_ore", category: "normal", packagingLabel: "鉱石入り箱のまとまり", weightTonsPerLot: 1.00, volumeM3PerLot: 0.50, unitPrice: 4, loadingTimeMsPerLot: 30000, unloadingTimeMsPerLot: 30000, rewardMultiplier: 1.0, initialLotQuantities: { small: 2, standard: 4, large: 8 } },
  { ...common, id: "cargo_pottery", name: "陶器", commodity: "pottery", category: "normal", packagingLabel: "緩衝材入り梱包箱のまとまり", weightTonsPerLot: 0.30, volumeM3PerLot: 1.50, unitPrice: 7, loadingTimeMsPerLot: 35000, unloadingTimeMsPerLot: 35000, rewardMultiplier: 0.8, initialLotQuantities: { small: 1, standard: 3, large: 5 } },
  { ...common, id: "cargo_timber", name: "木材", commodity: "timber", category: "normal", packagingLabel: "材木の結束単位", weightTonsPerLot: 0.80, volumeM3PerLot: 2.00, unitPrice: 2, loadingTimeMsPerLot: 25000, unloadingTimeMsPerLot: 25000, rewardMultiplier: 0.8, initialLotQuantities: { small: 1, standard: 2, large: 4 } },
  { ...common, id: "cargo_wine", name: "ワイン", commodity: "wine", category: "valuable", packagingLabel: "樽のまとまり", weightTonsPerLot: 0.50, volumeM3PerLot: 1.00, unitPrice: 10, loadingTimeMsPerLot: 50000, unloadingTimeMsPerLot: 50000, rewardMultiplier: 1.0, initialLotQuantities: { small: 2, standard: 4, large: 8 } },
  { ...common, id: "cargo_salt", name: "塩", commodity: "salt", category: "normal", packagingLabel: "袋詰め・パレット積み", weightTonsPerLot: 0.50, volumeM3PerLot: 0.80, unitPrice: 3, loadingTimeMsPerLot: 30000, unloadingTimeMsPerLot: 30000, rewardMultiplier: 1.0, initialLotQuantities: { small: 2, standard: 4, large: 8 } },
  { ...common, id: "cargo_spices", name: "香辛料", commodity: "spices", category: "valuable", packagingLabel: "小箱のまとまり", weightTonsPerLot: 0.20, volumeM3PerLot: 1.00, unitPrice: 12, loadingTimeMsPerLot: 45000, unloadingTimeMsPerLot: 45000, rewardMultiplier: 1.0, initialLotQuantities: { small: 1, standard: 3, large: 6 } },
];

export function getCargoLotById(id: string): CargoLotDefinition {
  const lot = cargoLots.find(item => item.id === id);
  if (!lot) throw new Error(`Unknown cargo lot: ${id}`);
  return lot;
}

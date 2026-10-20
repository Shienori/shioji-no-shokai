import type { Cargo } from "../domain/types";

export const cargos: Cargo[] = [
  { id: "cargo_wheat", name: "小麦(袋)", commodity: "wheat", packaging: "bag", category: "normal", unitPrice: 3, unitVolume: 1, weightPerUnit: 1, loadingTimeMsPerUnit: 30000, unloadingTimeMsPerUnit: 30000 },
  { id: "cargo_steel", name: "鋼材(パレット)", commodity: "steel", packaging: "pallet", category: "normal", unitPrice: 7, unitVolume: 1, weightPerUnit: 2, loadingTimeMsPerUnit: 45000, unloadingTimeMsPerUnit: 45000 },
  { id: "cargo_silk", name: "絹布(箱)", commodity: "silk", packaging: "box", category: "valuable", unitPrice: 5, unitVolume: 1, weightPerUnit: 1, loadingTimeMsPerUnit: 40000, unloadingTimeMsPerUnit: 40000 },
  { id: "cargo_iron_ore", name: "鉄鉱石(箱)", commodity: "iron_ore", packaging: "box", category: "normal", unitPrice: 4, unitVolume: 1, weightPerUnit: 3, loadingTimeMsPerUnit: 30000, unloadingTimeMsPerUnit: 30000 },
  { id: "cargo_pottery", name: "陶器(箱)", commodity: "pottery", packaging: "box", category: "normal", unitPrice: 7, unitVolume: 2, weightPerUnit: 1, loadingTimeMsPerUnit: 35000, unloadingTimeMsPerUnit: 35000 },
  { id: "cargo_timber", name: "木材(丸太)", commodity: "timber", packaging: "pallet", category: "normal", unitPrice: 2, unitVolume: 2, weightPerUnit: 2, loadingTimeMsPerUnit: 25000, unloadingTimeMsPerUnit: 25000 },
  { id: "cargo_wine", name: "ワイン(樽)", commodity: "wine", packaging: "pallet", category: "valuable", unitPrice: 10, unitVolume: 1, weightPerUnit: 2, loadingTimeMsPerUnit: 50000, unloadingTimeMsPerUnit: 50000 }
];

export function getCargoById(id: string): Cargo {
  const cargo = cargos.find((item) => item.id === id);
  if (!cargo) throw new Error(`Unknown cargo: ${id}`);
  return cargo;
}

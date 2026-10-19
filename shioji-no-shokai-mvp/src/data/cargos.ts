import type { Cargo } from "../domain/types";

export const cargos: Cargo[] = [
  { id: "cargo_wheat", name: "小麦(袋)", commodity: "wheat", packaging: "bag", category: "normal", unitPrice: 3, unitVolume: 1, weightPerUnit: 1, loadingTimeMsPerUnit: 30000, unloadingTimeMsPerUnit: 30000 },
  { id: "cargo_steel", name: "鋼材(パレット)", commodity: "steel", packaging: "pallet", category: "normal", unitPrice: 7, unitVolume: 1, weightPerUnit: 2, loadingTimeMsPerUnit: 45000, unloadingTimeMsPerUnit: 45000 },
  { id: "cargo_silk", name: "絹布(箱)", commodity: "silk", packaging: "box", category: "valuable", unitPrice: 5, unitVolume: 1, weightPerUnit: 1, loadingTimeMsPerUnit: 40000, unloadingTimeMsPerUnit: 40000 },
  { id: "cargo_iron_ore", name: "鉄鉱石(箱)", commodity: "iron_ore", packaging: "box", category: "normal", unitPrice: 4, unitVolume: 1, weightPerUnit: 3, loadingTimeMsPerUnit: 30000, unloadingTimeMsPerUnit: 30000 }
];

export function getCargoById(id: string): Cargo {
  const cargo = cargos.find((item) => item.id === id);
  if (!cargo) throw new Error(`Unknown cargo: ${id}`);
  return cargo;
}

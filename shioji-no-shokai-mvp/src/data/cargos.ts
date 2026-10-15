import type { Cargo } from "../domain/types";

export const cargos: Cargo[] = [
  { id: "cargo_wheat", name: "袋詰め小麦", category: "normal", unitPrice: 3, unitVolume: 1, weightPerUnit: 0.5, loadingTimeMsPerUnit: 30000, unloadingTimeMsPerUnit: 30000 },
  { id: "cargo_fish", name: "鮮魚", category: "perishable", unitPrice: 5, unitVolume: 1, weightPerUnit: 0.3, loadingTimeMsPerUnit: 20000, unloadingTimeMsPerUnit: 20000 },
  { id: "cargo_steel", name: "鋼材", category: "normal", unitPrice: 8, unitVolume: 1, weightPerUnit: 2, loadingTimeMsPerUnit: 45000, unloadingTimeMsPerUnit: 45000 },
  { id: "cargo_silk", name: "絹布", category: "valuable", unitPrice: 20, unitVolume: 2, weightPerUnit: 0.2, loadingTimeMsPerUnit: 40000, unloadingTimeMsPerUnit: 40000 }
];

export function getCargoById(id: string): Cargo {
  const cargo = cargos.find((item) => item.id === id);
  if (!cargo) throw new Error(`Unknown cargo: ${id}`);
  return cargo;
}

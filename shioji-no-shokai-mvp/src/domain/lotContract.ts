import type { AcceptedContract, Cargo, ContractTemplate, Ship } from "./types";
import type { CargoLotSnapshot } from "./cargoLotUnits";
import { CARGO_LOT_DATA_VERSION, createCargoLotSnapshot } from "./cargoLotUnits";
import { getCargoLotById } from "../data/cargoLots";
import { getCargoById } from "../data/cargos";
import { shionamiDesignV1 } from "../data/shipDesigns";

export type LotAcceptedContract = AcceptedContract & { cargoLotSnapshot: CargoLotSnapshot };
export type CargoRequest = Pick<ContractTemplate, "cargoId" | "quantity"> & { acceptedAt?: number; cargoLotSnapshot?: unknown };

export function isLegacyCargoContract(contract: CargoRequest): boolean {
  return Object.prototype.hasOwnProperty.call(contract, "acceptedAt") &&
    !Object.prototype.hasOwnProperty.call(contract, "cargoLotSnapshot");
}

/** Missing means legacy; present but invalid must never fall back to old units. */
export function readCargoLotSnapshot(contract: CargoRequest): CargoLotSnapshot | null {
  if (!Object.prototype.hasOwnProperty.call(contract, "cargoLotSnapshot")) return null;
  const raw = contract.cargoLotSnapshot;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid cargo lot snapshot");
  const s = raw as CargoLotSnapshot;
  if (s.dataVersion !== CARGO_LOT_DATA_VERSION || s.cargoId !== contract.cargoId ||
      s.quantityLots !== contract.quantity || !Number.isSafeInteger(s.quantityLots) || s.quantityLots <= 0 ||
      s.transportUnitLabel !== "ロット" || typeof s.cargoName !== "string" || !s.cargoName ||
      typeof s.packagingLabel !== "string" || !s.packagingLabel) throw new Error("Cargo lot snapshot identity mismatch");
  for (const n of [s.weightTonsPerLot, s.volumeM3PerLot, s.loadingTimeMsPerLot, s.unloadingTimeMsPerLot]) {
    if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid saved cargo lot specification");
  }
  if (!Number.isFinite(s.unitPrice) || s.unitPrice < 0) throw new Error("Invalid saved cargo price");
  const pairs = [
    [s.totalWeightTons, s.weightTonsPerLot * s.quantityLots],
    [s.totalVolumeM3, s.volumeM3PerLot * s.quantityLots],
    [s.cargoValue, s.unitPrice * s.quantityLots],
    [s.loadingDurationMs, s.loadingTimeMsPerLot * s.quantityLots],
    [s.unloadingDurationMs, s.unloadingTimeMsPerLot * s.quantityLots],
  ];
  if (pairs.some(([saved, calculated]) => !Number.isFinite(saved) || saved !== calculated)) throw new Error("Inconsistent saved cargo totals");
  return s;
}

export function getLotShipCapacity(ship: Ship): { maxCargoWeightTons: number; maxCargoVolumeM3: number } {
  if (![ship.maxCargoWeight, ship.maxCargoVolume].every(n => Number.isFinite(n) && n > 0)) throw new Error("Invalid ship capacity");
  if (ship.id !== shionamiDesignV1.shipId) throw new Error("Ship has no approved lot-unit capacity");
  return {
    maxCargoWeightTons: shionamiDesignV1.cargoCapacity.maxWeightTons,
    maxCargoVolumeM3: shionamiDesignV1.cargoCapacity.maxVolumeM3,
  };
}

export function getCargoForContract(contract: CargoRequest): Cargo {
  const legacy = getCargoById(contract.cargoId);
  if (isLegacyCargoContract(contract)) return legacy;
  const s = readCargoLotSnapshot(contract) ?? createCargoLotSnapshot(getCargoLotById(contract.cargoId), contract.quantity);
  return {
    ...legacy, name: s.cargoName, unitPrice: s.unitPrice,
    weightPerUnit: s.weightTonsPerLot, unitVolume: s.volumeM3PerLot,
    loadingTimeMsPerUnit: s.loadingTimeMsPerLot, unloadingTimeMsPerUnit: s.unloadingTimeMsPerLot,
  };
}

export function cargoFitsLotShip(snapshot: CargoLotSnapshot, ship: Ship): boolean {
  const capacity = getLotShipCapacity(ship);
  const fits = (required: number, limit: number) => Number.isFinite(required) && required >= 0 &&
    required - limit <= Number.EPSILON * 8 * Math.max(1, required, limit);
  return fits(snapshot.totalWeightTons, capacity.maxCargoWeightTons) && fits(snapshot.totalVolumeM3, capacity.maxCargoVolumeM3);
}

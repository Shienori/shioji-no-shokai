export type PortId = string;
export type RouteId = string;
export type CargoId = string;
export type ContractId = string;
export type ShipId = string;
export type ShipperId = string;
export type GameTimeMs = number;
export type OperationTimeMs = number;
export type RealTimeMs = number;
export type Gold = number;
export type CargoVolume = number;
export type CargoWeight = number;
export type NauticalMiles = number;

export type CommodityId = "wheat" | "steel" | "silk" | "iron_ore" | "pottery" | "timber" | "wine" | "salt" | "spices";
export type CargoPackaging = "bag" | "pallet" | "box";
export type CargoCategory = "normal" | "perishable" | "valuable" | "dangerous";
export type ShipRole = "general_cargo";
export type ShipKind = "sailing" | "powered";
export type ShipStatus = "docked" | "loading" | "sailing" | "unloading";
export type VoyagePhase = "loading" | "sailing" | "unloading" | "completed";
export type ContractDifficulty = "easy" | "normal" | "hard";

import type { RouteSeaForecast } from "./seaCondition";
import type { ContractWindForecastSnapshot } from "./contractWindForecast";
import type { RouteWindLeg } from "./routeWind";

export type FuelType = "coal";
export type FuelTons = number;

/** Definition only. Runtime validation and legacy-save initialization are separate. */
export interface ShipFuelState {
  fuelType: FuelType;
  capacityTons: FuelTons;
  remainingTons: FuelTons;
  referenceSpeedKnots: number;
  referenceConsumptionTonsPerVoyageHour: FuelTons;
}

/**
 * Present only on voyages explicitly created with the new fuel model.
 * Uses Voyage.lastProcessedRealTime/currentSeaHexIndex/distanceIntoHexNm
 * as the progress checkpoint; ship.fuel.remainingTons is the balance source.
 * Legacy voyages have no fuelNavigation; absence must not enable consumption.
 */
export interface VoyageFuelNavigation {
  modelVersion: "coal-fuel-v1";
  shipPerformanceModelVersion: string;
  windModelVersion: string;
  fuelType: FuelType;
  selectedSpeedKnots: number;
  loadSpeedFactor: number;
  referenceSpeedKnots: number;
  referenceConsumptionTonsPerVoyageHour: FuelTons;
  routeLegs: RouteWindLeg[];
  fuelConsumedTons: FuelTons;
}

/**
 * Terminal cancellation record, not a normal arrival or settlement.
 * The agreed initial policy is immediate return to the contract departure port,
 * free refill to capacity, no payout, money charge or reputation penalty.
 * Presence identifies a terminated memo even when settlement remains null.
 */
export interface FuelDepletionReturn {
  reason: "fuel_depleted";
  occurredAtRealTime: RealTimeMs;
  stoppedHexId: string;
  distanceIntoHexNm: NauticalMiles;
  returnedToPortId: PortId;
  fuelConsumedTons: FuelTons;
  fuelRefilledTons: FuelTons;
}

export interface Port { id: PortId; name: string; description: string; }
export interface Route { id: RouteId; fromPortId: PortId; toPortId: PortId; distance: NauticalMiles; baseVoyageHours: number; }
export interface Cargo { id: CargoId; name: string; commodity: CommodityId; packaging: CargoPackaging; category: CargoCategory; unitPrice: Gold; unitVolume: CargoVolume; weightPerUnit: number; loadingTimeMsPerUnit: number; unloadingTimeMsPerUnit: number; }
export interface Shipper {
  id: ShipperId;
  name: string;
  homePortId?: PortId;
  description?: string;
  organizationType?: "guild";
  primaryCargoIds?: CargoId[];
  secondaryCargoIds?: CargoId[];
}
export interface ContractTemplate { id: ContractId; shipperId: ShipperId; routeId: RouteId; cargoId: CargoId; quantity: number; offeredReward: Gold; deadlineHours: number; difficulty: ContractDifficulty; }
export interface ContractRewardBreakdown { cargoValue: Gold; voyageDistanceAllowance: Gold; otherAdjustment: Gold; offeredReward: Gold; }
export interface OfferedContract { id: string; templateId: ContractId; generatedAt: RealTimeMs; deadlineAt: RealTimeMs; timeAllowanceRatio: number; }
export interface AcceptedContract { id: ContractId; templateId: ContractId; shipperId: ShipperId; routeId: RouteId; cargoId: CargoId; quantity: number; reward: ContractRewardBreakdown; acceptedAt: RealTimeMs; deadlineAt: RealTimeMs; seaForecast?: RouteSeaForecast; windForecastSnapshot?: ContractWindForecastSnapshot; windForecastSnapshotIssue?: "invalid"; }
export interface Ship { id: ShipId; name: string; kind: ShipKind; role: ShipRole; maxCargoVolume: CargoVolume; maxCargoWeight: CargoWeight; cruisingSpeedKnots: number; maxSpeedKnots: number; engineType: string; engineOutput: string; currentPortId: PortId; currentHexId: string; status: ShipStatus; activeContractId: ContractId | null; fuel?: ShipFuelState; }
export interface Voyage { id: string; shipId: ShipId; contractId: ContractId; phase: VoyagePhase; loadingStartedAt: OperationTimeMs; loadingCompletedAt: OperationTimeMs; departedAt: OperationTimeMs; departedRealTime: RealTimeMs; lastProcessedRealTime: RealTimeMs; currentSeaHexIndex: number; distanceIntoHexNm: number; shipSpeedKnots: number; forecastEtaRealTime: RealTimeMs; estimatedArrivalAt: OperationTimeMs; arrivalDeadlineAt: OperationTimeMs; arrivedAt: OperationTimeMs | null; arrivalLateHours: number; isOnTime: boolean; unloadingStartedAt: OperationTimeMs | null; unloadingCompletedAt: OperationTimeMs | null; completedAtWorldTime: RealTimeMs | null; settled: boolean; fuelNavigation?: VoyageFuelNavigation; }
export interface VoyageMemoSettlement { offeredReward: Gold; latePenalty: Gold; receivedReward: Gold; expense: Gold; guaranteeAmount: Gold; finalPayout: Gold; }
export interface VoyageMemo { voyageNumber: number; label: string; contractId: ContractId; shipId: ShipId; shipName: string; routeLabel: string; cargoLabel: string; acceptedAt: RealTimeMs; acceptedOperationTime: OperationTimeMs; plannedEtaRealTime: RealTimeMs; actualArrivalRealTime: RealTimeMs | null; etaDiffMinutes: number | null; settlement: VoyageMemoSettlement | null; fuelConsumedTons?: FuelTons; fuelDepletionReturn?: FuelDepletionReturn; }
export interface ReputationState { shipperId: ShipperId; value: number; }
export interface GameState { playerId: string; currentGameTime: RealTimeMs; operationTime: OperationTimeMs; lastRealTimeSyncedAt: RealTimeMs; money: Gold; ships: Ship[]; activeVoyage: Voyage | null; acceptedContract: AcceptedContract | null; offeredContractIds: ContractId[]; acceptedContractIds: ContractId[]; voyageMemos: VoyageMemo[]; reputations: ReputationState[]; tutorialCompleted: boolean; selectedPortId: PortId; portOffers: Record<PortId, OfferedContract[]>; nextRefreshAt: RealTimeMs; }
export interface SaveData { version: number; savedAtRealTime: number; gameState: GameState; }

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

export type CommodityId = "wheat" | "steel" | "silk";
export type CargoPackaging = "bag" | "pallet" | "box";
export type CargoCategory = "normal" | "perishable" | "valuable" | "dangerous";
export type ShipRole = "general_cargo";
export type ShipKind = "sailing" | "powered";
export type ShipStatus = "docked" | "loading" | "sailing" | "unloading";
export type VoyagePhase = "loading" | "sailing" | "unloading" | "completed";

import type { RouteSeaForecast } from "./seaCondition";

export interface Port { id: PortId; name: string; description: string; }
export interface Route { id: RouteId; fromPortId: PortId; toPortId: PortId; distance: NauticalMiles; baseVoyageHours: number; }
export interface Cargo { id: CargoId; name: string; commodity: CommodityId; packaging: CargoPackaging; category: CargoCategory; unitPrice: Gold; unitVolume: CargoVolume; weightPerUnit: CargoWeight; loadingTimeMsPerUnit: number; unloadingTimeMsPerUnit: number; }
export interface Shipper { id: ShipperId; name: string; }
export interface ContractTemplate { id: ContractId; shipperId: ShipperId; routeId: RouteId; cargoId: CargoId; quantity: number; offeredReward: Gold; deadlineHours: number; }
export interface ContractRewardBreakdown { cargoValue: Gold; voyageDistanceAllowance: Gold; otherAdjustment: Gold; offeredReward: Gold; }
export interface OfferedContract { id: string; templateId: ContractId; generatedAt: RealTimeMs; deadlineAt: RealTimeMs; timeAllowanceRatio: number; }
export interface AcceptedContract { id: ContractId; templateId: ContractId; shipperId: ShipperId; routeId: RouteId; cargoId: CargoId; quantity: number; reward: ContractRewardBreakdown; acceptedAt: RealTimeMs; deadlineAt: RealTimeMs; seaForecast?: RouteSeaForecast; }
export interface Ship { id: ShipId; name: string; kind: ShipKind; role: ShipRole; maxCargoVolume: CargoVolume; maxCargoWeight: CargoWeight; cruisingSpeedKnots: number; maxSpeedKnots: number; engineType: string; engineOutput: string; currentPortId: PortId; currentHexId: string; status: ShipStatus; activeContractId: ContractId | null; }
export interface Voyage { id: string; shipId: ShipId; contractId: ContractId; phase: VoyagePhase; loadingStartedAt: OperationTimeMs; loadingCompletedAt: OperationTimeMs; departedAt: OperationTimeMs; departedRealTime: RealTimeMs; lastProcessedRealTime: RealTimeMs; currentSeaHexIndex: number; distanceIntoHexNm: number; shipSpeedKnots: number; forecastEtaRealTime: RealTimeMs; estimatedArrivalAt: OperationTimeMs; arrivalDeadlineAt: OperationTimeMs; arrivedAt: OperationTimeMs | null; arrivalLateHours: number; isOnTime: boolean; unloadingStartedAt: OperationTimeMs | null; unloadingCompletedAt: OperationTimeMs | null; completedAtWorldTime: RealTimeMs | null; settled: boolean; }
export interface ReputationState { shipperId: ShipperId; value: number; }
export interface GameState { playerId: string; currentGameTime: RealTimeMs; operationTime: OperationTimeMs; lastRealTimeSyncedAt: RealTimeMs; money: Gold; ships: Ship[]; activeVoyage: Voyage | null; acceptedContract: AcceptedContract | null; offeredContractIds: ContractId[]; acceptedContractIds: ContractId[]; reputations: ReputationState[]; tutorialCompleted: boolean; selectedPortId: PortId; portOffers: Record<PortId, OfferedContract[]>; nextRefreshAt: RealTimeMs; }
export interface SaveData { version: number; savedAtRealTime: number; gameState: GameState; }

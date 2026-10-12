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
export type LoadUnits = number;
export type NauticalMiles = number;

export type CargoCategory = "normal" | "perishable" | "valuable" | "dangerous";
export type ShipKind = "sailing" | "powered";
export type ShipStatus = "docked" | "loading" | "sailing" | "unloading";
export type VoyagePhase = "loading" | "sailing" | "unloading" | "completed";

export interface Port { id: PortId; name: string; description: string; }
export interface Route { id: RouteId; fromPortId: PortId; toPortId: PortId; distance: NauticalMiles; baseVoyageHours: number; }
export interface Cargo { id: CargoId; name: string; category: CargoCategory; unitPrice: Gold; loadUnitsPerUnit: LoadUnits; loadingTimeMsPerUnit: number; unloadingTimeMsPerUnit: number; }
export interface Shipper { id: ShipperId; name: string; }
export interface ContractTemplate { id: ContractId; shipperId: ShipperId; routeId: RouteId; cargoId: CargoId; quantity: number; offeredReward: Gold; deadlineHours: number; }
export interface ContractRewardBreakdown { cargoValue: Gold; voyageDistanceAllowance: Gold; otherAdjustment: Gold; offeredReward: Gold; }
export interface AcceptedContract { id: ContractId; templateId: ContractId; shipperId: ShipperId; routeId: RouteId; cargoId: CargoId; quantity: number; reward: ContractRewardBreakdown; acceptedAt: RealTimeMs; deadlineAt: RealTimeMs; }
export interface Ship { id: ShipId; name: string; kind: ShipKind; maxLoadUnits: LoadUnits; baseSpeedKnots: number; currentPortId: PortId; currentHexId: string; status: ShipStatus; activeContractId: ContractId | null; }
export interface Voyage { id: string; shipId: ShipId; contractId: ContractId; phase: VoyagePhase; loadingStartedAt: OperationTimeMs; loadingCompletedAt: OperationTimeMs; departedAt: OperationTimeMs; estimatedArrivalAt: OperationTimeMs; arrivedAt: OperationTimeMs | null; unloadingStartedAt: OperationTimeMs | null; unloadingCompletedAt: OperationTimeMs | null; completedAtWorldTime: RealTimeMs | null; settled: boolean; }
export interface ReputationState { shipperId: ShipperId; value: number; }
export interface GameState { playerId: string; currentGameTime: RealTimeMs; operationTime: OperationTimeMs; lastRealTimeSyncedAt: RealTimeMs; money: Gold; ships: Ship[]; activeVoyage: Voyage | null; acceptedContract: AcceptedContract | null; offeredContractIds: ContractId[]; acceptedContractIds: ContractId[]; reputations: ReputationState[]; tutorialCompleted: boolean; }
export interface SaveData { version: number; savedAtRealTime: RealTimeMs; gameState: GameState; }

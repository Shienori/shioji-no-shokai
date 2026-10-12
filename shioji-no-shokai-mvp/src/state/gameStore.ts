import { create } from "zustand";
import type { AcceptedContract, GameState, Ship, ShipStatus, VoyagePhase } from "../domain/types";
import { initialShip } from "../data/ships";
import { initialContractTemplate, getContractTemplateById } from "../data/contracts";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";
import { createRewardBreakdown } from "../domain/reward";
import { createVoyage, progressVoyage } from "../domain/voyage";
import { settleContract } from "../domain/settlement";
import { advanceOperationTime } from "../domain/time";
import { loadGame, saveGame } from "../domain/save";
import { STARTING_MONEY } from "../data/gameConstants";
import { getPortHexId } from "../data/hexMap";

interface GameStore {
  gameState: GameState;
  selectedContractId: string | null;
  activeTab: "contracts" | "fleet";
  tick: () => void;
  selectContract: (id: string | null) => void;
  setActiveTab: (tab: "contracts" | "fleet") => void;
  acceptContract: (id: string) => void;
  settleContract: () => void;
}

function createInitialGameState(): GameState {
  const now = Date.now();
  return {
    playerId: "player_001",
    currentGameTime: now,
    operationTime: 0,
    lastRealTimeSyncedAt: now,
    money: STARTING_MONEY,
    ships: [{ ...initialShip }],
    activeVoyage: null,
    acceptedContract: null,
    offeredContractIds: [initialContractTemplate.id],
    acceptedContractIds: [],
    reputations: [
      { shipperId: "shipper_selene_farmers", value: 0 },
      { shipperId: "shipper_rigel_forge", value: 0 },
      { shipperId: "shipper_aldera_merchants", value: 0 }
    ],
    tutorialCompleted: false
  };
}

function getShipStatusForVoyage(phase: VoyagePhase): ShipStatus {
  if (phase === "loading") return "loading";
  if (phase === "sailing") return "sailing";
  return "unloading";
}

function progressVoyageIfActive(state: GameState, currentRealTime: number): GameState {
  if (!state.activeVoyage || !state.acceptedContract) return state;

  const voyage = progressVoyage(state.activeVoyage, state.acceptedContract, state.operationTime, currentRealTime);
  if (voyage === state.activeVoyage) return state;

  const ships = state.ships.map((ship): Ship =>
    ship.activeContractId === voyage.contractId
      ? { ...ship, status: getShipStatusForVoyage(voyage.phase) }
      : ship
  );

  return { ...state, activeVoyage: voyage, ships };
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: loadGame() ?? createInitialGameState(),
  selectedContractId: null,
  activeTab: "contracts",

  tick: () => {
    const current = get().gameState;
    const currentRealTime = Date.now();

    if (!current.activeVoyage || !current.acceptedContract) {
      set({
        gameState: {
          ...current,
          currentGameTime: currentRealTime,
          lastRealTimeSyncedAt: currentRealTime
        }
      });
      return;
    }

    let next: GameState = {
      ...current,
      currentGameTime: currentRealTime,
      operationTime: advanceOperationTime(current.operationTime, current.lastRealTimeSyncedAt, currentRealTime)
    };

    next = progressVoyageIfActive(next, currentRealTime);
    next.lastRealTimeSyncedAt = currentRealTime;

    saveGame(next);
    set({ gameState: next });
  },

  selectContract: (contractId) => set({ selectedContractId: contractId }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  acceptContract: (contractId) => {
    const current = get().gameState;
    const currentRealTime = Date.now();
    if (current.acceptedContract) return;

    const template = getContractTemplateById(contractId);
    const ship = current.ships[0];
    if (ship.status !== "docked") return;

    const route = getRouteById(template.routeId);
    const cargo = getCargoById(template.cargoId);
    if (ship.currentPortId !== route.fromPortId) return;

    const requiredLoadUnits = cargo.loadUnitsPerUnit * template.quantity;
    if (ship.maxLoadUnits < requiredLoadUnits) return;

    const loadingDurationMs = cargo.loadingTimeMsPerUnit * template.quantity;
    const unloadingDurationMs = cargo.unloadingTimeMsPerUnit * template.quantity;
    const voyageDurationMs = route.baseVoyageHours * 60 * 60 * 1000;
    const totalOperationDurationMs = loadingDurationMs + voyageDurationMs + unloadingDurationMs;
    const contractTimeLimitMs = Math.round((totalOperationDurationMs / 6) * 1.5);

    const reward = createRewardBreakdown(cargo.unitPrice * template.quantity, route.distance <= 30 ? 20 : route.distance <= 60 ? 35 : 60);

    const acceptedContract: AcceptedContract = {
      id: template.id,
      templateId: template.id,
      shipperId: template.shipperId,
      routeId: template.routeId,
      cargoId: template.cargoId,
      quantity: template.quantity,
      reward,
      acceptedAt: currentRealTime,
      deadlineAt: currentRealTime + contractTimeLimitMs
    };

    const voyage = createVoyage(acceptedContract, ship, current.operationTime);
    const updatedShip = {
      ...ship,
      status: "loading" as const,
      currentHexId: getPortHexId(route.fromPortId),
      activeContractId: acceptedContract.id
    };

    const next: GameState = {
      ...current,
      currentGameTime: currentRealTime,
      lastRealTimeSyncedAt: currentRealTime,
      ships: [updatedShip],
      activeVoyage: voyage,
      acceptedContract,
      acceptedContractIds: [...current.acceptedContractIds, acceptedContract.id],
      offeredContractIds: current.offeredContractIds.filter((id) => id !== acceptedContract.id)
    };

    saveGame(next);
    set({ gameState: next, selectedContractId: null });
  },

  settleContract: () => {
    const current = get().gameState;
    const voyage = current.activeVoyage;
    const contract = current.acceptedContract;
    if (!voyage || !contract || voyage.settled || voyage.phase !== "completed") return;

    const result = settleContract(contract, voyage);
    const ship = current.ships[0];
    const route = getRouteById(contract.routeId);
    const updatedShip = {
      ...ship,
      status: "docked" as const,
      currentPortId: route.toPortId,
      currentHexId: getPortHexId(route.toPortId),
      activeContractId: null
    };

    const updatedReputations = current.reputations.map((reputation) =>
      reputation.shipperId === contract.shipperId
        ? { ...reputation, value: Math.max(-3, Math.min(3, reputation.value + result.reputationChange)) }
        : reputation
    );

    const next: GameState = {
      ...current,
      money: current.money + result.finalPayout,
      ships: [updatedShip],
      activeVoyage: null,
      acceptedContract: null,
      reputations: updatedReputations,
      tutorialCompleted: true
    };

    saveGame(next);
    set({ gameState: next });
  }
}));

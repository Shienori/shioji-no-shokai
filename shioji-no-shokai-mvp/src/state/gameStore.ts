import { create } from "zustand";
import type { AcceptedContract, ContractId, GameState, OfferedContract, PortId, Ship, ShipId, ShipStatus, VoyagePhase } from "../domain/types";
import { initialShip } from "../data/ships";
import { getContractPoolByPort, getContractTemplateById, tutorialWheatContract } from "../data/contracts";
import { ports } from "../data/ports";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";
import { createVoyage, progressVoyage } from "../domain/voyage";
import { settleContract } from "../domain/settlement";
import { advanceOperationTime } from "../domain/time";
import { calculateContractSchedule, createAcceptedContract, createOfferedContract } from "../domain/contractSchedule";
import { evaluateContractAcceptance } from "../domain/contractAcceptance";
import { loadGame, saveGame } from "../domain/save";
import { SAVE_KEY, STARTING_MONEY } from "../data/gameConstants";
import { getHexById, getPortHexId } from "../data/hexMap";
import { getRouteHexIds } from "../domain/routePath";

const CONTRACT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const FIXED_CONTRACT_ID = tutorialWheatContract.id;

interface GameStore {
  gameState: GameState;
  selectedContractId: string | null;
  selectedShipId: ShipId | null;
  activeTab: "contracts" | "fleet" | "chart";
  tick: () => void;
  selectContract: (id: string | null) => void;
  selectShip: (shipId: ShipId | null) => void;
  setActiveTab: (tab: "contracts" | "fleet" | "chart") => void;
  selectPort: (portId: PortId) => void;
  acceptContract: (contractId: string, shipId: string) => void;
  settleContract: () => void;
  resetGame: () => void;
}

function getNextRefreshTime(now: number): number {
  return Math.ceil((now + 1) / CONTRACT_REFRESH_INTERVAL_MS) * CONTRACT_REFRESH_INTERVAL_MS;
}

function pickPortOffers(portId: PortId, keepTemplateIds: ContractId[] = []): OfferedContract[] {
  const generatedAt = Date.now();
  const pool = getContractPoolByPort(portId)
    .filter((template) => template.id !== FIXED_CONTRACT_ID && !keepTemplateIds.includes(template.id));

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  const remainingCount = Math.max(0, 3 - keepTemplateIds.length);
  const selectedTemplates = [...pool.slice(0, remainingCount)];

  return selectedTemplates.map((template) =>
    createOfferedContract(template, getRouteById(template.routeId), generatedAt)
  );
}

function replenishAcceptedOffer(state: GameState, portId: PortId, acceptedTemplateId: ContractId): OfferedContract[] {
  const remainingOffers = (state.portOffers[portId] ?? []).filter(
    (offer) => offer.templateId !== acceptedTemplateId
  );
  const keepTemplateIds = remainingOffers.map((offer) => offer.templateId);
  const replacement = pickPortOffers(portId, keepTemplateIds);

  return [...remainingOffers, ...replacement].slice(0, 3);
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
    offeredContractIds: [],
    acceptedContractIds: [],
    reputations: [
      { shipperId: "shipper_selene_farmers", value: 0 },
      { shipperId: "shipper_aldera_merchants", value: 0 },
      { shipperId: "shipper_rigel_forge", value: 0 }
    ],
    tutorialCompleted: false,
    selectedPortId: "port_selene",
    portOffers: {
      port_selene: pickPortOffers("port_selene"),
      port_aldera: pickPortOffers("port_aldera"),
      port_rigel: pickPortOffers("port_rigel")
    },
    nextRefreshAt: getNextRefreshTime(now)
  };
}

function getShipStatusForVoyage(phase: VoyagePhase): ShipStatus {
  if (phase === "loading") return "loading";
  if (phase === "sailing") return "sailing";
  return "unloading";
}

function getShipCurrentHexId(
  contract: AcceptedContract,
  voyage: { phase: VoyagePhase; currentSeaHexIndex: number },
  operationTime: number
): string | null {
  const route = getRouteById(contract.routeId);
  const startHexId = getPortHexId(route.fromPortId);
  const goalHexId = getPortHexId(route.toPortId);

  if (voyage.phase === "loading") return startHexId;
  if (voyage.phase === "unloading" || voyage.phase === "completed") return goalHexId;

  const routeHexIds = getRouteHexIds(route.fromPortId, route.toPortId);
  if (!routeHexIds || routeHexIds.length < 2) return startHexId;

  const seaHexIds = routeHexIds.filter((hexId) => {
    return getHexById(hexId).kind === "sea";
  });

  if (seaHexIds.length === 0) return goalHexId;

  const seaHexIndex = Math.min(
    seaHexIds.length - 1,
    Math.max(0, voyage.currentSeaHexIndex)
  );

  return seaHexIds[seaHexIndex];
}

function syncActiveShipPosition(state: GameState): GameState {
  if (!state.activeVoyage || !state.acceptedContract) return state;

  const currentHexId = getShipCurrentHexId(
    state.acceptedContract,
    state.activeVoyage,
    state.operationTime
  );

  if (!currentHexId) return state;

  let changed = false;
  const ships = state.ships.map((ship): Ship => {
    if (ship.activeContractId !== state.activeVoyage!.contractId || ship.currentHexId === currentHexId) {
      return ship;
    }

    changed = true;
    return { ...ship, currentHexId };
  });

  return changed ? { ...state, ships } : state;
}

function progressVoyageIfActive(state: GameState, currentRealTime: number): GameState {
  if (!state.activeVoyage || !state.acceptedContract) return state;

  const voyage = progressVoyage(
    state.activeVoyage,
    state.acceptedContract,
    state.operationTime,
    currentRealTime
  );

  const ships = state.ships.map((ship) =>
    ship.activeContractId === voyage.contractId
      ? { ...ship, status: getShipStatusForVoyage(voyage.phase) }
      : ship
  );

  return { ...state, activeVoyage: voyage, ships };
}

function refreshContractsIfDue(state: GameState, currentRealTime: number): GameState {
  if (state.nextRefreshAt > currentRealTime) return state;

  const acceptedTemplateId = state.acceptedContract?.templateId ?? null;
  const portOffers = Object.fromEntries(
    ports.map((port) => {
      const currentOffers = state.portOffers[port.id] ?? [];
      const keepTemplateIds = acceptedTemplateId && currentOffers.some(
        (offer) => offer.templateId === acceptedTemplateId
      )
        ? [acceptedTemplateId]
        : [];
      return [port.id, pickPortOffers(port.id, keepTemplateIds)];
    })
  );

  return {
    ...state,
    portOffers,
    nextRefreshAt: getNextRefreshTime(currentRealTime)
  };
}

const loadedGameState = loadGame();
const defaultGameState = createInitialGameState();
const initialGameState = loadedGameState
  ? {
      ...defaultGameState,
      ...loadedGameState,
      selectedPortId: loadedGameState.selectedPortId ?? defaultGameState.selectedPortId,
      portOffers: loadedGameState.portOffers ?? defaultGameState.portOffers,
      nextRefreshAt: loadedGameState.nextRefreshAt ?? defaultGameState.nextRefreshAt
    }
  : defaultGameState;

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: initialGameState,
  selectedContractId: null,
  selectedShipId: null,
  activeTab: "contracts",

  tick: () => {
    const current = get().gameState;
    const currentRealTime = Date.now();

    let next: GameState = {
      ...current,
      currentGameTime: currentRealTime,
      operationTime: current.activeVoyage
        ? advanceOperationTime(current.operationTime, current.lastRealTimeSyncedAt, currentRealTime)
        : current.operationTime,
      lastRealTimeSyncedAt: currentRealTime
    };

    if (next.activeVoyage && next.acceptedContract) {
      next = progressVoyageIfActive(next, currentRealTime);
      next = syncActiveShipPosition(next);
    }

    next = refreshContractsIfDue(next, currentRealTime);

    saveGame(next);
    set({ gameState: next });
  },

  selectContract: (contractId) => set({ selectedContractId: contractId }),
  selectShip: (shipId) => set({ selectedShipId: shipId }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  selectPort: (portId) =>
    set({
      gameState: {
        ...get().gameState,
        selectedPortId: portId
      }
    }),

  acceptContract: (contractId, shipId) => {
    const current = get().gameState;
    const currentRealTime = Date.now();

    const template = getContractTemplateById(contractId);
    const ship = current.ships.find((item) => item.id === shipId);
    if (!ship) return;

    const acceptance = evaluateContractAcceptance(template, ship, current);
    if (!acceptance.canAccept) return;

    const route = getRouteById(template.routeId);
    const offeredContract = (current.portOffers[current.selectedPortId] ?? [])
      .find((offer) => offer.templateId === contractId);

    const deadlineAt = offeredContract?.deadlineAt ?? calculateContractSchedule(
      template,
      route,
      currentRealTime
    ).deadlineAt;

    const cargo = getCargoById(template.cargoId);
    const acceptedContract = createAcceptedContract(
      template,
      route,
      cargo,
      currentRealTime,
      deadlineAt
    );

    const voyage = createVoyage(
      acceptedContract,
      ship,
      current.operationTime,
      currentRealTime
    );
    const updatedShip = {
      ...ship,
      status: "loading" as const,
      currentHexId: getPortHexId(route.fromPortId),
      activeContractId: acceptedContract.id
    };

    const portOffers = { ...current.portOffers };
    if (offeredContract) {
      portOffers[current.selectedPortId] = replenishAcceptedOffer(
        current,
        current.selectedPortId,
        contractId
      );
    }

    const next: GameState = {
      ...current,
      currentGameTime: currentRealTime,
      lastRealTimeSyncedAt: currentRealTime,
      ships: current.ships.map((item) => (item.id === shipId ? updatedShip : item)),
      activeVoyage: voyage,
      acceptedContract,
      portOffers,
      acceptedContractIds: [...current.acceptedContractIds, acceptedContract.id]
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
    const route = getRouteById(contract.routeId);
    const updatedShips = current.ships.map((ship) =>
      ship.activeContractId === contract.id
        ? {
            ...ship,
            status: "docked" as const,
            currentPortId: route.toPortId,
            currentHexId: getPortHexId(route.toPortId),
            activeContractId: null
          }
        : ship
    );

    const updatedReputations = current.reputations.map((reputation) =>
      reputation.shipperId === contract.shipperId
        ? {
            ...reputation,
            value: Math.max(-3, Math.min(3, reputation.value + result.reputationChange))
          }
        : reputation
    );

    const next: GameState = {
      ...current,
      money: current.money + result.finalPayout,
      ships: updatedShips,
      activeVoyage: null,
      acceptedContract: null,
      reputations: updatedReputations,
      tutorialCompleted: true
    };

    saveGame(next);
    set({ gameState: next });
  },

  resetGame: () => {
    localStorage.removeItem(SAVE_KEY);
    const freshState = createInitialGameState();
    saveGame(freshState);
    set({
      gameState: freshState,
      selectedContractId: null,
      selectedShipId: null,
      activeTab: "contracts"
    });
  }
}));

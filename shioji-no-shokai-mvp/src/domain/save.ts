import type { GameState, SaveData, Ship } from "./types";
import { SAVE_KEY, SAVE_VERSION } from "../data/gameConstants";
import { getRouteById } from "../data/routes";
import { getPortHexId } from "../data/hexMap";

const REMOVED_FISH_CONTRACT_IDS = new Set([
  "contract_selene_001",
  "contract_selene_004"
]);

function migrateCargoData(state: GameState): GameState {
  const keepContractId = (id: string) => !REMOVED_FISH_CONTRACT_IDS.has(id);
  const contract = state.acceptedContract;
  const voyage = state.activeVoyage;
  const isRemovedFishContract = contract !== null && (
    contract.cargoId === "cargo_fish"
    || REMOVED_FISH_CONTRACT_IDS.has(contract.id)
    || REMOVED_FISH_CONTRACT_IDS.has(contract.templateId)
  );
  const isRemovedFishVoyage = voyage !== null && (
    isRemovedFishContract || REMOVED_FISH_CONTRACT_IDS.has(voyage.contractId)
  );
  const recoveryPortId = isRemovedFishContract && contract
    ? getRouteById(contract.routeId).fromPortId
    : "port_selene";

  const ships = state.ships.map((ship): Ship => {
    const normalizedShip: Ship = { ...ship, role: ship.role ?? "general_cargo" };
    const isAffectedShip = (
      isRemovedFishContract && contract !== null && ship.activeContractId === contract.id
    ) || (
      isRemovedFishVoyage && voyage !== null && ship.id === voyage.shipId
    ) || (
      ship.activeContractId !== null && REMOVED_FISH_CONTRACT_IDS.has(ship.activeContractId)
    );
    if (!isAffectedShip) return normalizedShip;
    return {
      ...normalizedShip,
      status: "docked",
      currentPortId: recoveryPortId,
      currentHexId: getPortHexId(recoveryPortId),
      activeContractId: null
    };
  });

  const portOffers = state.portOffers
    ? Object.fromEntries(Object.entries(state.portOffers).map(([portId, ids]) => [
        portId, ids.filter(keepContractId)
      ]))
    : state.portOffers;

  return {
    ...state,
    ships,
    portOffers,
    offeredContractIds: state.offeredContractIds.filter(keepContractId),
    acceptedContractIds: state.acceptedContractIds.filter(keepContractId),
    acceptedContract: isRemovedFishContract ? null : state.acceptedContract,
    activeVoyage: isRemovedFishVoyage ? null : state.activeVoyage
  };
}

export function saveGame(state: GameState): void {
  const saveData: SaveData = { version: SAVE_VERSION, savedAtRealTime: Date.now(), gameState: state };
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== SAVE_VERSION) return null;
    return migrateCargoData(parsed.gameState);
  } catch {
    return null;
  }
}

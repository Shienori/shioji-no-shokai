import type { GameState, OfferedContract, SaveData, Ship, Voyage } from "./types";
import { SAVE_KEY, SAVE_VERSION } from "../data/gameConstants";
import { getContractTemplateById } from "../data/contracts";
import { getRouteById } from "../data/routes";
import { getPortHexId } from "../data/hexMap";
import { createOfferedContract } from "./contractSchedule";
import { normalizeContractWindForecast } from "./contractWindForecast";
import { initializeLegacyCoalFuel } from "./coalFuel";
import { assertValidPlannedSave } from "./plannedSaveValidation";

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
    ? Object.fromEntries(Object.entries(state.portOffers).map(([portId, offers]) => {
        const rawOffers = offers as unknown as unknown[];
        if (rawOffers.length > 0 && typeof rawOffers[0] === "string") {
          return [portId, (rawOffers as string[])
            .filter(keepContractId)
            .map((templateId) => {
              const template = getContractTemplateById(templateId);
              return createOfferedContract(
                template,
                getRouteById(template.routeId),
                Date.now()
              );
            })];
        }
        return [portId, offers];
      }))
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

function migrateVoyageSeaConditionData(state: GameState): GameState {
  const voyage = state.activeVoyage;
  if (!voyage) return state;

  const voyageShip = state.ships.find((ship) => ship.id === voyage.shipId);
  const now = Date.now();
  const migratedVoyage: Voyage = {
    ...voyage,
    departedRealTime: voyage.departedRealTime ?? now,
    lastProcessedRealTime: voyage.lastProcessedRealTime ?? voyage.departedRealTime ?? now,
    currentSeaHexIndex: voyage.currentSeaHexIndex ?? 0,
    distanceIntoHexNm: voyage.distanceIntoHexNm ?? 0,
    shipSpeedKnots: voyage.shipSpeedKnots ?? voyageShip?.cruisingSpeedKnots ?? 6,
    forecastEtaRealTime: voyage.forecastEtaRealTime ?? now
  };

  return { ...state, activeVoyage: migratedVoyage };
}

export function saveGame(state: GameState): void {
  assertValidPlannedSave(state);
  const saveData: SaveData = { version: SAVE_VERSION, savedAtRealTime: Date.now(), gameState: state };
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

export function loadGame(): GameState | null {
  // Read only the current key. Old v7 data is neither read nor removed.
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  let parsed: SaveData;
  try { parsed = JSON.parse(raw) as SaveData; } catch {
    throw new Error("保存データを解析できません。既存データを保護するため読込を停止しました。");
  }
  if (!parsed || parsed.version !== SAVE_VERSION || !parsed.gameState || !Number.isFinite(parsed.savedAtRealTime)) {
    throw new Error("保存形式を確認できません。既存データを保護するため読込を停止しました。");
  }
  if (parsed.gameState.activeVoyage?.plannedNavigation !== undefined) {
    // Do not migrate, regenerate fuel/forecast, reset progress or silently start over.
    assertValidPlannedSave(parsed.gameState);
    return parsed.gameState;
  }
  try {
    // Retain the existing non-planned path while UI acceptance is still being connected.
    const gameState = initializeLegacyCoalFuel(normalizeContractWindForecast(migrateVoyageSeaConditionData(migrateCargoData(parsed.gameState))));
    return { ...gameState, voyageMemos: gameState.voyageMemos ?? [] };
  } catch {
    throw new Error("保存内容を確認できません。既存データを保護するため読込を停止しました。");
  }
}

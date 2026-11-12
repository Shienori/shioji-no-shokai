import { create } from "zustand";
import type {
  AcceptedContract,
  ContractTemplate,
  ContractId,
  GameState,
  OfferedContract,
  PortId,
  Ship,
  ShipId,
  ShipStatus,
  Voyage,
  VoyageMemo,
  VoyagePhase,
} from "../domain/types";
import { initialShip } from "../data/ships";
import { ensureMiraReputation } from "../data/shippers";
import {
  getContractDifficulty,
  getContractPoolByPort,
  getContractTemplateById,
  tutorialWheatContract,
} from "../data/contracts";
import { ports, getPortById } from "../data/ports";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";
import {
  createVoyage,
  progressVoyage,
  getHeavyLoadSpeedFactor,
  calculateArrivalLateHours,
} from "../domain/voyage";
import {
  advanceCoalVoyage,
  createCoalVoyageNavigation,
} from "../domain/coalVoyage";
import { progressConfirmedPlanLifecycle } from "../domain/confirmedPlanLifecycle";
import { createConfirmedPlanVoyage } from "../domain/confirmedPlanVoyage";
import { createConfirmedPlanReview } from "../domain/confirmedPlanReview";
import type {
  ConfirmedPlanReview,
  PlanAcceptanceResult,
} from "../domain/confirmedPlanReview";
import { isValidShipFuel } from "../domain/coalFuel";
import { applyDepartureFreeRefuel } from "../domain/freeRefuel";
import { isSelectedSpeedWithinLimits } from "../domain/voyageSpeedValidation";
import { readCargoLotSnapshot } from "../domain/lotContract";
import { settleContract } from "../domain/settlement";
import { advanceOperationTime } from "../domain/time";
import {
  calculateContractSchedule,
  createAcceptedContract,
  createOfferedContract,
} from "../domain/contractSchedule";
import { evaluateContractAcceptance } from "../domain/contractAcceptance";
import { loadGame, saveGame } from "../domain/save";
import {
  GAME_TIME_MULTIPLIER,
  FUEL_PRICE_GOLD_PER_TON,
  SAVE_KEY,
  SAVE_VERSION,
  STARTING_MONEY,
} from "../data/gameConstants";
import { getHexById, getPortHexId } from "../data/hexMap";
import { getRouteHexIds } from "../domain/routePath";

const CONTRACT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const FIXED_CONTRACT_ID = tutorialWheatContract.id;
const MIN_NORMAL_CONTRACTS = 2;

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
  acceptContract: (
    offerId: string,
    shipId: string,
    selectedSpeedKnots?: number,
    reviewedPlan?: ConfirmedPlanReview,
  ) => PlanAcceptanceResult | void;
  settleContract: () => void;
  resetGame: () => void;
}

function getNextRefreshTime(now: number): number {
  return (
    Math.ceil((now + 1) / CONTRACT_REFRESH_INTERVAL_MS) *
    CONTRACT_REFRESH_INTERVAL_MS
  );
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [
      result[swapIndex],
      result[index],
    ];
  }

  return result;
}

function pickPortOffers(
  portId: PortId,
  keepTemplateIds: ContractId[] = [],
  count = 3,
  requiredNormalCount = MIN_NORMAL_CONTRACTS,
): OfferedContract[] {
  if (count <= 0) return [];

  const generatedAt = Date.now();
  const pool = getContractPoolByPort(portId).filter(
    (template) =>
      template.id !== FIXED_CONTRACT_ID &&
      !keepTemplateIds.includes(template.id),
  );

  const normalPool = shuffle(
    pool.filter(
      (template) => getContractDifficulty(template) === "normal",
    ),
  );
  const otherPool = shuffle(
    pool.filter(
      (template) => getContractDifficulty(template) !== "normal",
    ),
  );

  const normalCount = Math.min(
    count,
    Math.max(0, requiredNormalCount),
    normalPool.length,
  );
  const selectedTemplates = normalPool.slice(0, normalCount);
  const remainingSlots = Math.max(
    0,
    count - selectedTemplates.length,
  );
  const remainingCandidates = shuffle([
    ...normalPool.slice(normalCount),
    ...otherPool,
  ]);

  selectedTemplates.push(
    ...remainingCandidates.slice(0, remainingSlots),
  );

  return selectedTemplates.map((template) =>
    createOfferedContract(
      template,
      getRouteById(template.routeId),
      generatedAt,
    ),
  );
}

function replenishAcceptedOffer(
  state: GameState,
  portId: PortId,
  acceptedOfferId: string,
): OfferedContract[] {
  const remainingOffers = (state.portOffers[portId] ?? []).filter(
    (offer) => offer.id !== acceptedOfferId,
  );
  const remainingNormalCount = remainingOffers.filter(
    (offer) =>
      getContractDifficulty(
        getContractTemplateById(offer.templateId),
      ) === "normal",
  ).length;

  const slots = Math.max(0, 3 - remainingOffers.length);
  const requiredNormalCount = Math.max(
    0,
    MIN_NORMAL_CONTRACTS - remainingNormalCount,
  );
  const keepTemplateIds = remainingOffers.map(
    (offer) => offer.templateId,
  );
  const replacement = pickPortOffers(
    portId,
    keepTemplateIds,
    slots,
    requiredNormalCount,
  );

  return [...remainingOffers, ...replacement];
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
    voyageMemos: [],
    reputations: ensureMiraReputation([
      { shipperId: "shipper_selene_farmers", value: 0 },
      { shipperId: "shipper_aldera_merchants", value: 0 },
      { shipperId: "shipper_rigel_forge", value: 0 },
    ]),
    tutorialCompleted: false,
    selectedPortId: "port_selene",
    portOffers: {
      port_selene: pickPortOffers("port_selene"),
      port_aldera: pickPortOffers("port_aldera"),
      port_rigel: pickPortOffers("port_rigel"),
      port_mira: pickPortOffers("port_mira"),
    },
    nextRefreshAt: getNextRefreshTime(now),
  };
}

function getShipStatusForVoyage(
  phase: VoyagePhase,
): ShipStatus {
  if (phase === "loading") return "loading";
  if (phase === "sailing") return "sailing";
  return "unloading";
}

function getShipCurrentHexId(
  contract: AcceptedContract,
  voyage: {
    phase: VoyagePhase;
    currentSeaHexIndex: number;
  },
): string | null {
  const route = getRouteById(contract.routeId);
  const startHexId = getPortHexId(route.fromPortId);
  const goalHexId = getPortHexId(route.toPortId);

  if (voyage.phase === "loading") return startHexId;
  if (
    voyage.phase === "unloading" ||
    voyage.phase === "completed"
  ) {
    return goalHexId;
  }

  const routeHexIds = getRouteHexIds(
    route.fromPortId,
    route.toPortId,
  );

  if (!routeHexIds || routeHexIds.length < 2) {
    return startHexId;
  }

  const seaHexIds = routeHexIds.filter(
    (hexId) => getHexById(hexId).kind === "sea",
  );

  if (seaHexIds.length === 0) return goalHexId;

  return seaHexIds[
    Math.min(
      seaHexIds.length - 1,
      Math.max(0, voyage.currentSeaHexIndex),
    )
  ];
}

function syncActiveShipPosition(state: GameState): GameState {
  const voyage = state.activeVoyage;
  const contract = state.acceptedContract;

  if (!voyage || !contract) return state;

  // 計画航海の位置は専用の進行処理が更新する。
  if (voyage.plannedNavigation !== undefined) return state;

  const currentHexId = getShipCurrentHexId(contract, voyage);
  if (!currentHexId) return state;

  let changed = false;
  const ships = state.ships.map((ship): Ship => {
    if (
      ship.activeContractId !== voyage.contractId ||
      ship.currentHexId === currentHexId
    ) {
      return ship;
    }

    changed = true;
    return { ...ship, currentHexId };
  });

  return changed ? { ...state, ships } : state;
}

function findLatestMemoIndex(
  memos: VoyageMemo[],
  matches: (memo: VoyageMemo) => boolean,
): number {
  for (let index = memos.length - 1; index >= 0; index -= 1) {
    if (matches(memos[index])) return index;
  }

  return -1;
}

function preserveActiveMemoCargo(state: GameState): GameState {
  const contract = state.acceptedContract;
  const voyage = state.activeVoyage;

  if (
    !contract ||
    !voyage ||
    voyage.contractId !== contract.id
  ) {
    return state;
  }

  const ship = state.ships.find(
    (item) => item.id === voyage.shipId,
  );

  if (!ship || ship.activeContractId !== contract.id) {
    return state;
  }

  const snapshot = readCargoLotSnapshot(contract);
  if (!snapshot) return state;

  const memoIndex = findLatestMemoIndex(
    state.voyageMemos,
    (memo) =>
      memo.contractId === contract.id &&
      memo.shipId === ship.id &&
      memo.acceptedAt === contract.acceptedAt &&
      memo.settlement === null &&
      !memo.fuelDepletionReturn,
  );

  if (
    memoIndex < 0 ||
    Object.prototype.hasOwnProperty.call(
      state.voyageMemos[memoIndex],
      "cargoLotSnapshot",
    )
  ) {
    return state;
  }

  return {
    ...state,
    voyageMemos: state.voyageMemos.map((memo, index) =>
      index === memoIndex
        ? {
            ...memo,
            cargoLabel:
              `${snapshot.cargoName} ` +
              `${snapshot.quantityLots}ロット`,
            cargoLotSnapshot: { ...snapshot },
          }
        : memo,
    ),
  };
}

/**
 * 各途中補油港について、残量0から目標残量まで
 * 購入できる金額を前払いする。
 */
function calculatePlannedFuelPrepayment(
  voyage: Voyage,
): number {
  const plan = voyage.plannedNavigation;
  if (!plan) return 0;

  const fuelCapacityTons = plan.settings.fuelCapacityTons;

  if (
    !Number.isFinite(fuelCapacityTons) ||
    fuelCapacityTons <= 0 ||
    !Number.isFinite(FUEL_PRICE_GOLD_PER_TON) ||
    FUEL_PRICE_GOLD_PER_TON <= 0
  ) {
    throw new Error("Invalid fuel prepayment settings");
  }

  let prepaymentGold = 0;

  // 最後の区間の到着港は最終目的地なので除外する。
  for (const section of plan.route.sections.slice(0, -1)) {
    const targetPercent = section.refuelTargetPercent;
    if (targetPercent === undefined) continue;

    if (
      !Number.isFinite(targetPercent) ||
      targetPercent < 0 ||
      targetPercent > 100
    ) {
      throw new Error("Invalid refuel target percentage");
    }

    const targetTons =
      fuelCapacityTons * (targetPercent / 100);

    prepaymentGold += Math.ceil(
      targetTons * FUEL_PRICE_GOLD_PER_TON,
    );

    if (!Number.isSafeInteger(prepaymentGold)) {
      throw new Error("Invalid fuel prepayment total");
    }
  }

  return prepaymentGold;
}

function progressVoyageIfActive(
  state: GameState,
  currentRealTime: number,
): GameState {
  // 計画航海の進行・実費確定・返金は専用処理へ渡す。
  if (state.activeVoyage?.plannedNavigation !== undefined) {
    return progressConfirmedPlanLifecycle(
      preserveActiveMemoCargo(state),
      currentRealTime,
    );
  }

  if (!state.activeVoyage || !state.acceptedContract) {
    return state;
  }

  state = preserveActiveMemoCargo(state);
  const contract = state.acceptedContract!;
  let voyage = state.activeVoyage!;

  if (voyage.fuelNavigation === undefined) {
    voyage = progressVoyage(
      voyage,
      contract,
      state.operationTime,
      currentRealTime,
    );

    const ships = state.ships.map((ship) =>
      ship.activeContractId === voyage.contractId
        ? {
            ...ship,
            status: getShipStatusForVoyage(voyage.phase),
          }
        : ship,
    );

    return { ...state, activeVoyage: voyage, ships };
  }

  let ship = state.ships.find(
    (item) => item.id === voyage.shipId,
  );

  if (
    !ship ||
    ship.activeContractId !== contract.id ||
    voyage.contractId !== contract.id
  ) {
    throw new Error("Invalid coal voyage references");
  }

  const memoShipId = ship.id;
  const memoIndex = findLatestMemoIndex(
    state.voyageMemos,
    (memo) =>
      memo.contractId === contract.id &&
      memo.shipId === memoShipId &&
      memo.settlement === null &&
      !memo.fuelDepletionReturn,
  );

  if (memoIndex < 0) {
    throw new Error("Missing active coal voyage memo");
  }

  if (
    voyage.phase === "loading" &&
    state.operationTime >= voyage.loadingCompletedAt &&
    currentRealTime >= voyage.departedRealTime
  ) {
    voyage = {
      ...voyage,
      phase: "sailing",
      departedAt: voyage.loadingCompletedAt,
    };
  }

  if (voyage.phase === "sailing") {
    const advanced = advanceCoalVoyage(
      voyage,
      ship,
      currentRealTime,
    );

    voyage = advanced.voyage;
    ship = advanced.ship;

    if (advanced.navigation?.status === "fuelDepleted") {
      const fuel = ship.fuel;
      const navigation = voyage.fuelNavigation!;

      if (!isValidShipFuel(fuel)) {
        throw new Error("Invalid depleted fuel balance");
      }

      const route = getRouteById(contract.routeId);
      const stoppedLeg =
        navigation.routeLegs[voyage.currentSeaHexIndex];

      if (!stoppedLeg) {
        throw new Error("Invalid depletion position");
      }

      const returnedShip: Ship = {
        ...ship,
        status: "docked",
        activeContractId: null,
        currentPortId: route.fromPortId,
        currentHexId: getPortHexId(route.fromPortId),
        fuel: {
          ...fuel,
          remainingTons: fuel.capacityTons,
        },
      };

      // 非計画航海にはこのストアから前払金を作成しない。
      // 既存データにpendingがある場合は未使用残額だけ戻す。
      const prepayment = voyage.fuelPrepayment;
      let refundGold = 0;

      if (prepayment?.status === "pending") {
        const {
          prepaidGold,
          consumedGold,
          refundedGold,
        } = prepayment;

        if (
          !Number.isSafeInteger(prepaidGold) ||
          !Number.isSafeInteger(consumedGold) ||
          !Number.isSafeInteger(refundedGold) ||
          prepaidGold < 0 ||
          consumedGold < 0 ||
          refundedGold < 0 ||
          consumedGold + refundedGold > prepaidGold
        ) {
          throw new Error("Invalid legacy fuel prepayment");
        }

        refundGold =
          prepaidGold - consumedGold - refundedGold;
      }

      const fuelDepletionReturn = {
        reason: "fuel_depleted" as const,
        occurredAtRealTime:
          advanced.navigation.state.processedRealTime,
        stoppedHexId: stoppedLeg.hexId,
        distanceIntoHexNm: voyage.distanceIntoHexNm,
        returnedToPortId: route.fromPortId,
        fuelConsumedTons: navigation.fuelConsumedTons,
        fuelRefilledTons:
          fuel.capacityTons - fuel.remainingTons,
      };

      return {
        ...state,
        money: state.money + refundGold,
        activeVoyage: null,
        acceptedContract: null,
        ships: state.ships.map((item) =>
          item.id === returnedShip.id ? returnedShip : item,
        ),
        voyageMemos: state.voyageMemos.map((memo, index) =>
          index === memoIndex
            ? {
                ...memo,
                fuelConsumedTons: navigation.fuelConsumedTons,
                fuelDepletionReturn,
              }
            : memo,
        ),
      };
    }

    if (advanced.navigation?.status === "arrived") {
      const arrivalRealTime =
        advanced.navigation.arrivalRealTime;

      if (
        arrivalRealTime === undefined ||
        arrivalRealTime === null ||
        !Number.isFinite(arrivalRealTime)
      ) {
        throw new Error("Missing coal voyage arrival time");
      }

      const arrivedAt =
        voyage.departedAt +
        (arrivalRealTime - voyage.departedRealTime) *
          GAME_TIME_MULTIPLIER;
      const arrivalLateHours = calculateArrivalLateHours(
        arrivedAt,
        voyage.arrivalDeadlineAt,
      );

      voyage = {
        ...voyage,
        phase: "unloading",
        arrivedAt,
        estimatedArrivalAt: arrivedAt,
        arrivalLateHours,
        isOnTime: arrivalLateHours <= 0,
        unloadingStartedAt: arrivedAt,
      };
    }
  }

  if (
    voyage.phase === "unloading" ||
    voyage.phase === "completed"
  ) {
    voyage = progressVoyage(
      voyage,
      contract,
      state.operationTime,
      currentRealTime,
    );
  }

  const updatedShip: Ship = {
    ...ship,
    status: getShipStatusForVoyage(voyage.phase),
  };

  return {
    ...state,
    activeVoyage: voyage,
    ships: state.ships.map((item) =>
      item.id === updatedShip.id ? updatedShip : item,
    ),
    voyageMemos: state.voyageMemos.map((memo, index) =>
      index === memoIndex
        ? {
            ...memo,
            fuelConsumedTons:
              voyage.fuelNavigation!.fuelConsumedTons,
          }
        : memo,
    ),
  };
}

function refreshContractsIfDue(
  state: GameState,
  currentRealTime: number,
): GameState {
  if (state.nextRefreshAt > currentRealTime) return state;

  const acceptedTemplateId =
    state.acceptedContract?.templateId ?? null;

  const portOffers = Object.fromEntries(
    ports.map((port) => {
      const currentOffers = state.portOffers[port.id] ?? [];
      const keepTemplateIds =
        acceptedTemplateId &&
        currentOffers.some(
          (offer) => offer.templateId === acceptedTemplateId,
        )
          ? [acceptedTemplateId]
          : [];

      return [
        port.id,
        pickPortOffers(port.id, keepTemplateIds, 3),
      ];
    }),
  );

  return {
    ...state,
    portOffers,
    nextRefreshAt: getNextRefreshTime(currentRealTime),
  };
}

const loadedGameState = loadGame();
const defaultGameState = createInitialGameState();

const initialGameState: GameState = loadedGameState
  ? {
      ...defaultGameState,
      ...loadedGameState,
      reputations: ensureMiraReputation(
        loadedGameState.reputations ??
          defaultGameState.reputations,
      ),
      selectedPortId:
        loadedGameState.selectedPortId ??
        defaultGameState.selectedPortId,
      portOffers:
        loadedGameState.portOffers ??
        defaultGameState.portOffers,
      nextRefreshAt:
        loadedGameState.nextRefreshAt ??
        defaultGameState.nextRefreshAt,
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
        ? advanceOperationTime(
            current.operationTime,
            current.lastRealTimeSyncedAt,
            currentRealTime,
          )
        : current.operationTime,
      lastRealTimeSyncedAt: currentRealTime,
    };

    if (
      next.activeVoyage &&
      (
        next.acceptedContract ||
        next.activeVoyage.plannedNavigation !== undefined
      )
    ) {
      next = progressVoyageIfActive(next, currentRealTime);
      next = syncActiveShipPosition(next);
    }

    next = refreshContractsIfDue(next, currentRealTime);
    saveGame(next);
    set({ gameState: next });
  },

  selectContract: (contractId) =>
    set({ selectedContractId: contractId }),

  selectShip: (shipId) =>
    set({ selectedShipId: shipId }),

  setActiveTab: (tab) =>
    set({ activeTab: tab }),

  selectPort: (portId) =>
    set({
      gameState: {
        ...get().gameState,
        selectedPortId: portId,
      },
    }),

  acceptContract: (
    offerId,
    shipId,
    selectedSpeedKnots,
    reviewedPlan,
  ) => {
    const current = get().gameState;
    const currentRealTime = Date.now();

    if (current.acceptedContract || current.activeVoyage) {
      return;
    }

    const isTutorial = offerId === FIXED_CONTRACT_ID;
    const offeredContract = isTutorial
      ? undefined
      : (
          current.portOffers[current.selectedPortId] ?? []
        ).find((offer) => offer.id === offerId);

    if (!isTutorial && !offeredContract) return;

    let template: ContractTemplate;

    try {
      template = isTutorial
        ? tutorialWheatContract
        : getContractTemplateById(
            offeredContract!.templateId,
          );
    } catch {
      return;
    }

    if (!isTutorial && template.id === FIXED_CONTRACT_ID) {
      return;
    }

    const ship = current.ships.find(
      (item) => item.id === shipId,
    );
    if (!ship) return;

    const speed =
      selectedSpeedKnots === undefined
        ? ship.cruisingSpeedKnots
        : selectedSpeedKnots;

    if (
      !Number.isSafeInteger(ship.cruisingSpeedKnots) ||
      ship.cruisingSpeedKnots <= 0 ||
      !Number.isSafeInteger(ship.maxSpeedKnots) ||
      !isSelectedSpeedWithinLimits(ship, speed) ||
      (
        ship.kind !== "powered" &&
        speed !== ship.cruisingSpeedKnots
      )
    ) {
      return;
    }

    const acceptance = evaluateContractAcceptance(
      template,
      ship,
      current,
      currentRealTime,
      offeredContract?.id,
    );

    if (!acceptance.canAccept) return;

    const route = getRouteById(template.routeId);
    const deadlineAt = isTutorial
      ? calculateContractSchedule(
          template,
          route,
          currentRealTime,
        ).deadlineAt
      : offeredContract!.deadlineAt;

    if (reviewedPlan !== undefined) {
      if (
        !reviewedPlan ||
        SAVE_VERSION !== 9 ||
        ship.kind !== "powered" ||
        reviewedPlan.offerId !== offerId ||
        reviewedPlan.templateId !== template.id ||
        reviewedPlan.shipId !== shipId ||
        reviewedPlan.selectedSpeedKnots !== speed ||
        !Number.isSafeInteger(reviewedPlan.baseRealTime) ||
        reviewedPlan.baseRealTime > currentRealTime
      ) {
        return;
      }

      try {
        const fresh = createConfirmedPlanReview(
          offerId,
          template,
          ship,
          reviewedPlan.route,
          speed,
          currentRealTime,
          deadlineAt,
        );

        if (
          fresh.signature !== reviewedPlan.signature ||
          (
            !isTutorial &&
            reviewedPlan.deadlineAt !== deadlineAt
          )
        ) {
          return {
            kind: "reviewRequired",
            review: fresh,
          };
        }
      } catch {
        return;
      }
    }

    const cargo = getCargoById(template.cargoId);
    const acceptedContract = createAcceptedContract(
      template,
      route,
      cargo,
      currentRealTime,
      deadlineAt,
      offeredContract?.offeredReward,
    );

    const cargoSnapshot =
      readCargoLotSnapshot(acceptedContract);
    if (!cargoSnapshot) return;

    const departureRefuel =
      reviewedPlan !== undefined
        ? applyDepartureFreeRefuel(
            ship,
            reviewedPlan.route,
          )
        : { ship, refuel: null };

    const plannedShip = departureRefuel.ship;
    const voyageShip: Ship = {
      ...plannedShip,
      cruisingSpeedKnots: speed,
    };

    let voyage: Voyage;

    if (reviewedPlan !== undefined) {
      try {
        voyage = createConfirmedPlanVoyage({
          contract: acceptedContract,
          ship: plannedShip,
          route: reviewedPlan.route,
          selectedSpeedKnots: speed,
          operationTime: current.operationTime,
        });
      } catch {
        return;
      }
    } else {
      voyage = createVoyage(
        acceptedContract,
        voyageShip,
        current.operationTime,
        currentRealTime,
      );

      if (ship.kind === "powered") {
        voyage.fuelNavigation = createCoalVoyageNavigation(
          ship,
          route,
          getHeavyLoadSpeedFactor(acceptedContract, ship),
          speed,
        );
      }
    }

    let fuelPrepaidGold: number;

    try {
      fuelPrepaidGold =
        ship.kind === "powered"
          ? calculatePlannedFuelPrepayment(voyage)
          : 0;
    } catch {
      return;
    }

    if (
      !Number.isFinite(current.money) ||
      current.money < 0 ||
      fuelPrepaidGold > current.money
    ) {
      return;
    }

    if (fuelPrepaidGold > 0) {
      voyage = {
        ...voyage,
        fuelPrepayment: {
          status: "pending",
          prepaidGold: fuelPrepaidGold,
          consumedGold: 0,
          refundedGold: 0,
        },
      };
    }

    const updatedShip: Ship = {
      ...plannedShip,
      status: "loading",
      currentHexId: getPortHexId(route.fromPortId),
      activeContractId: acceptedContract.id,
    };

    const portOffers = { ...current.portOffers };

    if (offeredContract) {
      portOffers[current.selectedPortId] =
        replenishAcceptedOffer(
          current,
          current.selectedPortId,
          offeredContract.id,
        );
    }

    const voyageNumber = current.voyageMemos.length + 1;
    const voyageMemo: VoyageMemo = {
      voyageNumber,
      label: `V.${String(voyageNumber).padStart(2, "0")}`,
      contractId: acceptedContract.id,
      shipId: ship.id,
      shipName: ship.name,
      routeLabel:
        `${getPortById(route.fromPortId).name} → ` +
        `${getPortById(route.toPortId).name}`,
      cargoLabel:
        `${cargoSnapshot.cargoName} ` +
        `${cargoSnapshot.quantityLots}ロット`,
      cargoLotSnapshot: { ...cargoSnapshot },
      acceptedAt: currentRealTime,
      acceptedOperationTime: current.operationTime,
      plannedEtaRealTime: voyage.forecastEtaRealTime,
      actualArrivalRealTime: null,
      etaDiffMinutes: null,
      settlement: null,
    };

    const next: GameState = {
      ...current,
      currentGameTime: currentRealTime,
      lastRealTimeSyncedAt: currentRealTime,
      money: current.money - fuelPrepaidGold,
      ships: current.ships.map((item) =>
        item.id === shipId ? updatedShip : item,
      ),
      activeVoyage: voyage,
      acceptedContract,
      portOffers,
      acceptedContractIds: [
        ...current.acceptedContractIds,
        acceptedContract.id,
      ],
      voyageMemos: [
        ...current.voyageMemos,
        voyageMemo,
      ],
      tutorialCompleted: isTutorial
        ? true
        : current.tutorialCompleted,
    };

    saveGame(next);
    set({
      gameState: next,
      selectedContractId: null,
    });

    return { kind: "accepted" };
  },

  settleContract: () => {
    let current = get().gameState;
    const voyage = current.activeVoyage;
    const contract = current.acceptedContract;

    if (
      !voyage ||
      !contract ||
      voyage.settled ||
      voyage.phase !== "completed"
    ) {
      return;
    }

    // 計画航海の前払金は進行処理側で精算済みであること。
    if (
      voyage.plannedNavigation !== undefined &&
      voyage.fuelPrepayment?.status === "pending"
    ) {
      return;
    }

    current = preserveActiveMemoCargo(current);

    const result = settleContract(contract, voyage);
    const route = getRouteById(contract.routeId);

    const updatedShips = current.ships.map((ship) =>
      ship.activeContractId === contract.id
        ? {
            ...ship,
            status: "docked" as const,
            currentPortId: route.toPortId,
            currentHexId: getPortHexId(route.toPortId),
            activeContractId: null,
          }
        : ship,
    );

    const updatedReputations = ensureMiraReputation(
      current.reputations,
    ).map((reputation) =>
      reputation.shipperId === contract.shipperId
        ? {
            ...reputation,
            value: Math.max(
              -3,
              Math.min(
                3,
                reputation.value + result.reputationChange,
              ),
            ),
          }
        : reputation,
    );

    const memoIndex = findLatestMemoIndex(
      current.voyageMemos,
      (memo) =>
        memo.contractId === contract.id &&
        memo.shipId === voyage.shipId &&
        memo.acceptedAt === contract.acceptedAt &&
        memo.settlement === null &&
        !memo.fuelDepletionReturn,
    );

    const fuelCost =
      voyage.fuelPrepayment?.consumedGold ?? 0;

    const voyageMemos = current.voyageMemos.map(
      (memo, index) => {
        if (
          index !== memoIndex ||
          voyage.arrivedAt === null
        ) {
          return memo;
        }

        const actualArrivalRealTime =
          contract.acceptedAt +
          (
            voyage.arrivedAt -
            memo.acceptedOperationTime
          ) / GAME_TIME_MULTIPLIER;

        return {
          ...memo,
          actualArrivalRealTime,
          etaDiffMinutes: Math.round(
            (
              actualArrivalRealTime -
              memo.plannedEtaRealTime
            ) / 60000,
          ),
          settlement: {
            offeredReward: result.offeredReward,
            latePenalty: result.latePenalty,
            receivedReward: result.receivedReward,
            expense: result.expense,
            fuelCost,
            guaranteeAmount: result.guaranteeAmount,
            finalPayout: result.finalPayout,
          },
        };
      },
    );

    const next: GameState = {
      ...current,
      money: current.money + result.finalPayout,
      ships: updatedShips,
      activeVoyage: null,
      acceptedContract: null,
      reputations: updatedReputations,
      voyageMemos,
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
      activeTab: "contracts",
    });
  },
}));

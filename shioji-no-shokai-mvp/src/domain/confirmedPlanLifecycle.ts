import type { FuelPrepayment, GameState, Ship, Voyage } from "./types";
import type { WindNavigationInput } from "./windNavigation";
import { advanceConfirmedPlanNavigation } from "./confirmedPlanNavigation";
import { calculateArrivalLateHours, progressVoyage } from "./voyage";
import { GAME_TIME_MULTIPLIER, FUEL_PRICE_GOLD_PER_TON } from "../data/gameConstants";
import { getPortHexId } from "../data/hexMap";
import { getRouteById } from "../data/routes";
import { isValidShipFuel } from "./coalFuel";

interface FuelPaymentResult {
  prepayment: FuelPrepayment | undefined;
  refundGold: number;
}

/** 受注時に支払済みなので、実費を所持金から再度引かない。 */
function finalizeFuelPrepayment(
  voyage: Voyage,
  status: "settled" | "refunded",
): FuelPaymentResult {
  const prepayment = voyage.fuelPrepayment;

  if (!prepayment || prepayment.status !== "pending") {
    return { prepayment, refundGold: 0 };
  }

  if (
    !Number.isSafeInteger(prepayment.prepaidGold) ||
    prepayment.prepaidGold < 0 ||
    prepayment.consumedGold !== 0 ||
    prepayment.refundedGold !== 0
  ) {
    throw new Error("Invalid pending fuel prepayment");
  }

  const plan = voyage.plannedNavigation;
  if (!plan) {
    throw new Error("Missing planned navigation for fuel payment");
  }

  if (
    !Number.isFinite(FUEL_PRICE_GOLD_PER_TON) ||
    FUEL_PRICE_GOLD_PER_TON <= 0
  ) {
    throw new Error("Invalid fuel price");
  }

  const purchasedFuelTons = plan.checkpoint.portCalls.reduce(
    (total, call) => {
      if (!Number.isFinite(call.addedFuelTons) || call.addedFuelTons < 0) {
        throw new Error("Invalid purchased fuel amount");
      }
      return total + call.addedFuelTons;
    },
    0,
  );

  const consumedGold = Math.ceil(
    purchasedFuelTons * FUEL_PRICE_GOLD_PER_TON,
  );

  if (
    !Number.isSafeInteger(consumedGold) ||
    consumedGold < 0 ||
    consumedGold > prepayment.prepaidGold
  ) {
    throw new Error("Actual fuel cost exceeds fuel prepayment");
  }

  const refundGold = prepayment.prepaidGold - consumedGold;

  return {
    prepayment: {
      ...prepayment,
      status,
      consumedGold,
      refundedGold: refundGold,
    },
    refundGold,
  };
}

/** 次の状態を作る。呼び出し元で保存成功後に画面へ反映する。 */
export function progressConfirmedPlanLifecycle(
  state: GameState,
  currentRealTime: number,
  readActualWind?: WindNavigationInput["readWind"],
): GameState {
  let voyage = state.activeVoyage;
  if (!voyage || voyage.plannedNavigation === undefined) return state;

  const contract = state.acceptedContract;
  if (!contract || voyage.contractId !== contract.id) {
    throw new Error("Missing planned contract");
  }

  if (!Number.isFinite(state.operationTime) || state.operationTime < 0) {
    throw new RangeError("Invalid operation clock");
  }

  let ship = state.ships.find((item) => item.id === voyage!.shipId);
  if (!ship) throw new Error("Missing planned ship");

  advanceConfirmedPlanNavigation(
    { ...voyage, phase: "loading" },
    ship,
    currentRealTime,
    readActualWind,
  );

  const plan = voyage.plannedNavigation;
  const endpoints = getRouteById(contract.routeId);
  if (
    plan.route.departurePortId !== endpoints.fromPortId ||
    plan.route.destinationPortId !== endpoints.toPortId
  ) {
    throw new Error("Contract endpoints mismatch");
  }

  let memoIndex = -1;
  for (let index = state.voyageMemos.length - 1; index >= 0; index -= 1) {
    const memo = state.voyageMemos[index];
    if (
      memo.contractId === contract.id &&
      memo.shipId === ship.id &&
      memo.acceptedAt === contract.acceptedAt &&
      memo.settlement === null &&
      !memo.fuelDepletionReturn
    ) {
      memoIndex = index;
      break;
    }
  }
  if (memoIndex < 0) throw new Error("Missing active planned memo");

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
    const advanced = advanceConfirmedPlanNavigation(
      voyage,
      ship,
      currentRealTime,
      readActualWind,
    );
    voyage = advanced.voyage;
    ship = advanced.ship;
    const navigation = advanced.navigation;
    if (!navigation) throw new Error("Missing planned navigation result");

    if (navigation.status === "fuelDepleted") {
      const fuel = ship.fuel;
      if (!isValidShipFuel(fuel)) {
        throw new Error("Invalid depleted balance");
      }

      const checkpoint = navigation.checkpoint;
      const lastCall = checkpoint.portCalls[checkpoint.portCalls.length - 1];
      const stoppedAtPort =
        lastCall !== undefined &&
        lastCall.arrivedAtRealTime === checkpoint.processedRealTime &&
        lastCall.departureFuelTons === 0;
      const stoppedHexId = stoppedAtPort
        ? getPortHexId(lastCall.portId)
        : ship.currentHexId;

      const returnedShip: Ship = {
        ...ship,
        status: "docked",
        activeContractId: null,
        currentPortId: plan.route.departurePortId,
        currentHexId: getPortHexId(plan.route.departurePortId),
        fuel: { ...fuel, remainingTons: fuel.capacityTons },
      };
      const payment = finalizeFuelPrepayment(voyage, "refunded");
      const fuelDepletionReturn = {
        reason: "fuel_depleted" as const,
        occurredAtRealTime: checkpoint.processedRealTime,
        stoppedHexId,
        distanceIntoHexNm: checkpoint.distanceIntoLegNm,
        returnedToPortId: plan.route.departurePortId,
        fuelConsumedTons: checkpoint.totalFuelUsedTons,
        fuelRefilledTons: fuel.capacityTons - fuel.remainingTons,
      };

      return {
        ...state,
        money: state.money + payment.refundGold,
        activeVoyage: null,
        acceptedContract: null,
        ships: state.ships.map((item) =>
          item.id === returnedShip.id ? returnedShip : item,
        ),
        voyageMemos: state.voyageMemos.map((memo, index) =>
          index === memoIndex
            ? {
                ...memo,
                fuelConsumedTons: checkpoint.totalFuelUsedTons,
                fuelDepletionReturn,
              }
            : memo,
        ),
      };
    }

    if (navigation.status === "arrived") {
      const arrivalRealTime = navigation.arrivalRealTime;
      if (
        arrivalRealTime === undefined ||
        arrivalRealTime === null ||
        !Number.isFinite(arrivalRealTime)
      ) {
        throw new Error("Missing planned arrival time");
      }

      const arrivedAt =
        voyage.departedAt +
        (arrivalRealTime - voyage.departedRealTime) * GAME_TIME_MULTIPLIER;
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

  if (voyage.phase === "unloading" || voyage.phase === "completed") {
    voyage = progressVoyage(
      voyage,
      contract,
      state.operationTime,
      currentRealTime,
    );
  }

  const arrived =
    voyage.phase === "unloading" || voyage.phase === "completed";
  let refundGold = 0;

  if (arrived) {
    const payment = finalizeFuelPrepayment(voyage, "settled");
    refundGold = payment.refundGold;
    if (payment.prepayment !== voyage.fuelPrepayment) {
      voyage = { ...voyage, fuelPrepayment: payment.prepayment };
    }
  }

  const updatedShip: Ship = {
    ...ship,
    status:
      voyage.phase === "loading"
        ? "loading"
        : voyage.phase === "sailing"
          ? "sailing"
          : "unloading",
    ...(arrived
      ? {
          currentPortId: plan.route.destinationPortId,
          currentHexId: getPortHexId(plan.route.destinationPortId),
        }
      : voyage.phase === "loading"
        ? { currentHexId: getPortHexId(plan.route.departurePortId) }
        : {}),
  };
  const fuelConsumedTons =
    voyage.plannedNavigation!.checkpoint.totalFuelUsedTons;

  return {
    ...state,
    money: state.money + refundGold,
    activeVoyage: voyage,
    ships: state.ships.map((item) =>
      item.id === updatedShip.id ? updatedShip : item,
    ),
    voyageMemos: state.voyageMemos.map((memo, index) =>
      index === memoIndex ? { ...memo, fuelConsumedTons } : memo,
    ),
  };
}

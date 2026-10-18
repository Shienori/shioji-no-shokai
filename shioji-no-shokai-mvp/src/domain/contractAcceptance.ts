import type { ContractTemplate, GameState, Ship } from "./types";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";

export interface AcceptanceCheck {
  canAccept: boolean;
  reason: string | null;
}

export function evaluateContractAcceptance(
  contract: ContractTemplate,
  ship: Ship,
  gameState: GameState,
): AcceptanceCheck {
  if (gameState.acceptedContract) {
    return { canAccept: false, reason: "すでに依頼を受注しています" };
  }

  const route = getRouteById(contract.routeId);
  if (ship.currentPortId !== route.fromPortId) {
    return { canAccept: false, reason: "船が仕出港にいません" };
  }

  if (ship.status !== "docked") {
    return { canAccept: false, reason: "船がフリーではありません" };
  }

  const cargo = getCargoById(contract.cargoId);
  const requiredCargoVolume = cargo.unitVolume * contract.quantity;
  const requiredCargoWeight = cargo.weightPerUnit * contract.quantity;

  if (
    ship.maxCargoVolume < requiredCargoVolume ||
    ship.maxCargoWeight < requiredCargoWeight
  ) {
    return { canAccept: false, reason: "スペースまたは積載量が不足しています" };
  }

  const hasOffer = (gameState.portOffers[route.fromPortId] ?? [])
    .some((offer) => offer.templateId === contract.id);

  if (!hasOffer) {
    return { canAccept: false, reason: "この依頼は現在提示されていません" };
  }

  return { canAccept: true, reason: null };
}

import type { ContractTemplate, GameState, Ship } from "./types";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";
import { tutorialWheatContract } from "../data/contracts";

export interface AcceptanceCheck {
  canAccept: boolean;
  reason: string | null;
}

export function evaluateContractAcceptance(
  contract: ContractTemplate,
  ship: Ship,
  gameState: GameState,
  now: number = Date.now(),
): AcceptanceCheck {
  if (gameState.acceptedContract) {
    return { canAccept: false, reason: "すでに依頼を受注しています" };
  }
  const route = getRouteById(contract.routeId);
  if (gameState.selectedPortId !== route.fromPortId || ship.currentPortId !== route.fromPortId) {
    return { canAccept: false, reason: "船または選択中の港が仕出港と一致しません" };
  }
  if (ship.status !== "docked") {
    return { canAccept: false, reason: "船がフリーではありません" };
  }
  const cargo = getCargoById(contract.cargoId);
  const requiredCargoVolume = cargo.unitVolume * contract.quantity;
  const requiredCargoWeight = cargo.weightPerUnit * contract.quantity;
  if (ship.maxCargoVolume < requiredCargoVolume || ship.maxCargoWeight < requiredCargoWeight) {
    return { canAccept: false, reason: "スペースまたは積載量が不足しています" };
  }
  if (contract.id === tutorialWheatContract.id) {
    if (gameState.tutorialCompleted || gameState.acceptedContractIds.includes(contract.id)) {
      return { canAccept: false, reason: "チュートリアル依頼は受注済みです" };
    }
    return { canAccept: true, reason: null };
  }
  const offer = (gameState.portOffers[route.fromPortId] ?? []).find((item) => item.templateId === contract.id);
  if (!offer) {
    return { canAccept: false, reason: "この依頼は現在提示されていません" };
  }
  if (offer.deadlineAt <= now) {
    return { canAccept: false, reason: "この依頼は到着期限を過ぎています" };
  }
  return { canAccept: true, reason: null };
}

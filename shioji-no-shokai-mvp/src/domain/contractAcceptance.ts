import type { ContractTemplate, GameState, Ship } from "./types";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";
import { tutorialWheatContract } from "../data/contracts";

export interface AcceptanceCheck { canAccept: boolean; reason: string | null; }

export function evaluateContractAcceptance(
  contract: ContractTemplate,
  ship: Ship,
  gameState: GameState,
  now: number = Date.now(),
  offerId?: string,
): AcceptanceCheck {
  if (gameState.acceptedContract || gameState.activeVoyage) {
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
  if (ship.maxCargoVolume < cargo.unitVolume * contract.quantity || ship.maxCargoWeight < cargo.weightPerUnit * contract.quantity) {
    return { canAccept: false, reason: "スペースまたは積載量が不足しています" };
  }
  if (contract.id === tutorialWheatContract.id) {
    if (gameState.tutorialCompleted || gameState.acceptedContractIds.includes(contract.id)) {
      return { canAccept: false, reason: "チュートリアル依頼は受注済みです" };
    }
    return { canAccept: true, reason: null };
  }
  const offer = (gameState.portOffers[route.fromPortId] ?? []).find(
    (item) => item.id === offerId && item.templateId === contract.id
  );
  if (!offer) return { canAccept: false, reason: "この依頼は現在提示されていません" };
  if (!Number.isFinite(offer.deadlineAt) || offer.deadlineAt <= now) {
    return { canAccept: false, reason: "この依頼は到着期限を過ぎています" };
  }
  return { canAccept: true, reason: null };
}

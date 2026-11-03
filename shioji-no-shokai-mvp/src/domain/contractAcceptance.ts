import type { ContractTemplate, GameState, Ship } from "./types";
import { getRouteById } from "../data/routes";
import { tutorialWheatContract } from "../data/contracts";
import { isValidShipFuel } from "./coalFuel";
import { getCargoLotById } from "../data/cargoLots";
import { createCargoLotSnapshot } from "./cargoLotUnits";
import { cargoFitsLotShip } from "./lotContract";

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
  if (ship.kind === "powered") {
    if (!isValidShipFuel(ship.fuel)) return { canAccept: false, reason: "燃料データが未設定または不正です" };
    if (ship.fuel.remainingTons === 0) return { canAccept: false, reason: "石炭がありません。補給が必要です" };
  }
  try {
    const snapshot = createCargoLotSnapshot(getCargoLotById(contract.cargoId), contract.quantity);
    if (!cargoFitsLotShip(snapshot, ship)) return { canAccept: false, reason: "必要な貨物重量（t）または貨物容積（m³）が上限を超えています" };
  } catch {
    return { canAccept: false, reason: "新ロット方式の貨物データ・数量または船の積載上限を確認できません" };
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

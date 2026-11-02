import type { GameState, ShipId } from "../domain/types";
import { isValidShipFuel } from "../domain/coalFuel";
import { getHexById } from "../data/hexMap";
import { getPortById } from "../data/ports";
import { saveGame } from "../domain/save";
import { useGameStore } from "./gameStore";

export interface PortRefuelCheck {
  canRefuel: boolean;
  reason: string | null;
  amountTons: number;
}

export function checkPortRefuel(state: GameState, shipId: ShipId): PortRefuelCheck {
  const reject = (reason: string): PortRefuelCheck => ({ canRefuel: false, reason, amountTons: 0 });
  const ship = state.ships.find((item) => item.id === shipId);
  if (!ship) return reject("船が見つかりません");
  if (ship.kind !== "powered") return reject("石炭を使用する動力船のみ補給できます");
  if (!isValidShipFuel(ship.fuel)) return reject("燃料データが未設定または不正です");
  if (ship.status !== "docked" || ship.activeContractId !== null || state.activeVoyage?.shipId === shipId ||
      (state.acceptedContract !== null && state.activeVoyage === null)) {
    return reject("依頼の精算後、港で停泊中に補給できます");
  }
  try {
    const hex = getHexById(ship.currentHexId);
    getPortById(ship.currentPortId);
    if (hex.kind !== "port" || hex.portId !== ship.currentPortId) return reject("船の現在位置が所在港と一致しません");
  } catch { return reject("船の所在港を確認できません"); }
  const amountTons = ship.fuel.capacityTons - ship.fuel.remainingTons;
  if (amountTons <= 0) return reject("石炭は満載です");
  return { canRefuel: true, reason: null, amountTons };
}

/** Recheck live state on every click; save successfully before publishing it. */
export function refuelShipAtPort(shipId: ShipId): { ok: boolean; message: string } {
  const current = useGameStore.getState().gameState;
  const check = checkPortRefuel(current, shipId);
  if (!check.canRefuel) return { ok: false, message: check.reason ?? "補給できません" };
  const next: GameState = {
    ...current,
    ships: current.ships.map((ship) => ship.id === shipId && isValidShipFuel(ship.fuel) ? {
      ...ship, fuel: { ...ship.fuel, remainingTons: ship.fuel.capacityTons },
    } : ship),
  };
  try { saveGame(next); }
  catch { return { ok: false, message: "保存できなかったため補給していません。保存領域を確認してください" }; }
  useGameStore.setState({ gameState: next });
  return { ok: true, message: "石炭を満載に補給しました（無料・待ち時間なし）" };
}

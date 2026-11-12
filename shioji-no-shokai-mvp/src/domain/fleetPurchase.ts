import type { GameState, Ship } from "./types";
import { initialShip } from "../data/ships";

export const SECOND_SHIP_PRICE = 30000;

export function purchaseSecondShip(
  state: GameState,
): GameState {
  if (state.money < SECOND_SHIP_PRICE) {
    return state;
  }

  const newShip: Ship = {
    ...initialShip,
    id: "ship_002",
    name: "新造船",
  };

  return {
    ...state,
    money: state.money - SECOND_SHIP_PRICE,
    ships: [...state.ships, newShip],
  };
}

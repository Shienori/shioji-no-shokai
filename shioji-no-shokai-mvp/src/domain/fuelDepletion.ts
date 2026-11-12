import type {
  AcceptedContract,
  GameState,
  PortId,
  Ship,
  Voyage,
} from "./types";
import { getPortHexId } from "../data/hexMap";
import { ports } from "../data/ports";

export function getNearestPortId(
  currentHexId: string,
): PortId {
  // 現状は簡易実装。後でHEX距離による近傍港選択へ置き換える。
  return ports[0].id;
}

export function handleFuelDepletion(
  state: GameState,
  contract: AcceptedContract,
  voyage: Voyage,
  ship: Ship,
  stoppedHexId: string,
): GameState {
  const nearestPortId = getNearestPortId(stoppedHexId);

  const returnedShip: Ship = {
    ...ship,
    status: "docked",
    activeContractId: null,
    currentPortId: nearestPortId,
    currentHexId: getPortHexId(nearestPortId),
    fuel: {
      ...ship.fuel!,
      remainingTons: 0,
    },
  };

  const updatedReputations = state.reputations.map(
    (reputation) =>
      reputation.shipperId === contract.shipperId
        ? {
            ...reputation,
            value: Math.max(
              -3,
              Math.min(3, reputation.value - 2),
            ),
          }
        : reputation,
  );

  return {
    ...state,
    activeVoyage: null,
    acceptedContract: null,
    ships: state.ships.map((item) =>
      item.id === returnedShip.id ? returnedShip : item,
    ),
    reputations: updatedReputations,
  };
}

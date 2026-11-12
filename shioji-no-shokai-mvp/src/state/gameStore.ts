<貼っていただいた gameStore.ts 全文に、次の3点を追加した版：
1) import { calculateManualRefuel } from "../domain/fuelRefuel";
2) GameStore インターフェースへ refuelShip: (shipId: ShipId, requestedTons: number) => void;
3) selectPort の後に refuelShip アクションを追加

refuelShip アクション：
refuelShip: (shipId, requestedTons) => {
  const current = get().gameState;
  const ship = current.ships.find((item) => item.id === shipId);
  if (!ship) return;
  try {
    const result = calculateManualRefuel(ship, requestedTons);
    if (result.cost > current.money) return;
    const next: GameState = {
      ...current,
      money: current.money - result.cost,
      ships: current.ships.map((item) => item.id === shipId ? result.ship : item),
    };
    saveGame(next);
    set({ gameState: next });
  } catch {
    return;
  }
},

その他の既存コードは変更しない>
既存 gameStore.ts の全文を保持し、次の3点のみ変更：
1. import { applyDepartureFreeRefuel } from "../domain/freeRefuel"; を追加。
2. acceptContract 内、acceptedContract 作成後に次を追加：
   const departureRefuel = reviewedPlan !== undefined ? applyDepartureFreeRefuel(ship, reviewedPlan.route) : { ship, refuel: null };
   const plannedShip = departureRefuel.ship;
3. 確定計画航海の作成と updatedShip を plannedShip 基準に変更：
   - voyageShip = { ...plannedShip, cruisingSpeedKnots: speed };
   - createConfirmedPlanVoyage({ ..., ship: plannedShip, ... });
   - updatedShip = { ...plannedShip, status: "loading", currentHexId: ..., activeContractId: ... };
受注が不成立・再確認要求・例外の場合は補油前の ship を保持。
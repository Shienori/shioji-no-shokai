<ユーザーが貼った gameStore.ts 全文をベースに、次の3点を適用した版：
1) import { calculateManualRefuel } from "../domain/fuelRefuel"; を追加
2) GameStore インターフェースへ refuelShip: (shipId: ShipId, requestedTons: number) => void; を追加
3) selectPort の後に refuelShip アクションを追加
また、createAcceptedContract 呼び出しは offeredContract?.offeredReward, を第6引数として保持
その他の既存コードは変更しない>
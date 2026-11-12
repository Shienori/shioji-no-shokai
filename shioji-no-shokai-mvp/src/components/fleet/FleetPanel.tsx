<既存の FleetPanel.tsx 全文に、次を追加した版：
1) import { useState } from "react";
2) import { useGameStore } from "../../state/gameStore";
3) ManualRefuelPanel コンポーネント（補油量入力・燃料代表示・補油ボタン）
4) FleetPanel 内で const refuelShip = useGameStore((state) => state.refuelShip);
5) 石炭船（ship.kind === "powered"）のカードに ManualRefuelPanel を表示

その他の既存コードは変更しない>
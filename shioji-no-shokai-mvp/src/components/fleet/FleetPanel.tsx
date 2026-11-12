<既存の FleetPanel.tsx 全文をベースに、次を適用した版：
1) import { useState } from "react"; を追加
2) import { useGameStore } from "../../state/gameStore"; を追加
3) ManualRefuelPanel コンポーネントを追加（補油量入力・燃料代表示・補油ボタン）
4) FleetPanel 内で const refuelShip = useGameStore((state) => state.refuelShip); を追加
5) 石炭船（ship.kind === "powered"）のカードに ManualRefuelPanel を表示
その他の既存コードは変更しない>
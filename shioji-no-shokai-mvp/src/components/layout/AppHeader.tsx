import { useGameStore } from "../../state/gameStore";
import { formatGameTime } from "../../domain/time";

export function AppHeader() {
  const money = useGameStore((state) => state.gameState.money);
  const currentGameTime = useGameStore((state) => state.gameState.currentGameTime);

  return (
    <header className="app-header">
      <div>
        <h1>潮路の商会</h1>
        <p className="time">{formatGameTime(currentGameTime)}</p>
      </div>
      <div className="money">{money}G</div>
    </header>
  );
}

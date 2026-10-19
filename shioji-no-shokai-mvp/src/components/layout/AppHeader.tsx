import { useGameStore } from "../../state/gameStore";
import { formatGameTime } from "../../domain/time";

const APP_VERSION = "v0.2.3";
const BUILD_NAME = import.meta.env.VITE_BUILD_NAME ?? "local";

export function AppHeader() {
  const money = useGameStore((state) => state.gameState.money);
  const currentGameTime = useGameStore((state) => state.gameState.currentGameTime);

  return (
    <header className="app-header">
      <div>
        <h1>潮路の商会</h1>
        <p className="time">{formatGameTime(currentGameTime)}</p>
        <p className="app-version">{APP_VERSION} / {BUILD_NAME}</p>
      </div>
      <div className="money">{money}G</div>
    </header>
  );
}

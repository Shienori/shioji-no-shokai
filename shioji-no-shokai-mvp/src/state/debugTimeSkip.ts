import { useGameStore } from "./gameStore";

const SKIP_REAL_MS = 30 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export function debugSkipThirtyMinutes(): void {
  // This legacy helper rewrites departure/ETA clocks, not planned checkpoints.
  // Reject before any tick or state publication, including malformed present plans.
  if (useGameStore.getState().gameState.activeVoyage?.plannedNavigation !== undefined) {
    throw new Error("確定計画の航海中は旧方式の30分スキップを使用できません。計画ETAと保存状態を保護するため停止しました。");
  }
  useGameStore.getState().tick();
  const current = useGameStore.getState().gameState;
  const now = Date.now();
  const refreshDue = current.nextRefreshAt <= now + SKIP_REAL_MS;
  const nextRefreshAt = refreshDue
    ? Math.ceil((now + SKIP_REAL_MS + 1) / REFRESH_INTERVAL_MS) * REFRESH_INTERVAL_MS - SKIP_REAL_MS
    : current.nextRefreshAt - SKIP_REAL_MS;

  useGameStore.setState({
    selectedContractId: null,
    gameState: {
      ...current,
      lastRealTimeSyncedAt: current.lastRealTimeSyncedAt - SKIP_REAL_MS,
      nextRefreshAt: current.nextRefreshAt - SKIP_REAL_MS,
      acceptedContract: current.acceptedContract,
      activeVoyage: current.activeVoyage ? {
        ...current.activeVoyage,
        departedRealTime: current.activeVoyage.departedRealTime - SKIP_REAL_MS,
        lastProcessedRealTime: current.activeVoyage.lastProcessedRealTime - SKIP_REAL_MS,
        forecastEtaRealTime: current.activeVoyage.forecastEtaRealTime - SKIP_REAL_MS,
        completedAtWorldTime: current.activeVoyage.completedAtWorldTime === null
          ? null
          : current.activeVoyage.completedAtWorldTime - SKIP_REAL_MS
      } : null
    }
  });
  useGameStore.getState().tick();

  if (refreshDue) {
    useGameStore.setState((state) => ({
      gameState: { ...state.gameState, nextRefreshAt }
    }));
    useGameStore.getState().tick();
  }
}

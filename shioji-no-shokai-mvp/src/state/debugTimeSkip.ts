import { useGameStore } from "./gameStore";

const SKIP_REAL_MS = 30 * 60 * 1000;
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function debugSkipThirtyMinutes(): void {
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
      acceptedContract: current.acceptedContract ? {
        ...current.acceptedContract,
        acceptedAt: current.acceptedContract.acceptedAt - SKIP_REAL_MS,
        deadlineAt: current.acceptedContract.deadlineAt - SKIP_REAL_MS
      } : null,
      activeVoyage: current.activeVoyage ? {
        ...current.activeVoyage,
        departedRealTime: current.activeVoyage.departedRealTime - SKIP_REAL_MS,
        lastProcessedRealTime: current.activeVoyage.lastProcessedRealTime - SKIP_REAL_MS,
        forecastEtaRealTime: current.activeVoyage.forecastEtaRealTime - SKIP_REAL_MS,
        arrivalDeadlineAt: current.activeVoyage.arrivalDeadlineAt - SKIP_REAL_MS,
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

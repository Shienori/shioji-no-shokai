import { useGameStore } from "./gameStore";
import { saveGame } from "../domain/save";
import { findNextDebugVoyageBoundary } from "../domain/debugVoyageBoundary";
import { getDebugClockOffset, getUnshiftedRealTime, restoreDebugClock, setDebugClockOffset } from "./debugClock";
import type { DebugClockState } from "./debugClock";

restoreDebugClock(useGameStore.getState().gameState);
const originalReset = useGameStore.getState().resetGame;
useGameStore.setState({ resetGame: () => {
  const previous = getDebugClockOffset();
  setDebugClockOffset(0);
  try { originalReset(); }
  catch (error) { setDebugClockOffset(previous); throw error; }
} });
const labels = { departed: "積込完了・出港", portCall: "途中港への到着・補油", arrived: "目的港到着", completed: "荷卸完了・精算待ち", fuelDepleted: "燃料切れ帰還" };
let locked = false;
export async function debugAdvanceToNextBoundary(): Promise<string> {
  if (locked) throw new Error("別の時間送りを処理中です。");
  locked = true;
  try {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const store = useGameStore.getState();
    if (store.selectedContractId !== null) throw new Error("依頼・航海計画の画面を閉じてください。");
    const active = store.gameState.activeVoyage;
    if (!active || active.phase === "completed" || active.settled || active.plannedNavigation === undefined) throw new Error("進行中の確定計画航海がありません。");
    store.tick();
    const source = useGameStore.getState().gameState;
    const result = findNextDebugVoyageBoundary(source);
    if (result.kind === "unavailable") return result.reason;
    if (useGameStore.getState().gameState !== source) throw new Error("計算中に状態が変わりました。もう一度実行してください。");
    const offsetMs = Math.max(getDebugClockOffset(), Math.ceil(result.atRealTime - getUnshiftedRealTime()));
    const next: DebugClockState = { ...result.state, debugClock: { version: 1, offsetMs } };
    // Persist candidate and clock metadata together before changing the tab clock or publishing.
    saveGame(next);
    setDebugClockOffset(offsetMs);
    useGameStore.setState({ gameState: next, selectedContractId: null });
    return `${labels[result.event]}まで進めて保存しました（${new Date(result.atRealTime).toLocaleString("ja-JP")}）。検証用時計を使用中です。`;
  } finally { locked = false; }
}

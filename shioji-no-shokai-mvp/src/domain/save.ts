import type { GameState, SaveData } from "./types";
import { SAVE_KEY, SAVE_VERSION } from "../data/gameConstants";

export function saveGame(state: GameState): void {
  const saveData: SaveData = { version: SAVE_VERSION, savedAtRealTime: Date.now(), gameState: state };
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

export function loadGame(): GameState | null {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SaveData;
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed.gameState;
  } catch {
    return null;
  }
}

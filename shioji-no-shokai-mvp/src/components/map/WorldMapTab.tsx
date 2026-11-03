import { useState } from "react";
import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { useGameStore } from "../../state/gameStore";
import { MapViewport } from "./MapViewport";
import { ForecastMap } from "./ForecastMap";
import "../../styles/worldMap.css";

interface WorldMapTabProps {
  ships: Ship[];
  voyage: Voyage | null;
  contract: AcceptedContract | null;
}

export function WorldMapTab({ ships, voyage, contract }: WorldMapTabProps) {
  const [mode, setMode] = useState<"current" | "forecast">("current");
  const currentRealTime = useGameStore(state => state.gameState.currentGameTime);
  return <section className="world-map-tab" aria-label="世界海図">
    <div role="group" aria-label="海図の表示モード">
      <button type="button" aria-pressed={mode === "current"} onClick={() => setMode("current")}>現在</button>
      <button type="button" aria-pressed={mode === "forecast"} onClick={() => setMode("forecast")}>予報</button>
    </div>
    {mode === "current" ? <MapViewport /> : <ForecastMap key={voyage?.id ?? "no-voyage"} ships={ships} voyage={voyage} contract={contract} currentRealTime={currentRealTime} />}
  </section>;
}

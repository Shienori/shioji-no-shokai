import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { MapViewport } from "./MapViewport";
import "../../styles/worldMap.css";

interface WorldMapTabProps {
  ships: Ship[];
  voyage: Voyage | null;
  contract: AcceptedContract | null;
}

export function WorldMapTab(_props: WorldMapTabProps) {
  return <section className="world-map-tab" aria-label="世界海図"><MapViewport /></section>;
}

import type { MapHex } from "../domain/hexMap";
import { worldMap } from "./worldMap";

export const HEX_DISTANCE_NM = 15;

function coordinateToken(value: number): string {
  return value < 0 ? `m${Math.abs(value)}` : String(value);
}

export const hexMap: MapHex[] = [
  ...worldMap.features.flatMap((feature): MapHex[] => {
    if (feature.type !== "port") return [];
    return [{
      id: `hex_${feature.portId}`,
      q: feature.q,
      r: feature.r,
      kind: "port",
      portId: feature.portId,
    }];
  }),
  ...worldMap.seaHexes
    .filter((hex) => hex.isNavigable)
    .map((hex): MapHex => ({
      id: `hex_sea_q${coordinateToken(hex.q)}_r${coordinateToken(hex.r)}`,
      q: hex.q,
      r: hex.r,
      kind: "sea",
    })),
];

export function getHexById(id: string): MapHex {
  const hex = hexMap.find((item) => item.id === id);
  if (!hex) throw new Error(`Unknown hex: ${id}`);
  return hex;
}

export function getPortHexId(portId: string): string {
  const hex = hexMap.find((item) => item.kind === "port" && item.portId === portId);
  if (!hex) throw new Error(`Unknown port hex: ${portId}`);
  return hex.id;
}

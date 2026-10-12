import { findShortestRoute, type AxialHex } from "./hexMap";
import { getPortHexId, hexMap } from "../data/hexMap";

function toAxialHex(hexId: string): AxialHex {
  const hex = hexMap.find((item) => item.id === hexId);

  if (!hex) {
    throw new Error(`Unknown hex: ${hexId}`);
  }

  return { q: hex.q, r: hex.r };
}

export function getRouteHexIds(fromPortId: string, toPortId: string): string[] | null {
  const startHexId = getPortHexId(fromPortId);
  const goalHexId = getPortHexId(toPortId);
  const startHex = hexMap.find((hex) => hex.id === startHexId);
  const goalHex = hexMap.find((hex) => hex.id === goalHexId);

  if (!startHex || !goalHex) return null;

  const route = findShortestRoute(
    { q: startHex.q, r: startHex.r },
    { q: goalHex.q, r: goalHex.r },
    hexMap
      .filter((hex) => hex.kind === "sea" || hex.id === startHexId || hex.id === goalHexId)
      .map((hex) => ({ q: hex.q, r: hex.r }))
  );

  if (!route) return null;

  return route.map((point) => {
    const hex = hexMap.find((item) => item.q === point.q && item.r === point.r);
    if (!hex) throw new Error(`Route hex not found at ${point.q},${point.r}`);
    return hex.id;
  });
}

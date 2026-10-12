export type AxialHex = { q: number; r: number };

export type HexKind = "sea" | "port";

export type SeaCondition = "calm" | "followingWind" | "headwind";

export interface MapHex {
  id: string;
  q: number;
  r: number;
  kind: HexKind;
  regionId?: string;
  portId?: string;
}

export const HEX_DISTANCE_NM = 15;

export const BASE_SHIP_SPEED_KNOTS = 6;

export const seaConditionSpeedMultiplier: Record<SeaCondition, number> = {
  calm: 0.6,
  followingWind: 1.3,
  headwind: 0.8
};

export function getHexKey(hex: AxialHex): string {
  return `${hex.q},${hex.r}`;
}

export function getHexNeighbors(hex: AxialHex): AxialHex[] {
  const { q, r } = hex;

  return [
    { q: q + 1, r },
    { q: q - 1, r },
    { q, r: r + 1 },
    { q, r: r - 1 },
    { q: q + 1, r: r - 1 },
    { q: q - 1, r: r + 1 }
  ];
}

export function findShortestRoute(
  start: AxialHex,
  goal: AxialHex,
  passableHexes: AxialHex[]
): AxialHex[] | null {
  const passableKeys = new Set(passableHexes.map(getHexKey));
  const startKey = getHexKey(start);
  const goalKey = getHexKey(goal);

  if (!passableKeys.has(startKey) || !passableKeys.has(goalKey)) {
    return null;
  }

  const queue: AxialHex[][] = [[start]];
  const visited = new Set([startKey]);

  while (queue.length > 0) {
    const route = queue.shift()!;
    const current = route[route.length - 1];
    const currentKey = getHexKey(current);

    if (currentKey === goalKey) {
      return route;
    }

    for (const neighbor of getHexNeighbors(current)) {
      const neighborKey = getHexKey(neighbor);

      if (!passableKeys.has(neighborKey) || visited.has(neighborKey)) {
        continue;
      }

      visited.add(neighborKey);
      queue.push([...route, neighbor]);
    }
  }

  return null;
}

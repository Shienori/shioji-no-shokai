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

export function getSeaHexCount(route: AxialHex[]): number {
  return Math.max(0, route.length - 1);
}

export function getRouteDistanceNm(route: AxialHex[]): number {
  return getSeaHexCount(route) * HEX_DISTANCE_NM;
}

export function getEffectiveSpeedKnots(
  baseSpeedKnots: number,
  condition: SeaCondition
): number {
  return baseSpeedKnots * seaConditionSpeedMultiplier[condition];
}

export function getVoyageHours(
  route: AxialHex[],
  baseSpeedKnots: number,
  condition: SeaCondition
): number {
  const distanceNm = getRouteDistanceNm(route);
  const effectiveSpeed = getEffectiveSpeedKnots(baseSpeedKnots, condition);

  if (effectiveSpeed <= 0) {
    throw new Error("Effective ship speed must be greater than zero");
  }

  return distanceNm / effectiveSpeed;
}

export function getCurrentHexFromRoute(
  route: AxialHex[],
  progress: number
): AxialHex {
  if (route.length === 0) {
    throw new Error("Route must not be empty");
  }

  const seaHexCount = getSeaHexCount(route);

  if (seaHexCount === 0) {
    return route[0];
  }

  const clampedProgress = Math.min(1, Math.max(0, progress));
  const routeIndex = Math.min(
    seaHexCount,
    Math.floor(clampedProgress * seaHexCount)
  );

  return route[routeIndex];
}

export interface MapAxial {
  q: number;
  r: number;
}

export interface MapPoint {
  x: number;
  y: number;
}

export const MAP_HEX_SIZE = 26;
export const MAP_PADDING = MAP_HEX_SIZE + 48;

const HEX_WIDTH = Math.sqrt(3) * MAP_HEX_SIZE;

export function getMapCenter({ q, r }: MapAxial): MapPoint {
  return {
    x: HEX_WIDTH * (q + r / 2),
    y: -1.5 * MAP_HEX_SIZE * r,
  };
}

export function getMapViewBox(
  centers: readonly MapPoint[],
): string {
  const minX = Math.min(...centers.map(point => point.x)) - MAP_PADDING;
  const maxX = Math.max(...centers.map(point => point.x)) + MAP_PADDING;
  const minY = Math.min(...centers.map(point => point.y)) - MAP_PADDING;
  const maxY = Math.max(...centers.map(point => point.y)) + MAP_PADDING;

  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

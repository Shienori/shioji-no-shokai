export interface Wind { speedMps: number; fromDeg: number | null; }
export interface Axial { q: number; r: number; }
export interface Vector { east: number; north: number; }
export interface CoastalProfile { east: number; north: number; distanceFactor: number; }
const EPS = 1e-9;

export function windToVector(w: Wind): Vector {
  if (!Number.isFinite(w.speedMps) || w.speedMps < 0) throw new Error("Invalid wind speed");
  if (w.speedMps === 0) {
    if (w.fromDeg !== null) throw new Error("Calm wind requires null direction");
    return { east: 0, north: 0 };
  }
  if (w.fromDeg === null || !Number.isFinite(w.fromDeg) || w.fromDeg < 0 || w.fromDeg >= 360) throw new Error("Invalid wind direction");
  const a = w.fromDeg * Math.PI / 180;
  return { east: -w.speedMps * Math.sin(a), north: -w.speedMps * Math.cos(a) };
}
export function vectorToWind(v: Vector): Wind {
  const speedMps = Math.hypot(v.east, v.north);
  if (!Number.isFinite(speedMps)) throw new Error("Invalid vector");
  return speedMps < EPS ? { speedMps: 0, fromDeg: null } : {
    speedMps, fromDeg: ((Math.atan2(-v.east, -v.north) * 180 / Math.PI) % 360 + 360) % 360
  };
}
// HexMap.tsx uses screen y=-1.5*r. North is negative screen y.
export function axialToWorld(h: Axial): Vector {
  return { east: Math.sqrt(3) * (h.q + h.r / 2), north: 1.5 * h.r };
}
export function buildCoastalProfile(sea: Axial, land: readonly Axial[]): CoastalProfile {
  const origin = axialToWorld(sea);
  let nearest = Infinity, east = 0, north = 0, total = 0;
  const seen = new Set<string>();
  for (const cell of land) {
    const key = `${cell.q},${cell.r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dq = cell.q - sea.q, dr = cell.r - sea.r;
    const distance = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    if (distance === 0) throw new Error("Sea overlaps land");
    if (distance > 3) continue;
    nearest = Math.min(nearest, distance);
    const p = axialToWorld(cell), dx = p.east - origin.east, dy = p.north - origin.north;
    const length = Math.hypot(dx, dy), weight = 1 / distance ** 2;
    east += weight * dx / length; north += weight * dy / length; total += weight;
  }
  return total === 0 ? { east: 0, north: 0, distanceFactor: 0 } : {
    east: east / total, north: north / total,
    distanceFactor: nearest === 1 ? 1 : nearest === 2 ? 0.6 : 0.3
  };
}
export function diurnalStrength(hour: number): number {
  if (!Number.isFinite(hour)) throw new Error("Invalid hour");
  const phase = Math.sin(2 * Math.PI * (hour - 8) / 24);
  return Math.abs(phase) < EPS ? 0 : phase * (phase > 0 ? 3 : 1.5);
}
export function backgroundSuppression(speed: number): number {
  if (!Number.isFinite(speed) || speed < 0) throw new Error("Invalid wind speed");
  const points = [[0, 1], [2, 1], [5, 0.7], [7, 0.4], [10, 0.2]];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1], [x2, y2] = points[i];
    if (speed <= x2) return y1 + (y2 - y1) * (speed - x1) / (x2 - x1);
  }
  return 0.2;
}
export function combineCoastalWind(background: Wind, profile: CoastalProfile, localHour: number): { wind: Wind; coastalWind: Wind } {
  if (![profile.east, profile.north, profile.distanceFactor].every(Number.isFinite) || profile.distanceFactor < 0 || profile.distanceFactor > 1 || Math.hypot(profile.east, profile.north) > 1 + EPS) throw new Error("Invalid coastal profile");
  const b = windToVector(background);
  const scale = diurnalStrength(localHour) * profile.distanceFactor * backgroundSuppression(background.speedMps);
  const c = { east: profile.east * scale, north: profile.north * scale };
  return { coastalWind: vectorToWind(c), wind: vectorToWind({ east: b.east + c.east, north: b.north + c.north }) };
}

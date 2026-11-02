import type { Wind } from "./coastalWind";
export const FORECAST_DIRECTION_TOLERANCE_DEG = 45;
export const FORECAST_SPEED_TOLERANCE_MPS = 2;
export const WEAK_WIND_THRESHOLD_MPS = 2;
const EPS = 1e-9;
export function assertValidWind(wind: Wind): void {
  if (!wind || !Number.isFinite(wind.speedMps) || wind.speedMps < 0) throw new Error("Invalid wind speed");
  if (wind.speedMps === 0) {
    if (wind.fromDeg !== null) throw new Error("Calm wind requires null direction");
  } else if (wind.fromDeg === null || !Number.isFinite(wind.fromDeg) || wind.fromDeg < 0 || wind.fromDeg >= 360) {
    throw new Error("Invalid wind direction");
  }
}
export function angularDifferenceDeg(a: number, b: number): number {
  if (![a, b].every(v => Number.isFinite(v) && v >= 0 && v < 360)) throw new Error("Invalid bearing");
  const difference = Math.abs(a - b);
  return Math.min(difference, 360 - difference);
}
export function isWindForecastHit(actual: Wind, forecast: Wind): boolean {
  assertValidWind(actual); assertValidWind(forecast);
  if (Math.abs(actual.speedMps - forecast.speedMps) > FORECAST_SPEED_TOLERANCE_MPS + EPS) return false;
  if (actual.speedMps < WEAK_WIND_THRESHOLD_MPS && forecast.speedMps < WEAK_WIND_THRESHOLD_MPS) return true;
  if (actual.fromDeg === null || forecast.fromDeg === null) return false;
  return angularDifferenceDeg(actual.fromDeg, forecast.fromDeg) <= FORECAST_DIRECTION_TOLERANCE_DEG + EPS;
}

import type { Wind } from "../../domain/coastalWind";
import type { ContractWindForecastSnapshot } from "../../domain/contractWindForecast";
import { getSavedWindForecastAt } from "../../domain/contractWindForecast";
import { buildRouteWindLegs } from "../../domain/routeWind";
import { calculateWindSpeedFactor } from "../../domain/shipPerformance";
import { getHexById } from "../../data/hexMap";

export const WIND_IMPACT_COLORS = {
  positive: "#15803d",
  negative: "#b91c1c",
  neutral: "#475569",
} as const;

const DIRECTIONS = [
  "北", "北東", "東", "南東", "南", "南西", "西", "北西",
];

export function describeNumericWind(
  wind: Wind,
  headingDeg: number,
  assessSpeed = true,
) {
  const factor = calculateWindSpeedFactor(headingDeg, wind);
  const delta = assessSpeed ? (factor - 1) * 100 : null;
  const effect = delta === null || Math.abs(delta) < 1e-12
    ? "neutral"
    : delta > 0 ? "positive" : "negative";

  const directionShort = wind.fromDeg === null
    ? "風向なし"
    : DIRECTIONS[Math.round(wind.fromDeg / 45) % 8];

  const directionLabel = wind.fromDeg === null
    ? "風向なし"
    : `${directionShort}（${wind.fromDeg.toFixed(1)}°から）`;

  const speedLabel = wind.speedMps > 0 && wind.speedMps < 0.1
    ? "0.1 m/s未満"
    : `${wind.speedMps.toFixed(1)} m/s`;

  const magnitude = delta === null ? 0 : Math.abs(delta);
  const deltaLabel = delta === null
    ? "補正未評価"
    : effect === "neutral"
      ? "±0.00%"
      : `${delta > 0 ? "＋" : "−"}${magnitude < 0.01
        ? "0.01%未満"
        : `${magnitude.toFixed(2)}%`}`;

  return {
    directionShort,
    directionLabel,
    speedLabel,
    deltaLabel,
    effect,
    color: WIND_IMPACT_COLORS[effect],
    factor: assessSpeed ? factor : null,
  };
}

export function getNumericWindRows(
  snapshot: ContractWindForecastSnapshot | null,
  routeHexIds: readonly string[],
  targetMs: number,
  assessSpeed = true,
) {
  if (!snapshot || routeHexIds.length < 3) return [];

  return buildRouteWindLegs(routeHexIds).flatMap(leg => {
    const slot = getSavedWindForecastAt(
      snapshot,
      leg.hexId,
      Math.floor(targetMs),
    );
    if (!slot) return [];

    const hex = getHexById(leg.hexId);

    return [{
      hexId: hex.id,
      axial: { q: hex.q, r: hex.r },
      wind: slot.forecastWind,
      ...describeNumericWind(
        slot.forecastWind,
        leg.headingDeg,
        assessSpeed,
      ),
    }];
  });
}

export type WindRows = ReturnType<typeof getNumericWindRows>;

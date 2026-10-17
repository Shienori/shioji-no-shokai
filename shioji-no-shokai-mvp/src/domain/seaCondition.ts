import type {
  AxialHex,
  SeaCondition,
} from "./hexMap";
import {
  BASE_SHIP_SPEED_KNOTS,
  HEX_DISTANCE_NM,
  seaConditionSpeedMultiplier,
} from "./hexMap";
import { getHexById } from "../data/hexMap";

export const SEA_CONDITION_SLOT_MS = 2 * 60 * 60 * 1000;
export const SEA_CONDITION_FORECAST_DAYS = 7;
export const SEA_CONDITION_FORECAST_ACCURACY = 0.8;
export const FORECAST_UPDATE_HOUR = 6;

export const FORECAST_HORIZON_MS =
  SEA_CONDITION_FORECAST_DAYS * 24 * 60 * 60 * 1000;

export interface SeaConditionSlot {
  hexId: string;
  slotIndex: number;
  startsAt: number;
  endsAt: number;
  condition: SeaCondition;
}

export interface SeaConditionForecast {
  hexId: string;
  slotIndex: number;
  startsAt: number;
  endsAt: number;
  forecast: SeaCondition;
}

export interface RouteSeaForecast {
  routeId: string;
  generatedAt: number;
  issuedAt: number;
  accuracy: number;
  forecasts: SeaConditionForecast[];
}

export interface PredictedShipPosition {
  hexId: string;
  hex: AxialHex;
  progress: number;
  transitHours: number;
  condition: SeaCondition;
  hasArrived: boolean;
}

export interface VoyageTimeRange {
  min: number;
  max: number;
}

const REGION_CONDITION_WEIGHTS: Record<
  string,
  Record<SeaCondition, number>
> = {
  kingdom_coast: {
    calm: 0.4,
    followingWind: 0.35,
    headwind: 0.25,
  },
  central_sea: {
    calm: 0.35,
    followingWind: 0.35,
    headwind: 0.3,
  },
  western_open_sea: {
    calm: 0.3,
    followingWind: 0.4,
    headwind: 0.3,
  },
  eastern_open_sea: {
    calm: 0.3,
    followingWind: 0.35,
    headwind: 0.35,
  },
};

const DEFAULT_CONDITION_WEIGHTS: Record<SeaCondition, number> = {
  calm: 0.35,
  followingWind: 0.35,
  headwind: 0.3,
};

const ALL_CONDITIONS: SeaCondition[] = [
  "calm",
  "followingWind",
  "headwind",
];

function createSeed(...parts: Array<string | number>): number {
  const source = parts.join(":");
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pickCondition(
  random: () => number,
  weights: Record<SeaCondition, number>,
): SeaCondition {
  const roll = random();
  let cumulative = 0;

  for (const condition of ALL_CONDITIONS) {
    cumulative += weights[condition];

    if (roll < cumulative) {
      return condition;
    }
  }

  return "calm";
}

function pickOtherCondition(
  random: () => number,
  actual: SeaCondition,
): SeaCondition {
  const others = ALL_CONDITIONS.filter(
    (condition) => condition !== actual,
  );

  return others[Math.floor(random() * others.length)];
}

function getConditionWeights(
  hexId: string,
): Record<SeaCondition, number> {
  const hex = getHexById(hexId);

  if (!hex.regionId) {
    return DEFAULT_CONDITION_WEIGHTS;
  }

  return (
    REGION_CONDITION_WEIGHTS[hex.regionId] ??
    DEFAULT_CONDITION_WEIGHTS
  );
}

export function getSeaConditionSlotIndex(
  timeMs: number,
): number {
  return Math.floor(timeMs / SEA_CONDITION_SLOT_MS);
}

export function getSeaConditionSlotStart(
  timeMs: number,
): number {
  return getSeaConditionSlotIndex(timeMs) * SEA_CONDITION_SLOT_MS;
}

export function getForecastIssueTime(timeMs: number): number {
  const issueTime = new Date(timeMs);

  issueTime.setHours(FORECAST_UPDATE_HOUR, 0, 0, 0);

  if (timeMs < issueTime.getTime()) {
    issueTime.setDate(issueTime.getDate() - 1);
  }

  return issueTime.getTime();
}

export function getSeaConditionAt(
  hexId: string,
  timeMs: number,
): SeaCondition {
  const slotIndex = getSeaConditionSlotIndex(timeMs);
  const random = createRandom(
    createSeed("sea-condition", hexId, slotIndex),
  );

  return pickCondition(random, getConditionWeights(hexId));
}

export function getSeaConditionForecastAt(
  hexId: string,
  timeMs: number,
): SeaCondition {
  const issuedAt = getForecastIssueTime(timeMs);
  const slotIndex = getSeaConditionSlotIndex(timeMs);
  const actual = getSeaConditionAt(hexId, timeMs);

  const random = createRandom(
    createSeed(
      "sea-condition-forecast",
      hexId,
      slotIndex,
      issuedAt,
    ),
  );

  const isAccurate =
    random() < SEA_CONDITION_FORECAST_ACCURACY;

  return isAccurate
    ? actual
    : pickOtherCondition(random, actual);
}

export function getSeaConditionForecastRange(
  hexId: string,
  fromMs: number,
): SeaConditionForecast[] {
  const issuedAt = getForecastIssueTime(fromMs);
  const forecasts: SeaConditionForecast[] = [];

  for (
    let timeMs = issuedAt;
    timeMs < issuedAt + FORECAST_HORIZON_MS;
    timeMs += SEA_CONDITION_SLOT_MS
  ) {
    const slotIndex = getSeaConditionSlotIndex(timeMs);

    forecasts.push({
      hexId,
      slotIndex,
      startsAt: timeMs,
      endsAt: timeMs + SEA_CONDITION_SLOT_MS,
      forecast: getSeaConditionForecastAt(hexId, timeMs),
    });
  }

  return forecasts;
}

export function createRouteSeaForecast(
  routeId: string,
  seaHexIds: string[],
  generatedAt: number,
): RouteSeaForecast {
  const issuedAt = getForecastIssueTime(generatedAt);

  const forecasts = seaHexIds.map((hexId) => {
    const slotIndex = getSeaConditionSlotIndex(generatedAt);

    return {
      hexId,
      slotIndex,
      startsAt: slotIndex * SEA_CONDITION_SLOT_MS,
      endsAt: (slotIndex + 1) * SEA_CONDITION_SLOT_MS,
      forecast: getSeaConditionForecastAt(
        hexId,
        generatedAt,
      ),
    };
  });

  return {
    routeId,
    generatedAt,
    issuedAt,
    accuracy: SEA_CONDITION_FORECAST_ACCURACY,
    forecasts,
  };
}

export function calculateHexTransitHours(
  baseSpeedKnots: number,
  condition: SeaCondition,
): number {
  const effectiveSpeed =
    baseSpeedKnots * seaConditionSpeedMultiplier[condition];

  return HEX_DISTANCE_NM / effectiveSpeed;
}

export function calculateRemainingTransitHours(
  remainingDistanceNm: number,
  baseSpeedKnots: number,
  condition: SeaCondition,
): number {
  const effectiveSpeed =
    baseSpeedKnots * seaConditionSpeedMultiplier[condition];

  return remainingDistanceNm / effectiveSpeed;
}

export function calculateEstimatedArrivalAt(
  routeSeaHexIds: string[],
  departureAt: number,
  baseSpeedKnots: number,
): number {
  let totalHours = 0;

  for (const hexId of routeSeaHexIds) {
    const condition = getSeaConditionForecastAt(
      hexId,
      departureAt,
    );

    totalHours += calculateHexTransitHours(
      baseSpeedKnots,
      condition,
    );
  }

  return departureAt + totalHours * 60 * 60 * 1000;
}

export function getPredictedShipPosition(
  routeHexIds: string[],
  departureAt: number,
  selectedAt: number,
  baseSpeedKnots: number = BASE_SHIP_SPEED_KNOTS,
): PredictedShipPosition {
  let remainingHours = Math.max(
    0,
    (selectedAt - departureAt) / (60 * 60 * 1000),
  );

  let accumulatedHours = 0;

  for (const hexId of routeHexIds) {
    const hex = getHexById(hexId);

    if (hex.kind === "port") {
      continue;
    }

    const arrivalAt =
      departureAt + accumulatedHours * 60 * 60 * 1000;

    const condition = getSeaConditionForecastAt(
      hexId,
      arrivalAt,
    );

    const transitHours = calculateHexTransitHours(
      baseSpeedKnots,
      condition,
    );

    if (remainingHours <= transitHours) {
      return {
        hexId,
        hex,
        progress: remainingHours / transitHours,
        transitHours,
        condition,
        hasArrived: false,
      };
    }

    remainingHours -= transitHours;
    accumulatedHours += transitHours;
  }

  const lastHexId = routeHexIds[routeHexIds.length - 1];
  const lastHex = getHexById(lastHexId);

  return {
    hexId: lastHexId,
    hex: lastHex,
    progress: 1,
    transitHours: 0,
    condition: getSeaConditionForecastAt(
      lastHexId,
      selectedAt,
    ),
    hasArrived: true,
  };
}

export function getVoyageTimeRange(
  now: number,
  estimatedArrivalAt: number | null,
): VoyageTimeRange {
  const forecastEnd = now + FORECAST_HORIZON_MS;

  return {
    min: now,
    max: estimatedArrivalAt
      ? Math.min(forecastEnd, estimatedArrivalAt)
      : forecastEnd,
  };
}

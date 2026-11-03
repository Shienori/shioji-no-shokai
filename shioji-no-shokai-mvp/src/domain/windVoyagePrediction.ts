import type { Route } from "./types";
import type { ContractWindForecastSnapshot } from "./contractWindForecast";
import { getSavedWindForecastAt, isValidContractWindForecast } from "./contractWindForecast";
import { getRouteWindLegs } from "./routeWind";
import { getHexById, getPortHexId } from "../data/hexMap";
import { advanceWindNavigation, estimateSavedWindArrival } from "./windNavigation";
import type { WindNavigationResult, WindNavigationState } from "./windNavigation";

export const WIND_VOYAGE_PREDICTION_VERSION = "numeric-wind-prediction-v1";
export interface WindVoyagePredictionInput {
  route: Readonly<Pick<Route, "id" | "fromPortId" | "toPortId">>;
  snapshot: ContractWindForecastSnapshot | null;
  departureRealTime: number;
  state: Readonly<WindNavigationState>;
  selectedSpeedKnots: number;
  loadSpeedFactor: number;
  referenceFuelPerVoyageHour: number;
  referenceSpeedKnots: number;
}
export type PredictionIssue = "missingForecast" | "invalidForecast" | "routeMismatch" | "outsideForecast" | "forecastHorizon" | "insufficientFuel" | "windUnavailable";
export type PredictedPositionStatus = "notDeparted" | "sailing" | "arrived" | "fuelDepleted" | "forecastUnavailable";
export interface WindPredictedPosition {
  hexId: string;
  nextHexId: string | null;
  legIndex: number;
  legProgress: number;
  routeProgress: number;
  distanceTravelledNm: number;
  remainingDistanceNm: number;
  axial: { q: number; r: number };
}
export interface WindVoyagePrediction {
  modelVersion: typeof WIND_VOYAGE_PREDICTION_VERSION;
  forecastStatus: WindNavigationResult["status"];
  forecastIssue: PredictionIssue | null;
  forecastIssuedAt: number | null;
  forecastValidTo: number | null;
  etaRealTime: number | null;
  forecastFinishedAt: number;
  forecastFuelRemaining: number;
  totalForecastFuelUsed: number;
  remainingForecastFuelUse: number;
  requestedRealTime: number;
  positionStatus: PredictedPositionStatus;
  position: WindPredictedPosition | null;
  lastKnownPosition: WindPredictedPosition;
  checkpoint: WindNavigationState;
}
function requireTime(value: number): void {
  if (!Number.isFinite(value) || Math.abs(value) > 8.64e15) throw new RangeError("Invalid prediction time");
}

/**
 * Pure sailing prediction: one saved forecast edition drives ETA, fuel and position.
 * Port HEXes add no sailing distance, matching routeWind's existing convention.
 * Axial interpolation is a map representation between HEX centres, not a surveyed track.
 * departureRealTime must already include any loading delay chosen by the caller.
 * A resumed checkpoint cannot be rewound. No actual wind, forecast generation,
 * clock, unloading, rescue policy, fuel debit or persistence occurs here.
 */
export function predictSavedWindVoyage(input: WindVoyagePredictionInput, requestedRealTime: number): WindVoyagePrediction {
  requireTime(input.departureRealTime);
  requireTime(input.state.processedRealTime);
  requireTime(requestedRealTime);
  if (input.state.processedRealTime < input.departureRealTime) throw new RangeError("Checkpoint precedes departure");
  const legs = getRouteWindLegs(input.route);
  const start = { ...input.state };
  const base = {
    legs, state: start,
    selectedSpeedKnots: input.selectedSpeedKnots,
    loadSpeedFactor: input.loadSpeedFactor,
    referenceFuelPerVoyageHour: input.referenceFuelPerVoyageHour,
    referenceSpeedKnots: input.referenceSpeedKnots,
  };
  // Zero-duration integration validates settings and checkpoint without reading weather.
  const checked = advanceWindNavigation({ ...base, untilRealTime: start.processedRealTime, readWind: () => null });
  const pristine = start.processedRealTime === input.departureRealTime && start.legIndex === 0 &&
    start.distanceIntoLegNm === 0 && start.totalFuelUsed === 0;
  const beforeDeparture = requestedRealTime < input.departureRealTime && pristine;
  if (requestedRealTime < start.processedRealTime && !beforeDeparture) throw new RangeError("Cannot rewind prediction checkpoint");
  const snapshot = input.snapshot;
  let issue: PredictionIssue | null = null;
  if (!snapshot) issue = "missingForecast";
  else if (!isValidContractWindForecast(snapshot, input.route.id, snapshot.capturedAt)) issue = "invalidForecast";
  else if (snapshot.seaHexIds.length !== legs.length || snapshot.seaHexIds.some((id, index) => id !== legs[index].hexId)) issue = "routeMismatch";
  else if (start.processedRealTime < snapshot.validFrom || start.processedRealTime > snapshot.validTo) issue = "outsideForecast";
  const usableForecast = issue === null;
  let final: WindNavigationResult;
  if (checked.status === "arrived") {
    final = checked;
    issue = null;
  } else if (!usableForecast) {
    final = { status: "windUnavailable", state: { ...start }, arrivalRealTime: null };
  } else {
    final = estimateSavedWindArrival(base, snapshot!);
    if (final.status === "timeReached") issue = "forecastHorizon";
    else if (final.status === "fuelDepleted") issue = "insufficientFuel";
    else if (final.status === "windUnavailable") issue = "windUnavailable";
  }
  let point = checked;
  if (!beforeDeparture) {
    if (requestedRealTime >= final.state.processedRealTime) point = final;
    else if (requestedRealTime > start.processedRealTime && usableForecast) {
      point = advanceWindNavigation({
        ...base, untilRealTime: requestedRealTime,
        readWind: (hexId, realTime) => {
          const slot = getSavedWindForecastAt(snapshot!, hexId, Math.floor(realTime));
          return slot ? { wind: slot.forecastWind, startsAt: slot.startsAt, endsAt: Math.min(slot.endsAt, snapshot!.validTo) } : null;
        },
      });
    }
  }
  const totalDistanceNm = legs.reduce((sum, leg) => sum + leg.distanceNm, 0);
  const origin = getHexById(getPortHexId(input.route.fromPortId));
  const destination = getHexById(getPortHexId(input.route.toPortId));
  const location = (state: WindNavigationState): WindPredictedPosition => {
    const arrived = state.legIndex === legs.length;
    const distanceTravelledNm = arrived ? totalDistanceNm : legs.slice(0, state.legIndex).reduce((sum, leg) => sum + leg.distanceNm, 0) + state.distanceIntoLegNm;
    const leg = arrived ? null : legs[state.legIndex];
    const legProgress = leg ? state.distanceIntoLegNm / leg.distanceNm : 1;
    const atOrigin = state.processedRealTime === input.departureRealTime && state.legIndex === 0 && state.distanceIntoLegNm === 0;
    const from = arrived ? destination : atOrigin ? origin : getHexById(leg!.hexId);
    const to = arrived || atOrigin ? from : getHexById(leg!.nextHexId);
    return {
      hexId: from.id,
      nextHexId: arrived ? null : atOrigin ? legs[0].hexId : leg!.nextHexId,
      legIndex: state.legIndex,
      legProgress,
      routeProgress: Math.max(0, Math.min(1, distanceTravelledNm / totalDistanceNm)),
      distanceTravelledNm,
      remainingDistanceNm: Math.max(0, totalDistanceNm - distanceTravelledNm),
      axial: { q: from.q + (to.q - from.q) * legProgress, r: from.r + (to.r - from.r) * legProgress },
    };
  };
  const lastKnownPosition = location(point.state);
  const unavailableAtRequestedTime = !beforeDeparture &&
    (point.status === "windUnavailable" || point.status === "timeReached") && point.state.processedRealTime < requestedRealTime;
  const positionStatus: PredictedPositionStatus = beforeDeparture ? "notDeparted" :
    point.status === "arrived" ? "arrived" : unavailableAtRequestedTime ? "forecastUnavailable" :
    point.state.fuelRemaining === 0 ? "fuelDepleted" : "sailing";
  return {
    modelVersion: WIND_VOYAGE_PREDICTION_VERSION,
    forecastStatus: final.status,
    forecastIssue: issue,
    forecastIssuedAt: usableForecast ? snapshot!.issuedAt : null,
    forecastValidTo: usableForecast ? snapshot!.validTo : null,
    etaRealTime: final.arrivalRealTime,
    forecastFinishedAt: final.state.processedRealTime,
    forecastFuelRemaining: final.state.fuelRemaining,
    totalForecastFuelUsed: final.state.totalFuelUsed,
    remainingForecastFuelUse: Math.max(0, final.state.totalFuelUsed - start.totalFuelUsed),
    requestedRealTime,
    positionStatus,
    position: unavailableAtRequestedTime ? null : { ...lastKnownPosition, axial: { ...lastKnownPosition.axial } },
    lastKnownPosition,
    checkpoint: { ...point.state },
  };
}

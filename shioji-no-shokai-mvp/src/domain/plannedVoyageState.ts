import type { Ship, Voyage } from "./types";
import type { ConfirmedVoyageRoute } from "./voyagePlanTypes";
import type { PlannedVoyageSettings, PlannedVoyageCheckpoint } from "./plannedVoyage";
import { createPlannedVoyageCheckpoint } from "./plannedVoyage";
import { isValidShipFuel } from "./coalFuel";
import { calculateFuelRate } from "./shipPerformance";
import { SHIP_PERFORMANCE_MODEL_VERSION } from "./shipPerformance";
import { WIND_MODEL_VERSION } from "./windTimeline";

/** Settings/route are fixed at creation. Checkpoint is the sole planned progress. */
export interface PlannedVoyageState {
  modelVersion: "planned-voyage-v1";
  shipPerformanceModelVersion: string;
  windModelVersion: string;
  voyageId: string;
  shipId: string;
  contractId: string;
  departureRealTime: number;
  route: ConfirmedVoyageRoute;
  settings: PlannedVoyageSettings;
  checkpoint: PlannedVoyageCheckpoint;
}
export interface CreatePlannedVoyageStateInput {
  voyage: Pick<Voyage, "id" | "shipId" | "contractId" | "phase" | "departedRealTime">;
  ship: Ship;
  route: ConfirmedVoyageRoute;
  selectedSpeedKnots: number;
  loadSpeedFactor: number;
}
/** Produces a candidate only. Does not attach, save, consume or initialize fuel. */
export function createPlannedVoyageState(input: CreatePlannedVoyageStateInput): PlannedVoyageState {
  const { voyage, ship, selectedSpeedKnots: speed, loadSpeedFactor } = input;
  if (![voyage.id, voyage.shipId, voyage.contractId].every(id => typeof id === "string" && id.trim().length > 0) ||
      voyage.shipId !== ship.id || voyage.phase !== "loading") throw new Error("New loading voyage references required");
  if (ship.kind !== "powered" || !isValidShipFuel(ship.fuel)) throw new Error("Valid powered ship fuel required");
  if (ship.currentPortId !== input.route.departurePortId) throw new Error("Ship is not at departure port");
  if (ship.activeContractId !== null && ship.activeContractId !== voyage.contractId) throw new Error("Ship has another contract");
  if (!Number.isSafeInteger(ship.cruisingSpeedKnots) || ship.cruisingSpeedKnots <= 0 ||
      !Number.isSafeInteger(ship.maxSpeedKnots) || ship.maxSpeedKnots < ship.cruisingSpeedKnots ||
      !Number.isSafeInteger(speed) || speed < ship.cruisingSpeedKnots || speed > ship.maxSpeedKnots) throw new RangeError("Selected speed outside ship limits");
  if (!Number.isFinite(loadSpeedFactor) || loadSpeedFactor <= 0 || loadSpeedFactor > 1) throw new RangeError("Invalid load factor");
  const route: ConfirmedVoyageRoute = {
    schemaVersion: input.route.schemaVersion,
    departurePortId: input.route.departurePortId,
    destinationPortId: input.route.destinationPortId,
    sections: input.route.sections.map(section => ({
      fromPortId: section.fromPortId, toPortId: section.toPortId,
      waypointHexIds: [...section.waypointHexIds], hexIds: [...section.hexIds],
      ...(section.refuelTargetPercent === undefined ? {} : { refuelTargetPercent: section.refuelTargetPercent }),
    })),
  };
  const settings: PlannedVoyageSettings = {
    selectedSpeedKnots: speed, loadSpeedFactor,
    fuelCapacityTons: ship.fuel.capacityTons,
    referenceSpeedKnots: ship.fuel.referenceSpeedKnots,
    referenceConsumptionTonsPerVoyageHour: ship.fuel.referenceConsumptionTonsPerVoyageHour,
  };
  calculateFuelRate(speed, settings.referenceConsumptionTonsPerVoyageHour, settings.referenceSpeedKnots);
  const checkpoint = createPlannedVoyageCheckpoint(route, voyage.departedRealTime);
  return {
    modelVersion: "planned-voyage-v1",
    shipPerformanceModelVersion: SHIP_PERFORMANCE_MODEL_VERSION,
    windModelVersion: WIND_MODEL_VERSION,
    voyageId: voyage.id, shipId: ship.id, contractId: voyage.contractId,
    departureRealTime: voyage.departedRealTime,
    route, settings, checkpoint,
  };
}

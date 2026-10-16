import type { Cargo, ContractTemplate, Route } from "./types";
import { GAME_TIME_MULTIPLIER } from "../data/gameConstants";
import { ceilTo30Minutes } from "./time";

export function getContractCargoRequirements(contract: ContractTemplate, cargo: Cargo) {
  return {
    requiredCargoVolume: cargo.unitVolume * contract.quantity,
    requiredCargoWeight: cargo.weightPerUnit * contract.quantity
  };
}

export function getContractSchedule(contract: ContractTemplate, route: Route, now: number) {
  const voyageDurationMs = route.baseVoyageHours * 60 * 60 * 1000 / GAME_TIME_MULTIPLIER;
  const deadlineDurationMs = contract.deadlineHours * 60 * 60 * 1000 / GAME_TIME_MULTIPLIER;
  return {
    voyageDurationMs,
    estimatedArrivalAt: now + voyageDurationMs,
    deadlineAt: ceilTo30Minutes(now + deadlineDurationMs)
  };
}

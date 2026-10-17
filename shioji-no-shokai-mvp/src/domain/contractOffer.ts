import type { Cargo, ContractTemplate, Route } from "./types";
import { calculateContractSchedule } from "./contractSchedule";

export function getContractCargoRequirements(
  contract: ContractTemplate,
  cargo: Cargo,
) {
  return {
    requiredCargoVolume: cargo.unitVolume * contract.quantity,
    requiredCargoWeight: cargo.weightPerUnit * contract.quantity,
  };
}

export function getContractSchedule(
  contract: ContractTemplate,
  route: Route,
  now: number,
) {
  return calculateContractSchedule(contract, route, now);
}

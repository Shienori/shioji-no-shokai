import type { Ship } from "../domain/types";
import { createInitialShionamiFuel } from "../domain/coalFuel";

export const initialShip: Ship = {
  id: "ship_shionami",
  name: "潮鳴号",
  kind: "powered",
  role: "general_cargo",
  maxCargoVolume: 10,
  maxCargoWeight: 20,
  cruisingSpeedKnots: 6,
  maxSpeedKnots: 7,
  engineType: "初期蒸気機関",
  engineOutput: "外輪式推進",
  currentPortId: "port_selene",
  currentHexId: "hex_port_selene",
  status: "docked",
  activeContractId: null,
  fuel: createInitialShionamiFuel()
};

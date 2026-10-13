import type { Ship } from "../domain/types";

export const initialShip: Ship = {
  id: "ship_shionami",
  name: "潮鳴号",
  kind: "sailing",
  maxLoadUnits: 30,
  cruisingSpeedKnots: 6,
  maxSpeedKnots: 8,
  engineType: "帆走",
  engineOutput: "風力推進",
  currentPortId: "port_selene",
  currentHexId: "hex_port_selene",
  status: "docked",
  activeContractId: null
};

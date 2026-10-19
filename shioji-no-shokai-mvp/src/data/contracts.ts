// Contract difficulty is defined here to keep the contract domain self-contained.
export type ContractDifficulty = "easy" | "normal" | "hard";

import type { ContractTemplate, PortId } from "../domain/types";
import { routesById } from "./routes";

export const tutorialWheatContract: ContractTemplate = {
  id: "contract_tutorial_001",
  shipperId: "shipper_selene_farmers",
  routeId: "route_selene_aldera",
  cargoId: "cargo_wheat",
  quantity: 10,
  offeredReward: 50,
  deadlineHours: 16,
  difficulty: "normal"
};

export const contractTemplates: ContractTemplate[] = [
  tutorialWheatContract,

  // セレネ港 発の通常契約
  { id: "contract_selene_002", shipperId: "shipper_selene_farmers", routeId: "route_selene_rigel", cargoId: "cargo_wheat", quantity: 15, offeredReward: 80, deadlineHours: 20, difficulty: "normal" },
  { id: "contract_selene_003", shipperId: "shipper_aldera_merchants", routeId: "route_selene_aldera", cargoId: "cargo_silk", quantity: 4, offeredReward: 40, deadlineHours: 18, difficulty: "normal" },
  { id: "contract_selene_005", shipperId: "shipper_selene_farmers", routeId: "route_selene_aldera", cargoId: "cargo_wheat", quantity: 8, offeredReward: 44, deadlineHours: 12, difficulty: "easy" },

  // アルデラ港 発の通常契約
  { id: "contract_aldera_001", shipperId: "shipper_selene_farmers", routeId: "route_aldera_selene", cargoId: "cargo_steel", quantity: 6, offeredReward: 62, deadlineHours: 18, difficulty: "normal" },
  { id: "contract_aldera_002", shipperId: "shipper_aldera_merchants", routeId: "route_aldera_rigel", cargoId: "cargo_silk", quantity: 3, offeredReward: 50, deadlineHours: 22, difficulty: "normal" },
  { id: "contract_aldera_003", shipperId: "shipper_selene_farmers", routeId: "route_aldera_selene", cargoId: "cargo_wheat", quantity: 12, offeredReward: 56, deadlineHours: 14, difficulty: "easy" },
  { id: "contract_aldera_004", shipperId: "shipper_rigel_forge", routeId: "route_aldera_rigel", cargoId: "cargo_steel", quantity: 4, offeredReward: 63, deadlineHours: 20, difficulty: "normal" },
  { id: "contract_aldera_005", shipperId: "shipper_aldera_merchants", routeId: "route_aldera_selene", cargoId: "cargo_silk", quantity: 5, offeredReward: 45, deadlineHours: 24, difficulty: "hard" },

  // リゲル港 発の通常契約
  { id: "contract_rigel_001", shipperId: "shipper_rigel_forge", routeId: "route_rigel_aldera", cargoId: "cargo_steel", quantity: 5, offeredReward: 70, deadlineHours: 18, difficulty: "normal" },
  { id: "contract_rigel_002", shipperId: "shipper_rigel_forge", routeId: "route_rigel_aldera", cargoId: "cargo_steel", quantity: 8, offeredReward: 91, deadlineHours: 24, difficulty: "hard" },
  { id: "contract_rigel_003", shipperId: "shipper_aldera_merchants", routeId: "route_rigel_aldera", cargoId: "cargo_silk", quantity: 2, offeredReward: 45, deadlineHours: 20, difficulty: "normal" },
  { id: "contract_rigel_004", shipperId: "shipper_rigel_forge", routeId: "route_rigel_aldera", cargoId: "cargo_steel", quantity: 3, offeredReward: 56, deadlineHours: 16, difficulty: "easy" },
  { id: "contract_rigel_005", shipperId: "shipper_aldera_merchants", routeId: "route_rigel_aldera", cargoId: "cargo_silk", quantity: 4, offeredReward: 55, deadlineHours: 26, difficulty: "normal" }
];

export function getContractTemplateById(id: string): ContractTemplate {
  const template = contractTemplates.find((item) => item.id === id);
  if (!template) throw new Error(`Unknown contract template: ${id}`);
  return template;
}

export function getContractPoolByPort(portId: PortId): ContractTemplate[] {
  return contractTemplates.filter((template) => {
    const route = routesById[template.routeId];
    return route?.fromPortId === portId;
  });
}

export function getContractDifficulty(template: ContractTemplate): ContractDifficulty {
  return template.difficulty ?? "normal";
}

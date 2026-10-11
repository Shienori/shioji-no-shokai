import type { ContractTemplate } from "../domain/types";

export const initialContractTemplate: ContractTemplate = {
  id: "contract_tutorial_001",
  shipperId: "shipper_selene_farmers",
  routeId: "route_selene_aldera",
  cargoId: "cargo_wheat",
  quantity: 10,
  offeredReward: 69,
  deadlineHours: 16
};

export const contractTemplates: ContractTemplate[] = [initialContractTemplate];

export function getContractTemplateById(id: string): ContractTemplate {
  const template = contractTemplates.find((item) => item.id === id);
  if (!template) throw new Error(`Unknown contract template: ${id}`);
  return template;
}

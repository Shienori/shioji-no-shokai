import type { ReputationState, Shipper, ShipperId } from "../domain/types";
export const miraSaltGuild: Shipper = {
  id: "shipper_mira_salt_guild",
  name: "ミラ塩商組合",
  homePortId: "port_mira",
  description: "ミラの塩田主と交易商がつくる組合。各地への塩の出荷と、市場に集まる香辛料の輸送を取りまとめる。",
  organizationType: "guild",
  primaryCargoIds: ["cargo_salt"],
  secondaryCargoIds: ["cargo_spices"],
};
export function findShipperById(id: ShipperId): Shipper | undefined {
  return id === miraSaltGuild.id ? miraSaltGuild : undefined;
}
export function ensureMiraReputation(reputations: ReputationState[]): ReputationState[] {
  if (reputations.some((item) => item.shipperId === miraSaltGuild.id)) return reputations;
  return [...reputations, { shipperId: miraSaltGuild.id, value: 0 }];
}

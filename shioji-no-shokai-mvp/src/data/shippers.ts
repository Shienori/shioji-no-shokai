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

// UIでは「依頼主」と呼ぶ。契約・評判・保存データの既存IDは維持する。
export const shippers: Shipper[] = [
  {
    id: "shipper_selene_farmers",
    name: "セレネ農業組合",
    homePortId: "port_selene",
    description: "セレネ周辺の農家がつくる組合。農産物の出荷や、営農に必要な物資の輸送を依頼する。",
  },
  {
    id: "shipper_aldera_merchants",
    name: "アルデラ商人会",
    homePortId: "port_aldera",
    description: "複数の港で商品を売買し、輸送を仲介する商人団体。",
  },
  {
    id: "shipper_rigel_forge",
    name: "リゲル製鉄組合",
    homePortId: "port_rigel",
    description: "鉄鉱石・鋼材を中心に、工業関連物資を扱う組合。",
  },
  miraSaltGuild,
];

export function findShipperById(id: ShipperId): Shipper | undefined {
  return shippers.find((shipper) => shipper.id === id);
}

export function ensureMiraReputation(reputations: ReputationState[]): ReputationState[] {
  if (reputations.some((item) => item.shipperId === miraSaltGuild.id)) return reputations;
  return [...reputations, { shipperId: miraSaltGuild.id, value: 0 }];
}

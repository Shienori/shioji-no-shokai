import type { AxialHex, HexKind, MapHex, SeaCondition } from "../domain/hexMap";

export const HEX_DISTANCE_NM = 15;

export const hexMap: MapHex[] = [
  { id: "hex_port_aldera", q: 0, r: 0, kind: "port", portId: "port_aldera" },
  { id: "hex_port_selene", q: -2, r: 0, kind: "port", portId: "port_selene" },
  { id: "hex_port_rigel", q: -1, r: 3, kind: "port", portId: "port_rigel" },
  { id: "hex_sea_001", q: -1, r: -1, kind: "sea", regionId: "kingdom_coast" },
  { id: "hex_sea_002", q: 0, r: -1, kind: "sea", regionId: "kingdom_coast" },
  { id: "hex_sea_003", q: 1, r: -1, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_004", q: -2, r: 1, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_005", q: -1, r: 0, kind: "sea", regionId: "kingdom_coast" },
  { id: "hex_sea_007", q: 1, r: 0, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_008", q: -2, r: 2, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_009", q: -1, r: 1, kind: "sea", regionId: "central_sea" },
  { id: "hex_sea_010", q: 0, r: 1, kind: "sea", regionId: "central_sea" },
  { id: "hex_sea_011", q: 1, r: 1, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_012", q: -2, r: 3, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_013", q: -1, r: 2, kind: "sea", regionId: "central_sea" },
  { id: "hex_sea_014", q: 0, r: 2, kind: "sea", regionId: "central_sea" },
  { id: "hex_sea_015", q: 1, r: 2, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_016", q: -2, r: 4, kind: "sea", regionId: "eastern_open_sea" },
  { id: "hex_sea_017", q: -1, r: 4, kind: "sea", regionId: "eastern_open_sea" },
  { id: "hex_sea_018", q: 0, r: 3, kind: "sea", regionId: "eastern_open_sea" },
  { id: "hex_sea_019", q: 1, r: 3, kind: "sea", regionId: "eastern_open_sea" },
  { id: "hex_sea_020", q: -3, r: 1, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_021", q: -3, r: 2, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_022", q: -3, r: 3, kind: "sea", regionId: "eastern_open_sea" },
  { id: "hex_sea_023", q: -2, r: -1, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_024", q: 2, r: -1, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_025", q: 2, r: 0, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_026", q: 2, r: 1, kind: "sea", regionId: "western_open_sea" },
  { id: "hex_sea_027", q: 2, r: 2, kind: "sea", regionId: "eastern_open_sea" }
];

export const seaConditionWeights: Record<string, Record<SeaCondition, number>> = {
  kingdom_coast: { calm: 50, followingWind: 30, headwind: 20 },
  western_open_sea: { calm: 30, followingWind: 40, headwind: 30 },
  central_sea: { calm: 35, followingWind: 35, headwind: 30 },
  eastern_open_sea: { calm: 20, followingWind: 40, headwind: 40 }
};

export function getHexById(id: string): MapHex {
  const hex = hexMap.find((item) => item.id === id);
  if (!hex) throw new Error(`Unknown hex: ${id}`);
  return hex;
}

export function getPortHexId(portId: string): string {
  const hex = hexMap.find((item) => item.kind === "port" && item.portId === portId);
  if (!hex) throw new Error(`Unknown port hex: ${portId}`);
  return hex.id;
}

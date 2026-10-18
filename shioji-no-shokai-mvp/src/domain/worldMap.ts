export type TerrainKind =
  | "deep_ocean"
  | "ocean"
  | "coastal_water"
  | "shallow_water"
  | "land"
  | "coast"
  | "mountain"
  | "forest"
  | "desert";

export type SeaHexKind =
  | "open_sea"
  | "coastal_sea"
  | "shallow_sea"
  | "dangerous_sea"
  | "port";

export interface WorldMapMeta {
  id: string;
  name: string;
  hexRadius: number;
  hexSpacingNm: number;
}

export interface TerrainCell {
  q: number;
  r: number;
  kind: TerrainKind;
}

export interface SeaHex {
  q: number;
  r: number;
  kind: SeaHexKind;
  regionId?: string;
  isNavigable: boolean;
}

export type MapFeature =
  | {
      type: "port";
      portId: string;
      q: number;
      r: number;
      name: string;
    }
  | {
      type: "landmark";
      id: string;
      q: number;
      r: number;
      name: string;
      icon: string;
    }
  | {
      type: "hazard";
      id: string;
      q: number;
      r: number;
      name: string;
      dangerLevel: 1 | 2 | 3;
    };

export interface WorldMap {
  meta: WorldMapMeta;
  terrain: TerrainCell[];
  seaHexes: SeaHex[];
  features: MapFeature[];
}

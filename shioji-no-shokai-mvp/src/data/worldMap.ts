import proposal from "../../../docs/l-coast-map-proposal.json";
import type { WorldMap } from "../domain/worldMap";

export const worldMap: WorldMap = {
  meta: { ...proposal.meta },
  terrain: proposal.terrain.map(({ q, r, kind }) => {
    if (kind !== "land" && kind !== "ocean" && kind !== "coastal_water") {
      throw new Error(`Unsupported terrain kind: ${kind}`);
    }
    return { q, r, kind };
  }),
  seaHexes: proposal.seaHexes.map(({ q, r, kind, isNavigable }) => {
    if (kind !== "open_sea") {
      throw new Error(`Unsupported sea HEX kind: ${kind}`);
    }
    return { q, r, kind, isNavigable };
  }),
  features: proposal.features.map(({ type, portId, q, r, name }) => {
    if (type !== "port") {
      throw new Error(`Unsupported map feature: ${type}`);
    }
    return { type, portId, q, r, name };
  }),
};

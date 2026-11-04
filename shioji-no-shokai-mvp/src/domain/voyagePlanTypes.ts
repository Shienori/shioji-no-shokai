import type { PortId } from "./types";
export interface FixedRouteEndpoints {
  readonly departurePortId: PortId;
  readonly destinationPortId: PortId;
}
export interface VoyagePlanRouteDraft {
  readonly stops: readonly { readonly portId: PortId; readonly refuelTargetPercent: number }[];
  readonly legs: readonly { readonly waypointHexIds: readonly string[] }[];
}
export interface ConfirmedVoyageRouteSection {
  readonly fromPortId: PortId;
  readonly toPortId: PortId;
  readonly waypointHexIds: readonly string[];
  readonly hexIds: readonly string[];
  readonly refuelTargetPercent?: number;
}
export interface ConfirmedVoyageRoute extends FixedRouteEndpoints {
  readonly schemaVersion: 1;
  readonly sections: readonly ConfirmedVoyageRouteSection[];
}
export type VoyagePlanRouteErrorReason = "invalidInput" | "noRoute" | "repeatedHex" | "waypointOrder";
export type VoyagePlanRouteResult =
  | { ok: true; route: ConfirmedVoyageRoute; totalDistanceNm: number }
  | { ok: false; reason: VoyagePlanRouteErrorReason; message: string; sectionIndex?: number };

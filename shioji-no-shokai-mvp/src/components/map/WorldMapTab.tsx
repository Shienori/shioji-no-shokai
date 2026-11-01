import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getRouteById } from "../../data/routes";
import { getRouteHexIds } from "../../domain/routePath";
import { HexMap, MAP_COLORS } from "./HexMap";

interface WorldMapTabProps { ships: Ship[]; voyage: Voyage | null; contract: AcceptedContract | null; }

export function WorldMapTab({ ships, voyage, contract }: WorldMapTabProps) {
  const activeContract = voyage && contract && voyage.contractId === contract.id ? contract : null;
  const route = activeContract ? getRouteById(activeContract.routeId) : null;
  const routeHexIds = route ? getRouteHexIds(route.fromPortId, route.toPortId) ?? [] : [];
  const activeShip = voyage ? ships.find((ship) => ship.id === voyage.shipId) : undefined;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, borderRadius: 12, background: "#EAF3FB", width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>海図</h2>
      <HexMap ships={ships.map((ship) => ({ name: ship.name, hexId: ship.currentHexId }))} routeHexIds={routeHexIds} currentHexId={activeShip?.currentHexId} ariaLabel="L型沿岸と4港の海図" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: MAP_COLORS.text, fontSize: 12 }}>
        {[{ label: "陸地", color: MAP_COLORS.land }, { label: "海域", color: MAP_COLORS.sea }, { label: "港", color: MAP_COLORS.port }].map(({ label, color }) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden="true" style={{ width: 12, height: 12, background: color, border: "1px solid #94A3B8" }} />
            {label}
          </span>
        ))}
        <span>海域1マス：15海里</span>
      </div>
      <p style={{ margin: 0, color: "#475569", fontSize: 12 }}>地図は横にスクロールできます。</p>
    </section>
  );
}

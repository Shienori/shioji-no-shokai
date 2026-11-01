import { worldMap } from "../../data/worldMap";
import { hexMap } from "../../data/hexMap";
import { getPortById } from "../../data/ports";
import type { SeaCondition } from "../../domain/hexMap";

interface ShipMarker { name: string; hexId: string; }
interface HexMapProps {
  ships?: ShipMarker[];
  routeHexIds?: string[];
  currentHexId?: string;
  conditions?: ReadonlyMap<string, SeaCondition>;
  focusHexId?: string;
  ariaLabel?: string;
}
export const MAP_COLORS = {
  land: "#C7D5AC", sea: "#D6EBF2", port: "#EDB65C", border: "#FFFFFF",
  route: "#B78019", current: "#C2410C", text: "#254B5C",
} as const;
const CONDITION_MARKERS: Record<SeaCondition, { color: string; icon: string; label: string }> = {
  calm: { color: "#DBE7EF", icon: "◌", label: "無風" },
  followingWind: { color: "#BBF7D0", icon: "➤", label: "追風" },
  headwind: { color: "#FECACA", icon: "⇦", label: "向かい風" },
};
const HEX_SIZE = 26;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
function getCenter(hex: { q: number; r: number }) {
  return { x: HEX_WIDTH * (hex.q + hex.r / 2), y: -1.5 * HEX_SIZE * hex.r };
}
function getPoints(center: { x: number; y: number }) {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180;
    return [center.x + HEX_SIZE * Math.cos(angle), center.y + HEX_SIZE * Math.sin(angle)].join(",");
  }).join(" ");
}
export function HexMap({ ships = [], routeHexIds = [], currentHexId, conditions, focusHexId, ariaLabel = "海図" }: HexMapProps) {
  const cells = worldMap.terrain.map((cell) => ({ cell, center: getCenter(cell) }));
  if (cells.length === 0) return <p>海図データがありません。</p>;
  const padding = HEX_SIZE + 48;
  const minX = Math.min(...cells.map(({ center }) => center.x)) - padding;
  const maxX = Math.max(...cells.map(({ center }) => center.x)) + padding;
  const minY = Math.min(...cells.map(({ center }) => center.y)) - padding;
  const maxY = Math.max(...cells.map(({ center }) => center.y)) + padding;
  const byId = new Map(hexMap.map((hex) => [hex.id, hex]));
  const portHexes = hexMap.filter((hex) => hex.kind === "port");
  const routeCenters = routeHexIds.flatMap((id) => {
    const hex = byId.get(id);
    return hex ? [getCenter(hex)] : [];
  });
  const currentHex = currentHexId ? byId.get(currentHexId) : undefined;
  const focusHex = focusHexId ? byId.get(focusHexId) : undefined;
  const focusCenter = focusHex ? getCenter(focusHex) : null;
  const viewBox = focusCenter
    ? `${focusCenter.x - 120} ${focusCenter.y - 100} 240 200`
    : `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
  return (
    <div style={{ width: "100%", overflowX: "auto", borderRadius: 12, background: MAP_COLORS.sea }}>
      <svg viewBox={viewBox} role="img" aria-label={ariaLabel} style={{ display: "block", width: "100%", minWidth: focusCenter ? undefined : 600, height: "auto" }}>
        {cells.map(({ cell, center }) => (
          <polygon key={`${cell.q},${cell.r}`} points={getPoints(center)} fill={cell.kind === "land" ? MAP_COLORS.land : MAP_COLORS.sea} stroke={MAP_COLORS.border} strokeWidth={1} />
        ))}
        {portHexes.map((hex) => (
          <polygon key={hex.id} points={getPoints(getCenter(hex))} fill={MAP_COLORS.port} stroke={MAP_COLORS.border} strokeWidth={1} />
        ))}
        {routeCenters.length > 1 && (
          <polyline points={routeCenters.map((center) => `${center.x},${center.y}`).join(" ")} fill="none" stroke={MAP_COLORS.route} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
        )}
        {currentHex && <polygon points={getPoints(getCenter(currentHex))} fill="none" stroke={MAP_COLORS.current} strokeWidth={3} />}
        {Array.from(conditions?.entries() ?? []).map(([id, condition]) => {
          const hex = byId.get(id);
          if (!hex || hex.kind !== "sea") return null;
          const center = getCenter(hex);
          const marker = CONDITION_MARKERS[condition];
          return <g key={id}>
            <title>{marker.label}</title>
            <circle cx={center.x} cy={center.y} r={10} fill={marker.color} stroke="#64748B" strokeWidth={0.8} />
            <text x={center.x} y={center.y + 4} textAnchor="middle" fontSize={13} fill={MAP_COLORS.text}>{marker.icon}</text>
          </g>;
        })}
        {portHexes.map((hex) => {
          const center = getCenter(hex);
          const name = getPortById(hex.portId!).name;
          return <text key={`label-${hex.id}`} x={center.x} y={center.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={MAP_COLORS.text} stroke="#FFF2D4" strokeWidth={3} paintOrder="stroke">{name}</text>;
        })}
        {hexMap.map((hex) => {
          const markers = ships.filter((ship) => ship.hexId === hex.id);
          if (markers.length === 0) return null;
          const center = getCenter(hex);
          return <g key={`ships-${hex.id}`}>
            {markers.map((ship, index) => <text key={`${ship.name}-${index}`} x={center.x} y={center.y + 23 + index * 14} textAnchor="middle" fontSize={11} fontWeight={700} fill={MAP_COLORS.text} stroke="#FFFFFF" strokeWidth={3} paintOrder="stroke">⛵ {ship.name}</text>)}
          </g>;
        })}
      </svg>
    </div>
  );
}

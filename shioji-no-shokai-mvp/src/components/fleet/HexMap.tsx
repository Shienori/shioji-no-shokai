import type { MapHex } from "../../domain/hexMap";
import { hexMap } from "../../data/hexMap";
import { getPortById } from "../../data/ports";

interface ShipMarker {
  name: string;
  hexId: string;
}

interface HexMapProps {
  ships: ShipMarker[];
  routeHexIds?: string[];
  currentHexId?: string;
  markerProgress?: number;
}

const HEX_SIZE = 26;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

function getHexCenter(hex: MapHex) {
  const x = HEX_WIDTH * (hex.q + hex.r / 2);
  const y = (HEX_HEIGHT * 3 / 4) * hex.r;
  return { x, y };
}

function getHexPoints(center: { x: number; y: number }) {
  const points: string[] = [];

  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI / 180 * (60 * i - 30);
    const x = center.x + HEX_SIZE * Math.cos(angle);
    const y = center.y + HEX_SIZE * Math.sin(angle);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }

  return points.join(" ");
}

function getSeaLabel(hexId: string) {
  const match = hexId.match(/(\d+)$/);
  return match ? `S${match[1].padStart(2, "0")}` : hexId;
}

function getInterpolatedMarkerPosition(
  routeHexIds: string[],
  currentHexId: string,
  markerProgress: number
) {
  if (routeHexIds.length < 2) return null;

  const currentIndex = routeHexIds.indexOf(currentHexId);
  if (currentIndex < 0) return null;

  const routeProgress = markerProgress * (routeHexIds.length - 1);
  const fromIndex = Math.min(currentIndex, Math.floor(routeProgress));
  const toIndex = Math.min(routeHexIds.length - 1, fromIndex + 1);
  const ratio = Math.min(1, Math.max(0, routeProgress - fromIndex));

  const fromHex = hexMap.find((hex) => hex.id === routeHexIds[fromIndex]);
  const toHex = hexMap.find((hex) => hex.id === routeHexIds[toIndex]);

  if (!fromHex || !toHex) return null;

  const from = getHexCenter(fromHex);
  const to = getHexCenter(toHex);

  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio
  };
}

export function HexMap({ ships, routeHexIds = [], currentHexId, markerProgress }: HexMapProps) {
  const padding = HEX_SIZE + 18;
  const centers = hexMap.map((hex) => ({ hex, center: getHexCenter(hex) }));
  const minX = Math.min(...centers.map(({ center }) => center.x)) - padding;
  const maxX = Math.max(...centers.map(({ center }) => center.x)) + padding;
  const minY = Math.min(...centers.map(({ center }) => center.y)) - padding;
  const maxY = Math.max(...centers.map(({ center }) => center.y)) + padding;
  const width = maxX - minX;
  const height = maxY - minY;
  const shipByHexId = new Map(ships.map((ship) => [ship.hexId, ship]));
  const routeCenters = routeHexIds
    .map((hexId) => hexMap.find((hex) => hex.id === hexId))
    .filter((hex): hex is MapHex => Boolean(hex))
    .map(getHexCenter);

  const activeShip = currentHexId ? shipByHexId.get(currentHexId) : undefined;
  const interpolatedPosition = activeShip && markerProgress !== undefined
    ? getInterpolatedMarkerPosition(routeHexIds, currentHexId, markerProgress)
    : null;

  return (
    <div className="hex-map">
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        role="img"
        aria-label="簡略HEX航路マップ"
      >
        {routeCenters.length > 1 && (
          <polyline
            points={routeCenters.map((center) => `${center.x},${center.y}`).join(" ")}
            fill="none"
            stroke="#c98b12"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.8}
          />
        )}

        {centers.map(({ hex, center }) => {
          const isPort = hex.kind === "port";
          const isCurrent = hex.id === currentHexId;
          const ship = shipByHexId.get(hex.id);
          const showHexMarker = Boolean(ship) && !interpolatedPosition;
          const fill = isCurrent ? "#fb923c" : isPort ? "#8fd3ff" : "#dff1ff";
          const stroke = isCurrent ? "#c2410c" : isPort ? "#1f7fb8" : "#9db8c7";

          return (
            <g key={hex.id}>
              <polygon
                points={getHexPoints(center)}
                fill={fill}
                stroke={stroke}
                strokeWidth={isCurrent ? 3 : isPort ? 2 : 1}
              />
              <text
                x={center.x}
                y={center.y - (showHexMarker ? 7 : 2)}
                textAnchor="middle"
                fontSize={isPort ? 10 : 8}
                fontWeight={isPort ? 700 : 400}
                fill="#254b5c"
              >
                {isPort ? getPortById(hex.portId!).name : getSeaLabel(hex.id)}
              </text>
              {showHexMarker && ship && (
                <text
                  x={center.x}
                  y={center.y + 11}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="#b3402a"
                >
                  ⛵{ship.name}
                </text>
              )}
            </g>
          );
        })}

        {interpolatedPosition && activeShip && (
          <text
            x={interpolatedPosition.x}
            y={interpolatedPosition.y + 11}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill="#b3402a"
          >
            ⛵{activeShip.name}
          </text>
        )}
      </svg>
    </div>
  );
}

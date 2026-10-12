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

export function HexMap({ ships, routeHexIds = [] }: HexMapProps) {
  const padding = HEX_SIZE + 18;
  const centers = hexMap.map((hex) => ({ hex, center: getHexCenter(hex) }));
  const minX = Math.min(...centers.map(({ center }) => center.x)) - padding;
  const maxX = Math.max(...centers.map(({ center }) => center.x)) + padding;
  const minY = Math.min(...centers.map(({ center }) => center.y)) - padding;
  const maxY = Math.max(...centers.map(({ center }) => center.y)) + padding;
  const width = maxX - minX;
  const height = maxY - minY;
  const routeSet = new Set(routeHexIds);
  const shipByHexId = new Map(ships.map((ship) => [ship.hexId, ship]));

  return (
    <div className="hex-map">
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        role="img"
        aria-label="簡略HEX航路マップ"
      >
        {centers.map(({ hex, center }) => {
          const isPort = hex.kind === "port";
          const isRoute = routeSet.has(hex.id);
          const ship = shipByHexId.get(hex.id);
          const fill = isPort ? "#8fd3ff" : isRoute ? "#ffe9a8" : "#dff1ff";
          const stroke = isPort ? "#1f7fb8" : isRoute ? "#c98b12" : "#9db8c7";

          return (
            <g key={hex.id}>
              <polygon
                points={getHexPoints(center)}
                fill={fill}
                stroke={stroke}
                strokeWidth={isPort || isRoute ? 2 : 1}
              />
              <text
                x={center.x}
                y={center.y - (ship ? 7 : 2)}
                textAnchor="middle"
                fontSize={isPort ? 10 : 8}
                fontWeight={isPort ? 700 : 400}
                fill="#254b5c"
              >
                {isPort ? getPortById(hex.portId!).name : getSeaLabel(hex.id)}
              </text>
              {ship && (
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
      </svg>
    </div>
  );
}

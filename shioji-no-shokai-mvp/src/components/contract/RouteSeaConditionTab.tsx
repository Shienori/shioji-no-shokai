import { useMemo, useState } from "react";
import type { Ship } from "../../domain/types";
import { hexMap, getHexById } from "../../data/hexMap";
import type { MapHex, SeaCondition } from "../../domain/hexMap";
import { getRouteHexIds } from "../../domain/routePath";
import {
  SEA_CONDITION_SLOT_MS,
  calculateHexTransitHours,
  calculateEstimatedArrivalAt,
  getPredictedShipPosition,
  getSeaConditionForecastAt,
  getVoyageTimeRange,
} from "../../domain/seaCondition";
import { formatDateTime } from "../../domain/time";

interface RouteSeaConditionTabProps {
  routeId: string;
  fromPortId: string;
  toPortId: string;
  selectedShip: Ship | null;
}

const HEX_SIZE = 22;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

const CONDITION_COLORS: Record<SeaCondition, string> = {
  calm: "#dbe7ef",
  followingWind: "#bbf7d0",
  headwind: "#fecaca",
};

const CONDITION_LABELS: Record<SeaCondition, string> = {
  calm: "無風",
  followingWind: "追風",
  headwind: "向かい風",
};

const CONDITION_ICONS: Record<SeaCondition, string> = {
  calm: "◌",
  followingWind: "➤",
  headwind: "⇦",
};

function getHexCenter(hex: MapHex) {
  return {
    x: HEX_WIDTH * (hex.q + hex.r / 2),
    y: (HEX_HEIGHT * 3 / 4) * hex.r,
  };
}

function getHexPoints(center: { x: number; y: number }) {
  const points: string[] = [];

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index - 30);
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

export function RouteSeaConditionTab({
  routeId,
  fromPortId,
  toPortId,
  selectedShip,
}: RouteSeaConditionTabProps) {
  const departureAt = Date.now();
  const [selectedAt, setSelectedAt] = useState(departureAt);

  const routeHexIds = useMemo(() => {
    return getRouteHexIds(fromPortId, toPortId) ?? [];
  }, [fromPortId, toPortId]);

  const seaHexIds = useMemo(() => {
    return routeHexIds.filter((hexId) => {
      return getHexById(hexId).kind === "sea";
    });
  }, [routeHexIds]);

  const estimatedArrivalAt = useMemo(() => {
    if (!selectedShip) return null;

    return calculateEstimatedArrivalAt(
      seaHexIds,
      departureAt,
      selectedShip.cruisingSpeedKnots,
    );
  }, [seaHexIds, departureAt, selectedShip]);

  const timeRange = getVoyageTimeRange(departureAt, estimatedArrivalAt);
  const clippedSelectedAt = Math.min(
    Math.max(selectedAt, timeRange.min),
    timeRange.max,
  );

  const overlayConditions = useMemo(() => {
    if (selectedShip) {
      const conditions = new Map<string, SeaCondition>();
      let accumulatedHours = 0;

      for (const hexId of seaHexIds) {
        const arrivalAt =
          departureAt + accumulatedHours * 60 * 60 * 1000;

        const condition = getSeaConditionForecastAt(
          hexId,
          arrivalAt,
        );

        conditions.set(hexId, condition);

        accumulatedHours += calculateHexTransitHours(
          selectedShip.cruisingSpeedKnots,
          condition,
        );
      }

      return conditions;
    }

    return new Map(
      seaHexIds.map((hexId) => [
        hexId,
        getSeaConditionForecastAt(hexId, selectedAt),
      ]),
    );
  }, [seaHexIds, departureAt, selectedAt, selectedShip]);

  const predictedPosition = useMemo(() => {
    if (!selectedShip) return null;

    return getPredictedShipPosition(
      routeHexIds,
      departureAt,
      clippedSelectedAt,
      selectedShip.cruisingSpeedKnots,
    );
  }, [routeHexIds, departureAt, clippedSelectedAt, selectedShip]);

  const centers = hexMap.map((hex) => ({
    hex,
    center: getHexCenter(hex),
  }));

  const padding = HEX_SIZE + 14;
  const minX = Math.min(...centers.map(({ center }) => center.x)) - padding;
  const maxX = Math.max(...centers.map(({ center }) => center.x)) + padding;
  const minY = Math.min(...centers.map(({ center }) => center.y)) - padding;
  const maxY = Math.max(...centers.map(({ center }) => center.y)) + padding;

  const routeCenters = routeHexIds
    .map((hexId) => hexMap.find((hex) => hex.id === hexId))
    .filter((hex): hex is MapHex => Boolean(hex))
    .map(getHexCenter);

  const currentCondition = predictedPosition
    ? overlayConditions.get(predictedPosition.hexId)
    : undefined;

  return (
    <div className="card detail-card route-sea-condition-tab">
      <div className="route-sea-header">
        <span>予報発行：{formatDateTime(
          getForecastIssueTimeSafe(departureAt),
        )}</span>
        <span>表示時刻：{formatDateTime(clippedSelectedAt)}</span>
      </div>

      <div className="hex-map route-sea-map">
        <svg
          viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
          role="img"
          aria-label="海況予報HEXマップ"
        >
          {routeCenters.length > 1 && (
            <polyline
              points={routeCenters
                .map((center) => `${center.x},${center.y}`)
                .join(" ")}
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
            const condition = overlayConditions.get(hex.id);
            const isShipHex =
              predictedPosition?.hexId === hex.id;

            const fill = isPort
              ? "#8fd3ff"
              : condition
                ? CONDITION_COLORS[condition]
                : "#dff1ff";

            const stroke = isShipHex
              ? "#c2410c"
              : isPort
                ? "#1f7fb8"
                : "#9db8c7";

            return (
              <g key={hex.id}>
                <polygon
                  points={getHexPoints(center)}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={isShipHex ? 3 : isPort ? 2 : 1}
                />
                <text
                  x={center.x}
                  y={center.y - 2}
                  textAnchor="middle"
                  fontSize={isPort ? 9 : 8}
                  fontWeight={isPort ? 700 : 400}
                  fill="#254b5c"
                >
                  {isPort
                    ? hex.portId
                    : getSeaLabel(hex.id)}
                </text>
                {condition && (
                  <text
                    x={center.x}
                    y={center.y + 10}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#254b5c"
                  >
                    {CONDITION_ICONS[condition]}
                  </text>
                )}
                {isShipHex && (
                  <text
                    x={center.x}
                    y={center.y + 22}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="#c2410c"
                  >
                    ⛵
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="route-sea-legend">
        <span><span className="legend-swatch calm" /> 無風</span>
        <span><span className="legend-swatch followingWind" /> 追風</span>
        <span><span className="legend-swatch headwind" /> 向かい風</span>
      </div>

      <input
        className="route-sea-slider"
        type="range"
        min={timeRange.min}
        max={timeRange.max}
        step={SEA_CONDITION_SLOT_MS}
        value={clippedSelectedAt}
        onChange={(event) => {
          setSelectedAt(Number(event.target.value));
        }}
      />

      <div className="route-sea-time-labels">
        <span>出発 {formatDateTime(departureAt)}</span>
        <span>
          {estimatedArrivalAt
            ? `到着 ${formatDateTime(estimatedArrivalAt)}`
            : "7日後"}
        </span>
      </div>

      {selectedShip ? (
        <div className="route-sea-status">
          <div className="kv">
            <span>使用船</span>
            <span>{selectedShip.name}</span>
          </div>
          <div className="kv">
            <span>ETA</span>
            <span>
              {estimatedArrivalAt
                ? formatDateTime(estimatedArrivalAt)
                : "—"}
            </span>
          </div>
          <div className="kv">
            <span>予定船位</span>
            <span>
              {predictedPosition
                ? `${getSeaLabel(predictedPosition.hexId)}${
                    predictedPosition.hasArrived
                      ? "（到着済み）"
                      : `（進捗 ${Math.round(
                          predictedPosition.progress * 100,
                        )}%）`
                  }`
                : "—"}
            </span>
          </div>
          <div className="kv">
            <span>現在位置の海況</span>
            <span>
              {currentCondition
                ? CONDITION_LABELS[currentCondition]
                : "—"}
            </span>
          </div>
        </div>
      ) : (
        <p className="route-sea-hint">
          船を選択すると、ETAと予定船位が表示されます。
        </p>
      )}
    </div>
  );
}

function getForecastIssueTimeSafe(timeMs: number): number {
  const issueTime = new Date(timeMs);
  issueTime.setHours(6, 0, 0, 0);

  if (timeMs < issueTime.getTime()) {
    issueTime.setDate(issueTime.getDate() - 1);
  }

  return issueTime.getTime();
}

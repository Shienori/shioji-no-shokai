import "../../styles/shipDetail.css";
import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { getHexById } from "../../data/hexMap";
import { ceilTo5Minutes, formatDateTime } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import { getRouteHexIds } from "../../domain/routePath";
import { getSeaConditionAt, getSeaConditionForecastAt, SEA_CONDITION_SLOT_MS } from "../../domain/seaCondition";
import { HexMap } from "./HexMap";

interface ShipDetailScreenProps {
  ship: Ship;
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  operationTime: number;
  onBack: () => void;
}

const CONDITION_LABELS = {
  calm: "無風",
  followingWind: "追風",
  headwind: "向かい風",
} as const;

const STATUS_LABELS = {
  docked: "停泊中",
  loading: "積込中",
  sailing: "航海中",
  unloading: "揚荷中",
} as const;

function getSeaLabel(hexId: string) {
  const match = hexId.match(/(\d+)$/);
  return match ? `S${match[1].padStart(2, "0")}` : hexId;
}

export function ShipDetailScreen({ ship, voyage, contract, operationTime, onBack }: ShipDetailScreenProps) {
  const route = contract ? getRouteById(contract.routeId) : null;
  const cargo = contract ? getCargoById(contract.cargoId) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const routeHexIds = route ? getRouteHexIds(route.fromPortId, route.toPortId) ?? [] : [];
  const progress = voyage && contract
    ? calculateVoyageProgress(voyage, contract, operationTime)
    : 0;

  const currentHexData = getHexById(ship.currentHexId);
  const currentLocation = currentHexData.kind === "port"
    ? getPortById(currentHexData.portId!).name
    : `海域 ${getSeaLabel(currentHexData.id)}`;
  const currentCondition = voyage?.phase === "sailing" && currentHexData.kind === "sea"
    ? getSeaConditionAt(ship.currentHexId, Date.now())
    : null;

  const now = Date.now();
  const nextSlot = Math.ceil(now / SEA_CONDITION_SLOT_MS) * SEA_CONDITION_SLOT_MS;
  const forecast = Array.from({ length: 6 }, (_, index) => {
    const time = nextSlot + index * SEA_CONDITION_SLOT_MS;
    return {
      time,
      condition: getSeaConditionForecastAt(ship.currentHexId, time)
    };
  });

  const remainingOperationMs = voyage ? Math.max(0, voyage.estimatedArrivalAt - operationTime) : 0;
  const remainingMs = remainingOperationMs / 6;
  const etaLabel = voyage?.phase === "sailing"
    ? formatDateTime(ceilTo5Minutes(Date.now() + remainingMs))
    : "-";
  const deadlineLabel = contract ? formatDateTime(contract.deadlineAt) : "-";

  return (
    <div className="ship-detail-screen">
      <header className="ship-detail-header">
        <div>
          <h2>{ship.name}</h2>
          <p className="contract-board-subtitle">{STATUS_LABELS[ship.status]}</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={onBack}>戻る</button>
      </header>

      <div className="ship-photo" aria-hidden="true">⛵</div>

      <section className="contract-card fleet-card">
        <h3>現在状況</h3>
        <div className="contract-card-route"><span>現在位置</span><span className="contract-route-arrow">→</span><span>{currentLocation}</span></div>
        <div className="contract-card-route"><span>海況</span><span className="contract-route-arrow">→</span><span>{currentCondition ? CONDITION_LABELS[currentCondition] : "-"}</span></div>
        <div className="progress-block">
          <div className="progress-heading"><span>進捗状況</span><span>{Math.round(progress * 100)}%</span></div>
          <div className="progress"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
        </div>
        <div className="contract-facts">
          <div><span className="contract-fact-label">受注依頼</span><span className="contract-fact-value">{contract && cargo && fromPort && toPort ? `${cargo.name} ×${contract.quantity}／${fromPort.name}→${toPort.name}` : "なし"}</span></div>
          <div><span className="contract-fact-label">ETA</span><span className="contract-fact-value">{etaLabel}</span></div>
          <div><span className="contract-fact-label">期限</span><span className="contract-fact-value">{deadlineLabel}</span></div>
        </div>
      </section>

      <section className="contract-card fleet-card map-card">
        <h3>航路マップ</h3>
        <HexMap
          ships={[{ name: ship.name, hexId: ship.currentHexId }]}
          routeHexIds={routeHexIds}
          currentHexId={ship.currentHexId}
        />
      </section>

      <section className="contract-card fleet-card">
        <h3>気象予報</h3>
        <p className="contract-board-subtitle">現在海域の今後12時間</p>
        <div className="contract-list">
          {forecast.map((item) => (
            <div key={item.time} className="contract-card fleet-card">
              <div className="contract-card-heading">
                <h4>{formatDateTime(item.time)}</h4>
                <span className="contract-card-detail">{CONDITION_LABELS[item.condition]}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="contract-card fleet-card">
        <h3>船のスペック</h3>
        <div className="contract-facts">
          <div><span className="contract-fact-label">船種</span><span className="contract-fact-value">{ship.kind === "sailing" ? "帆船" : "機帆船"}</span></div>
          <div><span className="contract-fact-label">用途</span><span className="contract-fact-value">一般貨物船</span></div>
          <div><span className="contract-fact-label">積載スペース</span><span className="contract-fact-value">{ship.maxCargoVolume}</span></div>
          <div><span className="contract-fact-label">最大積載量</span><span className="contract-fact-value">{ship.maxCargoWeight}</span></div>
          <div><span className="contract-fact-label">巡航速度</span><span className="contract-fact-value">{ship.cruisingSpeedKnots}ノット</span></div>
          <div><span className="contract-fact-label">最大速度</span><span className="contract-fact-value">{ship.maxSpeedKnots}ノット</span></div>
          <div><span className="contract-fact-label">機関</span><span className="contract-fact-value">{ship.engineType}／{ship.engineOutput}</span></div>
        </div>
      </section>
    </div>
  );
}

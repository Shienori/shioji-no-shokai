import { useEffect, useMemo, useState } from "react";
import type { ContractTemplate, Ship } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { getHexById } from "../../data/hexMap";
import { getContractCargoRequirements, getContractSchedule } from "../../domain/contractOffer";
import { calculateExpense } from "../../domain/reward";
import { ceilTo5Minutes, formatDateTime } from "../../domain/time";
import { getRouteHexIds } from "../../domain/routePath";
import {
  calculateEstimatedArrivalAt,
  createRouteSeaForecast,
  getSeaConditionForecastAt,
} from "../../domain/seaCondition";
import { CapacityGauge } from "./CapacityGauge";
import { RouteSeaConditionTab } from "./RouteSeaConditionTab";

interface ContractDetailScreenProps {
  contract: ContractTemplate | null;
  ships: Ship[];
  eligibleShips: Ship[];
  acceptReason: string | null;
  offeredDeadlineAt: number | null;
  onAccept: (shipId: string) => void;
  onClose: () => void;
}

const CONDITION_LABELS = {
  calm: "無風",
  followingWind: "追風",
  headwind: "向かい風",
} as const;

export function ContractDetailScreen({
  contract,
  ships,
  eligibleShips,
  acceptReason,
  offeredDeadlineAt,
  onAccept,
  onClose
}: ContractDetailScreenProps) {
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedShipId(null);
  }, [contract?.id]);

  const route = contract ? getRouteById(contract.routeId) : null;
  const seaHexIds = useMemo(() => {
    if (!route) return [];
    const routeHexIds = getRouteHexIds(route.fromPortId, route.toPortId) ?? [];
    return routeHexIds.filter((hexId) => getHexById(hexId).kind === "sea");
  }, [route]);

  const seaForecast = useMemo(() => {
    if (!contract || seaHexIds.length === 0) return null;
    return createRouteSeaForecast(contract.routeId, seaHexIds, Date.now());
  }, [contract, seaHexIds]);

  const forecastEta = useMemo(() => {
    const selectedShip = ships.find((ship) => ship.id === selectedShipId) ?? null;
    if (!selectedShip || seaHexIds.length === 0) return null;
    return calculateEstimatedArrivalAt(
      seaHexIds,
      Date.now(),
      selectedShip.cruisingSpeedKnots,
    );
  }, [seaHexIds, selectedShipId, ships]);

  if (!contract || !route) return null;

  const cargo = getCargoById(contract.cargoId);
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const expense = calculateExpense(contract.offeredReward);
  const netProfit = contract.offeredReward - expense;
  const fallbackSchedule = getContractSchedule(contract, route, Date.now());
  const deadlineAt = offeredDeadlineAt ?? fallbackSchedule.deadlineAt;
  const deadlineLabel = formatDateTime(deadlineAt);
  const { requiredCargoVolume, requiredCargoWeight } = getContractCargoRequirements(contract, cargo);
  const selectedShip = ships.find((ship) => ship.id === selectedShipId) ?? null;
  const canAccept = eligibleShips.length > 0;

  return (
    <div className="contract-detail-screen">
      <header className="detail-header">
        <button className="back-btn" onClick={onClose}>← 戻る</button>
        <h2>{cargo.name}の輸送依頼</h2>
      </header>

      <div className="detail-body">
        <section className="detail-tab-panel">
          <div className="card detail-card">
            <h3>依頼</h3>
            <div className="kv"><span>貨物</span><span>{cargo.name} ×{contract.quantity}</span></div>
            <div className="kv"><span>航路</span><span>{fromPort.name} → {toPort.name}</span></div>
            <div className="kv"><span>距離</span><span>{route.distance}海里</span></div>
            <div className="requirement-grid">
              <div className="requirement-item">
                <span className="requirement-label">必要スペース</span>
                <span className="requirement-value">{requiredCargoVolume}</span>
              </div>
              <div className="requirement-item">
                <span className="requirement-label">必要積載量</span>
                <span className="requirement-value">{requiredCargoWeight}</span>
              </div>
            </div>
            <div className="kv"><span>到着期限</span><span>{deadlineLabel}</span></div>

            <div className="reward-row">
              <div className="reward-item"><div className="label">提示報酬</div><div className="value">{contract.offeredReward}G</div></div>
              <div className="reward-item net"><div className="label">見込純利益</div><div className="value">{netProfit}G</div></div>
            </div>
            <div className="kv"><span>経費</span><span>-{expense}G</span></div>
          </div>
        </section>

        <section className="detail-tab-panel">
          <div className="card detail-card ship-select-card">
            <h3>船</h3>
            <div className="ship-select-list">
              {ships.map((ship) => {
                const isEligible = eligibleShips.some((item) => item.id === ship.id);
                const isSelected = selectedShipId === ship.id;

                return (
                  <button
                    key={ship.id}
                    type="button"
                    className={`ship-select-item${isEligible ? " eligible" : ""}${isSelected ? " selected" : ""}`}
                    disabled={!isEligible}
                    onClick={() => setSelectedShipId(ship.id)}
                  >
                    <span className="ship-select-name">{ship.name}</span>
                    <CapacityGauge
                      requiredLabel="必要スペース"
                      maximumLabel="最大スペース"
                      required={requiredCargoVolume}
                      maximum={ship.maxCargoVolume}
                    />
                    <CapacityGauge
                      requiredLabel="必要積載量"
                      maximumLabel="最大積載量"
                      required={requiredCargoWeight}
                      maximum={ship.maxCargoWeight}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="detail-tab-panel chart-tab-panel">
          <div className="chart-fullscreen">
            <RouteSeaConditionTab
              routeId={contract.routeId}
              fromPortId={route.fromPortId}
              toPortId={route.toPortId}
              selectedShip={selectedShip}
            />
          </div>
        </section>
      </div>

      {seaForecast && (
        <section
          style={{
            margin: "0 16px 12px",
            padding: "12px",
            borderRadius: "12px",
            background: "#eaf3fb"
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: "15px" }}>
            現時点の海況予報
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {seaForecast.forecasts.map((forecast) => (
              <span
                key={forecast.hexId}
                style={{
                  padding: "4px 8px",
                  borderRadius: "999px",
                  background: "#ffffff",
                  fontSize: "12px"
                }}
              >
                {forecast.hexId.replace("hex_", "")}: {CONDITION_LABELS[forecast.forecast]}
              </span>
            ))}
          </div>
          {forecastEta && (
            <p style={{ margin: "8px 0 0", fontSize: "13px" }}>
              予報ETA: {formatDateTime(ceilTo5Minutes(forecastEta))}（精度 {Math.round(seaForecast.accuracy * 100)}%）
            </p>
          )}
        </section>
      )}

      <footer className="detail-footer">
        {acceptReason && <p className="accept-reason">{acceptReason}</p>}
        <button
          className={`btn ${canAccept && selectedShipId ? "btn-primary" : "btn-secondary"}`}
          disabled={!canAccept || !selectedShipId}
          onClick={() => {
            if (selectedShipId) {
              onAccept(selectedShipId);
            }
          }}
        >
          {selectedShipId ? "受注する" : "船を選択してください"}
        </button>
        <button className="btn btn-secondary" onClick={onClose}>断る</button>
      </footer>
    </div>
  );
}

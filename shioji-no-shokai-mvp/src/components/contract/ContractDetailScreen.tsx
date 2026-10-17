import { useEffect, useState } from "react";
import type { ContractTemplate, Ship } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { getContractCargoRequirements, getContractSchedule } from "../../domain/contractOffer";
import { calculateExpense } from "../../domain/reward";
import { formatDateTime } from "../../domain/time";
import { CapacityGauge } from "./CapacityGauge";
import { RouteSeaConditionTab } from "./RouteSeaConditionTab";

interface ContractDetailScreenProps {
  contract: ContractTemplate | null;
  ships: Ship[];
  eligibleShips: Ship[];
  acceptReason: string | null;
  onAccept: (shipId: string) => void;
  onClose: () => void;
}

type DetailTab = "request" | "fleet" | "chart" | "placeholder1" | "placeholder2";

const DETAIL_TABS = [
  { id: "request", label: "依頼" },
  { id: "fleet", label: "船団" },
  { id: "chart", label: "海図" },
  { id: "placeholder1", label: "仮タブ1" },
  { id: "placeholder2", label: "仮タブ2" },
] as const;

export function ContractDetailScreen({
  contract,
  ships,
  eligibleShips,
  acceptReason,
  onAccept,
  onClose
}: ContractDetailScreenProps) {
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("request");

  useEffect(() => {
    setSelectedShipId(null);
    setActiveTab("request");
  }, [contract?.id]);

  if (!contract) return null;

  const route = getRouteById(contract.routeId);
  const cargo = getCargoById(contract.cargoId);
  const fromPort = getPortById(route.fromPortId);
  const toPort = getPortById(route.toPortId);
  const expense = calculateExpense(contract.offeredReward);
  const netProfit = contract.offeredReward - expense;
  const { deadlineAt } = getContractSchedule(contract, route, Date.now());
  const deadlineLabel = formatDateTime(deadlineAt);
  const { requiredCargoVolume, requiredCargoWeight } = getContractCargoRequirements(contract, cargo);
  const selectedShip = ships.find((ship) => ship.id === selectedShipId) ?? null;
  const canAccept = eligibleShips.length > 0;

  return (
    <div className="contract-detail-screen">
      <header className="detail-header">
        <button className="back-btn" onClick={onClose}>← 戻る</button>
        <h2>{cargo.name}の輸送依頼</h2>
        <span style={{ fontSize: 10, color: "#9db4c0" }}>detail:v3</span>
      </header>

      <div className="detail-tabs">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`detail-tab${activeTab === tab.id ? " active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="detail-body">
        {activeTab === "request" && (
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
        )}

        {activeTab === "fleet" && (
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
        )}

        {activeTab === "chart" && (
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
        )}

        {(activeTab === "placeholder1" || activeTab === "placeholder2") && (
          <section className="detail-tab-panel">
            <div className="card detail-card">
              <h3>準備中</h3>
              <p className="route">このタブは仮置きです。</p>
            </div>
          </section>
        )}
      </div>

      {activeTab !== "chart" && (
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
      )}
    </div>
  );
}

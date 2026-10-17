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

export function ContractDetailScreen({
  contract,
  ships,
  eligibleShips,
  acceptReason,
  onAccept,
  onClose
}: ContractDetailScreenProps) {
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedShipId(null);
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
      </header>

      <div className="detail-body">
        <section className="card detail-card">
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
        </section>

        <section className="card detail-card ship-select-card">
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
        </section>

        <section>
          <RouteSeaConditionTab
            routeId={contract.routeId}
            fromPortId={route.fromPortId}
            toPortId={route.toPortId}
            selectedShip={selectedShip}
          />
        </section>
      </div>

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

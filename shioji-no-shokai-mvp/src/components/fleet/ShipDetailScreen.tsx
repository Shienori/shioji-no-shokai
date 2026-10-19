import { useState } from "react";
import "../../styles/shipDetail.css";
import type { AcceptedContract, Ship, Voyage, VoyageMemo } from "../../domain/types";
import { getPortById } from "../../data/ports";
import { getRouteById } from "../../data/routes";
import { getCargoById } from "../../data/cargos";
import { getHexById } from "../../data/hexMap";
import { ceilTo1Minute, formatDateTime } from "../../domain/time";
import { calculateVoyageProgress } from "../../domain/voyage";
import { getRouteHexIds } from "../../domain/routePath";
import { getSeaConditionAt } from "../../domain/seaCondition";
import { HexMap } from "./HexMap";

interface ShipDetailScreenProps {
  ship: Ship;
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  operationTime: number;
  voyageMemos: VoyageMemo[];
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

function getEtaDiffLabel(diffMinutes: number | null) {
  if (diffMinutes === null) return "-";
  return `${diffMinutes > 0 ? "+" : ""}${diffMinutes}分`;
}

export function ShipDetailScreen({ ship, voyage, contract, operationTime, voyageMemos, onBack }: ShipDetailScreenProps) {
  const [showVoyageMemo, setShowVoyageMemo] = useState(false);
  const [selectedVoyageNumber, setSelectedVoyageNumber] = useState<number | null>(null);
  const route = contract ? getRouteById(contract.routeId) : null;
  const cargo = contract ? getCargoById(contract.cargoId) : null;
  const fromPort = route ? getPortById(route.fromPortId) : null;
  const toPort = route ? getPortById(route.toPortId) : null;
  const routeHexIds = route ? getRouteHexIds(route.fromPortId, route.toPortId) ?? [] : [];
  const progress = voyage && contract
    ? calculateVoyageProgress(voyage, contract, operationTime)
    : 0;
  const shipMemos = voyageMemos
    .filter((memo) => memo.shipId === ship.id)
    .sort((a, b) => b.voyageNumber - a.voyageNumber);
  const selectedMemo = selectedVoyageNumber === null
    ? null
    : shipMemos.find((memo) => memo.voyageNumber === selectedVoyageNumber) ?? null;

  const currentHexData = getHexById(ship.currentHexId);
  const currentLocation = currentHexData.kind === "port"
    ? getPortById(currentHexData.portId!).name
    : `海域 ${getSeaLabel(currentHexData.id)}`;
  const currentCondition = voyage?.phase === "sailing" && currentHexData.kind === "sea"
    ? getSeaConditionAt(ship.currentHexId, Date.now())
    : null;

  const remainingOperationMs = voyage ? Math.max(0, voyage.estimatedArrivalAt - operationTime) : 0;
  const remainingMs = remainingOperationMs / 6;
  const etaLabel = voyage?.phase === "sailing"
    ? formatDateTime(ceilTo1Minute(Date.now() + remainingMs))
    : "-";
  const deadlineLabel = contract ? formatDateTime(contract.deadlineAt) : "-";

  function getMemoStatus(memo: VoyageMemo) {
    if (memo.settlement) return "精算済み";
    if (voyage?.contractId === memo.contractId && voyage.shipId === memo.shipId) return "航海中";
    return "精算待ち";
  }

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
        <div className="voyage-route-map">
          <HexMap
            ships={[{ name: ship.name, hexId: ship.currentHexId }]}
            routeHexIds={routeHexIds}
            currentHexId={ship.currentHexId}
          />
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

      <button className="btn btn-secondary voyage-memo-btn" type="button" onClick={() => {
        setSelectedVoyageNumber(null);
        setShowVoyageMemo(true);
      }}>
        Voyage Memo
      </button>

      {showVoyageMemo && (
        <div className="modal-backdrop open">
          <div className="modal voyage-memo-modal">
            {selectedMemo ? (
              <>
                <div className="voyage-memo-detail-header">
                  <h2>{selectedMemo.label}</h2>
                  <span className="contract-card-detail">{getMemoStatus(selectedMemo)}</span>
                </div>
                <div className="voyage-memo-list">
                  <div className="kv"><span>航路</span><span>{selectedMemo.routeLabel}</span></div>
                  <div className="kv"><span>積荷</span><span>{selectedMemo.cargoLabel}</span></div>
                  <div className="kv"><span>受注日時</span><span>{formatDateTime(selectedMemo.acceptedAt)}</span></div>
                  <div className="kv"><span>予定ETA</span><span>{formatDateTime(selectedMemo.plannedEtaRealTime)}</span></div>
                  <div className="kv"><span>実到着</span><span>{selectedMemo.actualArrivalRealTime === null ? "-" : formatDateTime(selectedMemo.actualArrivalRealTime)}</span></div>
                  <div className="kv"><span>ETA差分</span><span>{getEtaDiffLabel(selectedMemo.etaDiffMinutes)}</span></div>
                  {selectedMemo.settlement ? (
                    <div className="voyage-memo-settlement">
                      <div className="kv"><span>提示報酬</span><span>{selectedMemo.settlement.offeredReward}G</span></div>
                      <div className="kv"><span>遅延減額</span><span>-{selectedMemo.settlement.latePenalty}G</span></div>
                      <div className="kv"><span>減額後報酬</span><span>{selectedMemo.settlement.receivedReward}G</span></div>
                      <div className="kv"><span>経費</span><span>-{selectedMemo.settlement.expense}G</span></div>
                      <div className="kv"><span>最低利益保証</span><span>+{selectedMemo.settlement.guaranteeAmount}G</span></div>
                      <div className="kv voyage-memo-final"><span>最終受取額</span><span>{selectedMemo.settlement.finalPayout}G</span></div>
                    </div>
                  ) : (
                    <p className="voyage-memo-empty">精算後、収支内訳が記録されます。</p>
                  )}
                </div>
                <div className="confirmation-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => setSelectedVoyageNumber(null)}>一覧へ戻る</button>
                  <button className="btn btn-secondary" type="button" onClick={() => {
                    setSelectedVoyageNumber(null);
                    setShowVoyageMemo(false);
                  }}>閉じる</button>
                </div>
              </>
            ) : (
              <>
                <h2>Voyage Memo</h2>
                {shipMemos.length === 0 ? (
                  <p className="voyage-memo-empty">航海記録はまだありません。</p>
                ) : (
                  <div className="voyage-memo-list">
                    {shipMemos.map((memo) => (
                      <button
                        key={memo.voyageNumber}
                        className="voyage-memo-row"
                        type="button"
                        onClick={() => setSelectedVoyageNumber(memo.voyageNumber)}
                      >
                        <span className="voyage-memo-row-label">{memo.label}</span>
                        <span className="voyage-memo-row-route">{memo.routeLabel}</span>
                        <span className="voyage-memo-row-status">{getMemoStatus(memo)}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="confirmation-actions">
                  <button className="btn btn-secondary" type="button" onClick={() => setShowVoyageMemo(false)}>閉じる</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

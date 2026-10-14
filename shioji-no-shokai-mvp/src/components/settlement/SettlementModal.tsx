import type { SettlementResult } from "../../domain/settlement";

interface SettlementModalProps {
  result: SettlementResult | null;
  onConfirm: () => void;
}

export function SettlementModal({ result, onConfirm }: SettlementModalProps) {
  if (!result) return null;

  return (
    <div className="modal-backdrop open">
      <div className="modal">
        <h2>契約完了</h2>
        <div className="kv"><span>提示報酬</span><span>{result.offeredReward}G</span></div>
        <div className="kv"><span>到着遅延</span><span>{result.lateHours > 0 ? `${result.lateHours}時間` : "なし"}</span></div>
        <div className="kv"><span>経費</span><span>-{result.expense}G</span></div>
        <div className="kv"><span>最終受取額</span><span style={{ color: "var(--green)", fontWeight: 700 }}>{result.finalPayout}G</span></div>
        <div className="kv"><span>荷主別評判</span><span>{result.reputationChange > 0 ? "+" : ""}{result.reputationChange}</span></div>
        <button className="btn btn-primary" onClick={onConfirm}>OK</button>
      </div>
    </div>
  );
}

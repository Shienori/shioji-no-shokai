import { useState } from "react";

export default function ContractBoard({ onStart }: { onStart: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [used, setUsed] = useState(false);
  const remainingCount = used ? 0 : 1;

  return (
    <div className="screen">
      <h2>依頼板</h2>

      <div className="panel contract-card">
        <p>契約カード</p>
        <button className="button-primary" onClick={onStart}>
          出航
        </button>
      </div>

      {used ? (
        <button className="refresh-used" disabled>
          使用済み
        </button>
      ) : (
        <button
          className="refresh-available"
          onClick={() => setShowConfirm(true)}
        >
          依頼を更新（残り{remainingCount}回）
        </button>
      )}

      {showConfirm && (
        <div className="modal-backdrop">
          <div className="modal">
            <p>依頼を更新しますか？</p>
            <button
              className="button-primary"
              onClick={() => {
                setUsed(true);
                setShowConfirm(false);
              }}
            >
              更新する
            </button>
            <button
              className="button-secondary"
              onClick={() => setShowConfirm(false)}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

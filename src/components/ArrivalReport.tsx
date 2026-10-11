import { useState } from "react";

export default function ArrivalReport({ onBack }: { onBack: () => void }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="screen">
      <h2>契約完了</h2>

      <div className="panel">
        <p>受取額</p>
        <p className="amount">48G</p>

        <div className="reward-row">
          <span>報酬</span>
          <span>60G</span>
          <button onClick={() => setShowDetail(!showDetail)}>明細</button>
        </div>

        {showDetail && (
          <div className="reward-detail">
            <p>貨物価値：40G</p>
            <p>航海距離手当：15G</p>
            <p>その他調整：5G</p>
          </div>
        )}

        <p>期限超過：-0G</p>
        <p>航海経費：-12G</p>

        <p className="rep-up">評判：+0.25</p>

        <button onClick={onBack}>依頼板へ戻る</button>
      </div>
    </div>
  );
}

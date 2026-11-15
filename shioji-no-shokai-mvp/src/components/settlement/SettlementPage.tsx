import { useState } from "react";
import type { SettlementPageProps } from "./SettlementPageTypes";
import "./settlementPage.css";

export function SettlementPage({
  voyageLabel,
  contractLabel,
  shipName,
  rewardAmount,
  details,
  status,
  returnTo,
  onSettle,
  onBack,
}: SettlementPageProps) {
  const [isSettling, setIsSettling] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const isSettled = status === "settled";
  const hasFuel =
    details.fuelConsumedTons !== null &&
    details.fuelRemainingTons !== null;

  const handleSettle = () => {
    if (isSettling || isSettled) return;

    setIsSettling(true);
    onSettle();
    setIsSettling(false);
  };

  const returnLabel =
    returnTo === "contracts"
      ? "依頼へ戻る"
      : "船団へ戻る";

  return (
    <div className="settlement-page">
      <header className="settlement-header">
        <p className="settlement-report-label">
          航海報告 / {voyageLabel}
        </p>

        <h1 className="settlement-title">
          航海の精算
        </h1>
      </header>

      {isSettled ? (
        <section className="settlement-completed-card">
          <h2>精算が完了しました</h2>

          <p>
            この航海の結果は、航海日誌に記録されました。
          </p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onBack}
          >
            {returnLabel}
          </button>
        </section>
      ) : (
        <>
          <section className="settlement-status-card">
            <span className="settlement-status-badge">
              精算可能
            </span>

            <h2 className="settlement-contract-label">
              {contractLabel}
            </h2>

            <p className="settlement-ship-label">
              {shipName} ・ 荷卸し完了
            </p>

            <div className="settlement-reward">
              <span className="settlement-reward-label">
                報酬金額
              </span>

              <span className="settlement-reward-value">
                {rewardAmount.toLocaleString("ja-JP")} G
              </span>
            </div>
          </section>

          <section className="settlement-notice-card">
            <p>
              この航海の結果は、精算後に航海日誌へ記録されます。
            </p>

            <button
              type="button"
              className="btn btn-secondary settlement-detail-toggle"
              onClick={() => setIsDetailOpen(!isDetailOpen)}
            >
              {isDetailOpen ? "詳細を閉じる" : "航海の詳細を見る"}
            </button>
          </section>

          {isDetailOpen && (
            <section className="settlement-detail-card">
              <h3>航海の詳細</h3>

              <dl className="settlement-detail-list">
                <div>
                  <dt>航路</dt>
                  <dd>{details.routeLabel}</dd>
                </div>

                <div>
                  <dt>積荷</dt>
                  <dd>{details.cargoLabel}</dd>
                </div>

                <div>
                  <dt>到着状況</dt>
                  <dd>
                    {details.arrivedOnTime
                      ? "期限内に到着"
                      : `到着遅延 ${details.arrivalLateHours}時間`}
                  </dd>
                </div>
              </dl>

              {hasFuel && (
                <div className="settlement-fuel-card">
                  <h4>燃料</h4>

                  <p className="settlement-fuel-values">
                    消費 {details.fuelConsumedTons!.toFixed(1)} t
                    ／
                    残量 {details.fuelRemainingTons!.toFixed(1)} t
                  </p>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary settlement-confirm-button"
                onClick={handleSettle}
                disabled={isSettling}
              >
                精算する
              </button>
            </section>
          )}

          <div className="settlement-actions">
            <button
              type="button"
              className="btn btn-primary settlement-confirm-button"
              onClick={handleSettle}
              disabled={isSettling}
            >
              精算する
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onBack}
            >
              {returnLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

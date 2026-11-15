import { useState } from "react";
import type { SettlementPageProps } from "./SettlementPageTypes";
import "./settlementPage.css";

export function SettlementPage({
  voyageLabel,
  contractLabel,
  shipName,
  status,
  returnTo,
  onSettle,
  onBack,
}: SettlementPageProps) {
  const [isSettling, setIsSettling] = useState(false);

  const isSettled = status === "settled";

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
          </section>

          <section className="settlement-notice-card">
            <p>
              この航海の結果は、精算後に航海日誌へ記録されます。
            </p>

            <p className="settlement-notice-sub">
              金額・内訳は表示しません。
            </p>
          </section>

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

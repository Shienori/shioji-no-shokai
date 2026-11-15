import type { SettlementPageProps } from "./SettlementPageTypes";
import "./settlementPage.css";

export function SettlementPage({
  voyageLabel,
  contractLabel,
  shipName,
  rewardAmount,
  amounts,
  details,
  status,
  returnTo,
  onSettle,
  onBack,
}: SettlementPageProps) {
  const isSettled = status === "settled";
  const hasFuel =
    details.fuelConsumedTons !== null &&
    details.fuelRemainingTons !== null;

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
        <section className="settlement-detail-card">
          <div className="settlement-amounts-box">
            <h3>金額の計算</h3>

            <dl className="settlement-amount-list">
              <div>
                <dt>契約報酬</dt>
                <dd>{amounts.offeredReward.toLocaleString("ja-JP")} G</dd>
              </div>

              <div>
                <dt>遅延ペナルティ</dt>
                <dd>-{amounts.latePenalty.toLocaleString("ja-JP")} G</dd>
              </div>

              <div>
                <dt>受取報酬</dt>
                <dd>{amounts.receivedReward.toLocaleString("ja-JP")} G</dd>
              </div>

              <div>
                <dt>経費</dt>
                <dd>-{amounts.expense.toLocaleString("ja-JP")} G</dd>
              </div>

              {amounts.guaranteeAmount > 0 && (
                <div>
                  <dt>最低利益保証</dt>
                  <dd>+{amounts.guaranteeAmount.toLocaleString("ja-JP")} G</dd>
                </div>
              )}
            </dl>

            <div className="settlement-final-payout">
              <span className="settlement-final-payout-label">
                最終受取額
              </span>

              <span className="settlement-final-payout-value">
                {amounts.finalPayout.toLocaleString("ja-JP")} G
              </span>
            </div>
          </div>

          <div className="settlement-voyage-box">
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
          </div>

          {hasFuel && (
            <div className="settlement-fuel-box">
              <h3>燃料</h3>

              <p className="settlement-fuel-values">
                消費 {details.fuelConsumedTons!.toFixed(1)} t
                ／
                残量 {details.fuelRemainingTons!.toFixed(1)} t
              </p>
            </div>
          )}

          <div className="settlement-actions">
            <button
              type="button"
              className="btn btn-primary settlement-confirm-button"
              onClick={onSettle}
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
        </section>
      )}
    </div>
  );
}

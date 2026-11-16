import { useEffect } from "react";
import { useGameStore } from "../state/gameStore";
import DebugLogPanel from "../components/debug/DebugLogPanel";
import {
  logDebug,
  logError,
  logInfo,
  logWarn,
} from "../state/debugLog";

export default function MainPage() {
  const {
    gameState,
    selectedContractId,
    selectedShipId,
    activeTab,
    tick,
    selectContract,
    selectShip,
    setActiveTab,
    selectPort,
    refuelShip,
    acceptContract,
    settleContract,
    resetGame,
  } = useGameStore();

  useEffect(() => {
    const interval = window.setInterval(() => {
      try {
        tick();
      } catch (error) {
        logError(
          "MainPage.useEffect",
          "tick実行中にエラー",
          error,
        );
      }
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [tick]);

  const currentPortOffers =
    gameState.portOffers[gameState.selectedPortId] ?? [];

  const selectedShip = gameState.ships.find(
    (ship) => ship.id === selectedShipId,
  );

  const selectedContract = currentPortOffers.find(
    (offer) => offer.id === selectedContractId,
  );

  const activeVoyage = gameState.activeVoyage;
  const activeContract = gameState.acceptedContract;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold">
              潮路の商會
            </h1>

            <p className="text-xs text-slate-400">
              所持金: {gameState.money}G
            </p>
          </div>

          <nav className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                logDebug(
                  "MainPage",
                  "契約タブへ切替",
                );
                setActiveTab("contracts");
              }}
              className={
                activeTab === "contracts"
                  ? "rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold"
                  : "rounded bg-slate-800 px-3 py-1.5 text-sm"
              }
            >
              依頼
            </button>

            <button
              type="button"
              onClick={() => {
                logDebug(
                  "MainPage",
                  "船団タブへ切替",
                );
                setActiveTab("fleet");
              }}
              className={
                activeTab === "fleet"
                  ? "rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold"
                  : "rounded bg-slate-800 px-3 py-1.5 text-sm"
              }
            >
              船団
            </button>

            <button
              type="button"
              onClick={() => {
                logDebug(
                  "MainPage",
                  "海図タブへ切替",
                );
                setActiveTab("chart");
              }}
              className={
                activeTab === "chart"
                  ? "rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold"
                  : "rounded bg-slate-800 px-3 py-1.5 text-sm"
              }
            >
              海図
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {activeTab === "contracts" && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">
              港の依頼
            </h2>

            <div className="grid gap-3 md:grid-cols-3">
              {currentPortOffers.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => {
                    logDebug(
                      "MainPage",
                      "依頼を選択",
                      { offerId: offer.id },
                    );
                    selectContract(offer.id);
                  }}
                  className={
                    selectedContractId === offer.id
                      ? "rounded-lg border border-sky-500 bg-slate-900 p-4 text-left"
                      : "rounded-lg border border-slate-800 bg-slate-900 p-4 text-left"
                  }
                >
                  <p className="text-sm font-semibold">
                    {offer.title}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    報酬: {offer.offeredReward}G
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    期限:
                    {new Date(
                      offer.deadlineAt,
                    ).toLocaleString()}
                  </p>
                </button>
              ))}
            </div>

            {selectedContract && (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h3 className="font-semibold">
                  {selectedContract.title}
                </h3>

                <p className="mt-2 text-sm text-slate-300">
                  {selectedContract.description}
                </p>

                <div className="mt-4">
                  <p className="text-xs text-slate-400">
                    船を選択
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {gameState.ships.map((ship) => (
                      <button
                        key={ship.id}
                        type="button"
                        onClick={() => {
                          logDebug(
                            "MainPage",
                            "船を選択",
                            { shipId: ship.id },
                          );
                          selectShip(ship.id);
                        }}
                        className={
                          selectedShipId === ship.id
                            ? "rounded border border-sky-500 bg-slate-800 px-3 py-1.5 text-sm"
                            : "rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
                        }
                      >
                        {ship.name}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    !selectedShip ||
                    Boolean(gameState.activeVoyage) ||
                    Boolean(gameState.acceptedContract)
                  }
                  onClick={() => {
                    if (!selectedShip) {
                      logWarn(
                        "MainPage",
                        "船が選択されていません",
                      );
                      return;
                    }

                    logInfo(
                      "MainPage",
                      "受注ボタンを押下",
                      {
                        offerId: selectedContract.id,
                        shipId: selectedShip.id,
                      },
                    );

                    try {
                      acceptContract(
                        selectedContract.id,
                        selectedShip.id,
                      );
                    } catch (error) {
                      logError(
                        "MainPage",
                        "受注処理でエラー",
                        error,
                      );
                    }
                  }}
                  className="mt-4 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  この依頼を受注する
                </button>
              </div>
            )}
          </section>
        )}

        {activeTab === "fleet" && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">
              船団
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              {gameState.ships.map((ship) => (
                <div
                  key={ship.id}
                  className="rounded-lg border border-slate-800 bg-slate-900 p-4"
                >
                  <p className="font-semibold">
                    {ship.name}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    状態: {ship.status}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    現在港: {ship.currentPortId}
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    燃料: {ship.fuel?.remainingTons ?? 0} /
                    {ship.fuel?.capacityTons ?? 0} t
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      logInfo(
                        "MainPage",
                        "補油ボタンを押下",
                        {
                          shipId: ship.id,
                        },
                      );

                      try {
                        refuelShip(ship.id, 10);
                      } catch (error) {
                        logError(
                          "MainPage",
                          "補油処理でエラー",
                          error,
                        );
                      }
                    }}
                    className="mt-3 rounded bg-sky-600 px-3 py-1.5 text-sm font-semibold"
                  >
                    10t補油
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "chart" && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">
              海図
            </h2>

            <p className="text-sm text-slate-300">
              現在の港: {gameState.selectedPortId}
            </p>

            <div className="flex flex-wrap gap-2">
              {Object.keys(gameState.portOffers).map(
                (portId) => (
                  <button
                    key={portId}
                    type="button"
                    onClick={() => {
                      logDebug(
                        "MainPage",
                        "港を選択",
                        { portId },
                      );
                      selectPort(portId);
                    }}
                    className={
                      gameState.selectedPortId === portId
                        ? "rounded border border-sky-500 bg-slate-800 px-3 py-1.5 text-sm"
                        : "rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
                    }
                  >
                    {portId}
                  </button>
                ),
              )}
            </div>
          </section>
        )}

        {activeVoyage && activeContract && (
          <section className="mt-8 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <h2 className="text-lg font-bold">
              航海中
            </h2>

            <p className="mt-1 text-sm text-amber-200">
              依頼: {activeContract.title}
            </p>

            <p className="mt-1 text-sm text-amber-200">
              状態: {activeVoyage.phase}
            </p>

            <p className="mt-1 text-sm text-amber-200">
              出発港: {activeContract.route.fromPortId}
            </p>

            <p className="mt-1 text-sm text-amber-200">
              到着港: {activeContract.route.toPortId}
            </p>

            <button
              type="button"
              disabled={
                activeVoyage.phase !== "completed"
              }
              onClick={() => {
                logInfo(
                  "MainPage",
                  "精算ボタンを押下",
                );

                try {
                  settleContract();
                } catch (error) {
                  logError(
                    "MainPage",
                    "精算処理でエラー",
                    error,
                  );
                }
              }}
              className="mt-3 rounded bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              精算する
            </button>
          </section>
        )}

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={() => {
              logWarn(
                "MainPage",
                "リセットボタンを押下",
              );

              try {
                resetGame();
              } catch (error) {
                logError(
                  "MainPage",
                  "リセット処理でエラー",
                  error,
                );
              }
            }}
            className="rounded border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-sm text-red-300"
          >
            ゲームを初期化
          </button>
        </div>
      </main>

      <DebugLogPanel />
    </div>
  );
}

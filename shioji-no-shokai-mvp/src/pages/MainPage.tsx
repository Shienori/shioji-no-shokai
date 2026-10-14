import { useEffect } from "react";
import { useGameStore } from "../state/gameStore";
import { AppHeader } from "../components/layout/AppHeader";
import { TabBar } from "../components/layout/TabBar";
import { ContractBoard } from "../components/contract/ContractBoard";
import { ContractDetailScreen } from "../components/contract/ContractDetailScreen";
import { FleetPanel } from "../components/fleet/FleetPanel";
import { SettlementModal } from "../components/settlement/SettlementModal";
import { getContractTemplateById, tutorialWheatContract } from "../data/contracts";
import { getRouteById } from "../data/routes";
import { calculateVoyageProgress } from "../domain/voyage";
import { settleContract } from "../domain/settlement";
import { SAVE_KEY } from "../data/gameConstants";

export function MainPage() {
  const gameState = useGameStore((state) => state.gameState);
  const activeTab = useGameStore((state) => state.activeTab);
  const selectedContractId = useGameStore((state) => state.selectedContractId);
  const tick = useGameStore((state) => state.tick);
  const setActiveTab = useGameStore((state) => state.setActiveTab);
  const selectContract = useGameStore((state) => state.selectContract);
  const selectPort = useGameStore((state) => state.selectPort);
  const acceptContract = useGameStore((state) => state.acceptContract);

  useEffect(() => {
    const interval = setInterval(() => tick(), 1000);
    return () => clearInterval(interval);
  }, [tick]);

  const selectedPortId = gameState.selectedPortId;
  const ship = gameState.ships[0];
  const contracts = (gameState.portOffers[selectedPortId] ?? []).map(getContractTemplateById);
  const fixedContract = selectedPortId === "port_selene" ? tutorialWheatContract : null;
  const selectedContract = selectedContractId === null ? null : getContractTemplateById(selectedContractId);

  const canAcceptContract = (contract: NonNullable<typeof selectedContract>) => {
    const route = getRouteById(contract.routeId);
    return gameState.acceptedContract === null
      && ship.status === "docked"
      && ship.currentPortId === route.fromPortId;
  };

  const voyage = gameState.activeVoyage;
  const progress = voyage && gameState.acceptedContract
    ? calculateVoyageProgress(voyage, gameState.acceptedContract, gameState.operationTime)
    : 0;
  const shouldShowSettlement = voyage?.phase === "completed" && !voyage.settled;

  const settlementResult = shouldShowSettlement && gameState.acceptedContract
    ? settleContract(gameState.acceptedContract, voyage!)
    : null;

  const resetGame = () => {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  };

  const handleAccept = (contractId: string) => {
    acceptContract(contractId);
    selectContract(null);
    setActiveTab("contracts");
  };

  if (selectedContract) {
    return (
      <div className="phone">
        <ContractDetailScreen
          contract={selectedContract}
          canAccept={canAcceptContract(selectedContract)}
          onAccept={() => handleAccept(selectedContract.id)}
          onClose={() => selectContract(null)}
        />
      </div>
    );
  }

  return (
    <div className="phone">
      <AppHeader />
      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      <main className="page">
        <div className="page-body">
          {activeTab === "contracts" ? (
            <ContractBoard
              selectedPortId={selectedPortId}
              onSelectPort={selectPort}
              fixedContract={fixedContract}
              contracts={contracts}
              nextRefreshAt={gameState.nextRefreshAt}
              currentTime={Date.now()}
              acceptedContract={gameState.acceptedContract}
              voyage={voyage}
              progress={progress}
              operationTime={gameState.operationTime}
              onSelectContract={selectContract}
            />
          ) : (
            <FleetPanel ship={ship} voyage={voyage} contract={gameState.acceptedContract} progress={progress} operationTime={gameState.operationTime} />
          )}
        </div>
      </main>

      <SettlementModal result={settlementResult} onConfirm={() => useGameStore.getState().settleContract()} />

      <button className="btn btn-secondary" onClick={resetGame}>デバッグ: 初期化</button>
    </div>
  );
}

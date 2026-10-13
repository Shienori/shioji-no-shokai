import { useEffect } from "react";
import { useGameStore } from "../state/gameStore";
import { AppHeader } from "../components/layout/AppHeader";
import { TabBar } from "../components/layout/TabBar";
import { ContractBoard } from "../components/contract/ContractBoard";
import { ContractDetailScreen } from "../components/contract/ContractDetailScreen";
import { FleetPanel } from "../components/fleet/FleetPanel";
import { SettlementModal } from "../components/settlement/SettlementModal";
import { getContractTemplateById } from "../data/contracts";
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
  const acceptContract = useGameStore((state) => state.acceptContract);

  useEffect(() => {
    const interval = setInterval(() => tick(), 1000);
    return () => clearInterval(interval);
  }, [tick]);

  const contracts = gameState.offeredContractIds.map(getContractTemplateById);
  const selectedContract = selectedContractId === null ? null : getContractTemplateById(selectedContractId);
  const canAccept = gameState.acceptedContract === null && gameState.ships[0].status === "docked" && gameState.ships[0].currentPortId === "port_selene";
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
    setActiveTab("fleet");
  };

  if (selectedContract) {
    return (
      <div className="phone">
        <ContractDetailScreen
          contract={selectedContract}
          canAccept={canAccept}
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

      <main>
        {activeTab === "contracts" ? (
          <ContractBoard contracts={contracts} onSelectContract={selectContract} />
        ) : (
          <FleetPanel ship={gameState.ships[0]} voyage={voyage} contract={gameState.acceptedContract} progress={progress} operationTime={gameState.operationTime} />
        )}
      </main>

      <SettlementModal result={settlementResult} onConfirm={() => useGameStore.getState().settleContract()} />

      <button className="btn btn-secondary" onClick={resetGame}>デバッグ: 初期化</button>
    </div>
  );
}
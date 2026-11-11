import { useEffect, useRef } from "react";
import { useGameStore } from "../state/gameStore";
import { debugSkipThirtyMinutes } from "../state/debugTimeSkip";
import { NextVoyageBoundaryButton } from "../components/debug/NextVoyageBoundaryButton";
import { AppHeader } from "../components/layout/AppHeader";
import { TabBar } from "../components/layout/TabBar";
import { ContractBoard } from "../components/contract/ContractBoard";
import { ContractDetailScreen } from "../components/contract/ContractDetailScreen";
import { PlannedContractDetailScreen } from "../components/contract/PlannedContractDetailScreen";
import type { ConfirmedPlanReview } from "../domain/confirmedPlanReview";
import { WorldMapTab } from "../components/map/WorldMapTab";
import { FleetPanel } from "../components/fleet/FleetPanel";
import { ShipDetailScreen } from "../components/fleet/ShipDetailScreen";
import { SettlementModal } from "../components/settlement/SettlementModal";
import { getContractTemplateById, tutorialWheatContract } from "../data/contracts";
import { getRouteById } from "../data/routes";
import { evaluateContractAcceptance } from "../domain/contractAcceptance";
import { calculateVoyageProgress } from "../domain/voyage";
import { settleContract } from "../domain/settlement";

export function MainPage() {
  const gameState = useGameStore((state) => state.gameState);
  const displayClock = { realTimeMs: gameState.currentGameTime, operationTimeMs: gameState.operationTime };
  const activeTab = useGameStore((state) => state.activeTab);
  // This transient selection is an offer ID, except for the fixed tutorial.
  const selectedContractId = useGameStore((state) => state.selectedContractId);
  const selectedShipId = useGameStore((state) => state.selectedShipId);
  const setActiveTab = useGameStore((state) => state.setActiveTab);
  const selectContract = useGameStore((state) => state.selectContract);
  const selectShip = useGameStore((state) => state.selectShip);
  const selectPort = useGameStore((state) => state.selectPort);
  const acceptContract = useGameStore((state) => state.acceptContract);
  const selectedPortId = gameState.selectedPortId;
  const offeredContracts = gameState.portOffers[selectedPortId] ?? [];
  const contracts = offeredContracts.map((offer) => ({ offerId: offer.id, template: getContractTemplateById(offer.templateId) }));
  const tutorialAccepted = gameState.acceptedContractIds.includes(tutorialWheatContract.id)
    || gameState.acceptedContract?.templateId === tutorialWheatContract.id
    || gameState.tutorialCompleted;
  const fixedContract = selectedPortId === "port_selene" && !tutorialAccepted ? tutorialWheatContract : null;
  const selectedOffer = offeredContracts.find((offer) => offer.id === selectedContractId) ?? null;
  const selectedContract = selectedOffer ? getContractTemplateById(selectedOffer.templateId)
    : fixedContract && selectedContractId === fixedContract.id ? fixedContract : null;
  const selectedShip = selectedShipId === null ? null : gameState.ships.find((ship) => ship.id === selectedShipId) ?? null;
  const selectedRoute = selectedContract ? getRouteById(selectedContract.routeId) : null;
  const acceptanceChecks = selectedContract ? gameState.ships.map((ship) => ({ ship, check: evaluateContractAcceptance(selectedContract, ship, gameState, Date.now(), selectedOffer?.id) })) : [];
  const eligibleShips = acceptanceChecks.filter((item) => item.check.canAccept).map((item) => item.ship);
  const acceptReason = !selectedContract || !selectedRoute ? null
    : acceptanceChecks.find((item) => !item.check.canAccept)?.check.reason ?? null;
  const voyage = gameState.activeVoyage;
  const progress = voyage && gameState.acceptedContract ? calculateVoyageProgress(voyage, gameState.acceptedContract, gameState.operationTime) : 0;
  const shouldShowSettlement = voyage?.phase === "completed" && !voyage.settled;
  const settlementResult = shouldShowSettlement && gameState.acceptedContract ? settleContract(gameState.acceptedContract, voyage!) : null;
  const planningOpen = selectedContract !== null && selectedContractId !== null && gameState.ships.length > 0 && gameState.ships.every(ship => ship.kind === "powered");
  const background = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = background.current;
    if (!element) return;
    if (planningOpen) element.setAttribute("inert", ""); else element.removeAttribute("inert");
    return () => element.removeAttribute("inert");
  }, [planningOpen]);
  const handleAccept = (selectionId: string, shipId: string, selectedSpeedKnots: number, review?: ConfirmedPlanReview) => {
    const before = useGameStore.getState().gameState;
    if (before.selectedPortId !== selectedPortId) { selectContract(null); return; }
    const result = acceptContract(selectionId, shipId, selectedSpeedKnots, review);
    if (result?.kind === "reviewRequired") return result;
    const after = useGameStore.getState().gameState;
    if (after.acceptedContract === before.acceptedContract || after.activeVoyage === before.activeVoyage) return;
    selectContract(null);
    selectShip(null);
    setActiveTab("fleet");
    return result;
  };
  if (selectedContract && selectedContractId !== null && !planningOpen) return <div className="phone">
    <ContractDetailScreen key={selectedContractId} contract={selectedContract} ships={gameState.ships} eligibleShips={eligibleShips} acceptReason={acceptReason} offeredDeadlineAt={selectedOffer?.deadlineAt ?? null} onAccept={(shipId, speed) => handleAccept(selectedContractId, shipId, speed)} onClose={() => selectContract(null)} />
  </div>;
  if (selectedShip && !planningOpen) return <div className="phone">
    <ShipDetailScreen displayClock={displayClock} ship={selectedShip} voyage={voyage} contract={gameState.acceptedContract} operationTime={gameState.operationTime} voyageMemos={gameState.voyageMemos} onBack={() => selectShip(null)} />
  </div>;
  return <div className="phone">
    <div ref={background} aria-hidden={planningOpen ? true : undefined}>
      <AppHeader />
      <TabBar activeTab={activeTab} onChange={setActiveTab} />
      <main className="page"><div className="page-body">
        {activeTab === "contracts" ? <ContractBoard selectedPortId={selectedPortId} onSelectPort={(portId) => { selectContract(null); selectPort(portId); }} fixedContract={fixedContract} contracts={contracts} nextRefreshAt={gameState.nextRefreshAt} currentTime={Date.now()} acceptedContract={gameState.acceptedContract} voyage={voyage} progress={progress} operationTime={gameState.operationTime} onSelectContract={selectContract} ships={gameState.ships} />
          : activeTab === "chart" ? <WorldMapTab ships={gameState.ships} voyage={voyage} contract={gameState.acceptedContract} />
          : <FleetPanel displayClock={displayClock} ships={gameState.ships} voyage={voyage} contract={gameState.acceptedContract} operationTime={gameState.operationTime} onSelectShip={selectShip} />}
      </div></main>
      <SettlementModal result={settlementResult} onConfirm={() => useGameStore.getState().settleContract()} />
      <NextVoyageBoundaryButton voyage={voyage} planningOpen={planningOpen} />
      <button className="btn btn-secondary" type="button" disabled={voyage?.plannedNavigation !== undefined} title={voyage?.plannedNavigation !== undefined ? "確定計画の航海中は固定ETA・進行状態を保護するため旧スキップを無効にしています" : undefined} onClick={debugSkipThirtyMinutes}>デバッグ: 待ち時間を30分スキップ</button>
      <button className="btn btn-secondary" type="button" onClick={() => useGameStore.getState().resetGame()}>デバッグ: 初期化</button>
    </div>
    {planningOpen && selectedContract && selectedContractId !== null && <PlannedContractDetailScreen key={selectedContractId} offerId={selectedContractId} contract={selectedContract} ships={gameState.ships} eligibleShips={eligibleShips} acceptReason={acceptReason} offeredDeadlineAt={selectedOffer?.deadlineAt ?? null} onAccept={(shipId, speed, review) => handleAccept(selectedContractId, shipId, speed, review)} onClose={() => selectContract(null)} />}
  </div>;
}
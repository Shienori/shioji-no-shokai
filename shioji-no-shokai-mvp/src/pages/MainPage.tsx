import { useEffect, useRef, useState } from "react";
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
import { SettlementPage } from "../components/settlement/SettlementPage";
import type { SettlementDetail, SettlementReturnTarget } from "../components/settlement/SettlementPageTypes";
import { getContractTemplateById, tutorialWheatContract } from "../data/contracts";
import { getRouteById } from "../data/routes";
import { getCargoById } from "../data/cargos";
import { calculateCPlanOfferedReward } from "../domain/contractSchedule";
import { evaluateContractAcceptance } from "../domain/contractAcceptance";
import { calculateVoyageProgress } from "../domain/voyage";

interface SettlementSnapshot {
  voyageLabel: string;
  contractLabel: string;
  shipName: string;
  rewardAmount: number;
  details: SettlementDetail;
}

export function MainPage() {
  const gameState = useGameStore((state) => state.gameState);
  const displayClock = { realTimeMs: gameState.currentGameTime, operationTimeMs: gameState.operationTime };
  const activeTab = useGameStore((state) => state.activeTab);
  const selectedContractId = useGameStore((state) => state.selectedContractId);
  const selectedShipId = useGameStore((state) => state.selectedShipId);
  const setActiveTab = useGameStore((state) => state.setActiveTab);
  const selectContract = useGameStore((state) => state.selectContract);
  const selectShip = useGameStore((state) => state.selectShip);
  const selectPort = useGameStore((state) => state.selectPort);
  const acceptContract = useGameStore((state) => state.acceptContract);

  const [settlementReturnTo, setSettlementReturnTo] = useState<SettlementReturnTarget>("contracts");
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [isSettlementCompleted, setIsSettlementCompleted] = useState(false);
  const [settlementSnapshot, setSettlementSnapshot] = useState<SettlementSnapshot | null>(null);

  const selectedPortId = gameState.selectedPortId;
  const offeredContracts = gameState.portOffers[selectedPortId] ?? [];
  const contracts = offeredContracts
    .map((offer) => ({ offerId: offer.id, template: { ...getContractTemplateById(offer.templateId), offeredReward: offer.offeredReward } }))
    .filter((item) => getRouteById(item.template.routeId).fromPortId === selectedPortId);
  const tutorialAccepted = gameState.acceptedContractIds.includes(tutorialWheatContract.id)
    || gameState.acceptedContract?.templateId === tutorialWheatContract.id
    || gameState.tutorialCompleted;
  const showTutorial = selectedPortId === "port_selene" && !tutorialAccepted;
  const tutorialReward = showTutorial ? calculateCPlanOfferedReward(
    tutorialWheatContract,
    getCargoById(tutorialWheatContract.cargoId),
    getRouteById(tutorialWheatContract.routeId),
  ) : null;
  const fixedContract = showTutorial && tutorialReward !== null ? { ...tutorialWheatContract, offeredReward: tutorialReward } : null;
  const selectedOffer = offeredContracts.find((offer) => offer.id === selectedContractId) ?? null;
  const selectedContract = selectedOffer ? getContractTemplateById(selectedOffer.templateId)
    : fixedContract && selectedContractId === tutorialWheatContract.id ? tutorialWheatContract : null;
  const selectedRewardAmount = selectedOffer?.offeredReward ?? tutorialReward;
  const selectedShip = selectedShipId === null ? null : gameState.ships.find((ship) => ship.id === selectedShipId) ?? null;
  const selectedRoute = selectedContract ? getRouteById(selectedContract.routeId) : null;
  const acceptanceChecks = selectedContract ? gameState.ships.map((ship) => ({ ship, check: evaluateContractAcceptance(selectedContract, ship, gameState, Date.now(), selectedOffer?.id) })) : [];
  const eligibleShips = acceptanceChecks.filter((item) => item.check.canAccept).map((item) => item.ship);
  const acceptReason = !selectedContract || !selectedRoute ? null
    : acceptanceChecks.find((item) => !item.check.canAccept)?.check.reason ?? null;
  const voyage = gameState.activeVoyage;
  const progress = voyage && gameState.acceptedContract ? calculateVoyageProgress(voyage, gameState.acceptedContract, gameState.operationTime) : 0;
  const shouldShowSettlement = voyage?.phase === "completed" && !voyage.settled;
  const planningOpen = selectedContract !== null && selectedContractId !== null && gameState.ships.length > 0 && gameState.ships.every(ship => ship.kind === "powered");
  const background = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = background.current;
    if (!element) return;
    if (planningOpen) element.setAttribute("inert", ""); else element.removeAttribute("inert");
    return () => element.removeAttribute("inert");
  }, [planningOpen]);

  const createSettlementSnapshot = (): SettlementSnapshot => {
    const memo = voyage
      ? gameState.voyageMemos.find(
          (item) =>
            item.contractId === voyage.contractId &&
            item.shipId === voyage.shipId,
        )
      : null;

    const ship = gameState.ships.find(
      (item) => item.id === voyage?.shipId,
    );

    const route = gameState.acceptedContract
      ? getRouteById(gameState.acceptedContract.routeId)
      : null;

    return {
      voyageLabel: memo?.label ?? "V.001",
      contractLabel: memo?.cargoLabel ?? "依頼情報を確認できません",
      shipName: ship?.name ?? "",
      rewardAmount: gameState.acceptedContract?.reward.offeredReward ?? 0,
      details: {
        routeLabel: route
          ? `${route.fromPortId} → ${route.toPortId}`
          : "航路情報を確認できません",
        cargoLabel: memo?.cargoLabel ?? "積荷情報を確認できません",
        arrivedOnTime: voyage?.isOnTime ?? true,
        arrivalLateHours: voyage?.arrivalLateHours ?? 0,
        fuelConsumedTons: voyage?.fuelNavigation?.fuelConsumedTons ?? null,
        fuelRemainingTons: ship?.fuel?.remainingTons ?? null,
      },
    };
  };

  const openSettlementFromContracts = () => {
    setSettlementReturnTo("contracts");
    setSettlementSnapshot(createSettlementSnapshot());
    setIsSettlementOpen(true);
  };

  const openSettlementFromFleet = () => {
    setSettlementReturnTo("fleet");
    setSettlementSnapshot(createSettlementSnapshot());
    setIsSettlementOpen(true);
  };

  const handleSettlement = () => {
    useGameStore.getState().settleContract();
    setIsSettlementCompleted(true);
  };

  const handleSettlementBack = () => {
    setIsSettlementOpen(false);
    setIsSettlementCompleted(false);
    setActiveTab(settlementReturnTo);
  };

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

  if (selectedContract && selectedContractId !== null && selectedRewardAmount !== null && !planningOpen) return <div className="phone">
    <ContractDetailScreen key={selectedContractId} contract={{ ...selectedContract, offeredReward: selectedRewardAmount }} ships={gameState.ships} eligibleShips={eligibleShips} acceptReason={acceptReason} offeredDeadlineAt={selectedOffer?.deadlineAt ?? null} onAccept={(shipId, speed) => handleAccept(selectedContractId, shipId, speed)} onClose={() => selectContract(null)} />
  </div>;

  if (selectedShip && !planningOpen) return <div className="phone">
    <ShipDetailScreen displayClock={displayClock} ship={selectedShip} voyage={voyage} contract={gameState.acceptedContract} operationTime={gameState.operationTime} voyageMemos={gameState.voyageMemos} onBack={() => selectShip(null)} />
  </div>;

  return <div className="phone">
    <div ref={background} aria-hidden={planningOpen ? true : undefined}>
      <AppHeader />
      <TabBar activeTab={activeTab} onChange={setActiveTab} />
      <main className="page"><div className="page-body">
        {isSettlementOpen && settlementSnapshot ? <SettlementPage voyageLabel={settlementSnapshot.voyageLabel} contractLabel={settlementSnapshot.contractLabel} shipName={settlementSnapshot.shipName} rewardAmount={settlementSnapshot.rewardAmount} details={settlementSnapshot.details} status={isSettlementCompleted ? "settled" : "settlementPending"} returnTo={settlementReturnTo} onSettle={handleSettlement} onBack={handleSettlementBack} />
          : activeTab === "contracts" ? <ContractBoard selectedPortId={selectedPortId} onSelectPort={(portId) => { selectContract(null); selectPort(portId); }} fixedContract={fixedContract} contracts={contracts} nextRefreshAt={gameState.nextRefreshAt} currentTime={Date.now()} acceptedContract={gameState.acceptedContract} voyage={voyage} progress={progress} operationTime={gameState.operationTime} gameState={gameState} ships={gameState.ships} onSelectContract={selectContract} onOpenSettlement={openSettlementFromContracts} />
          : activeTab === "chart" ? <WorldMapTab ships={gameState.ships} voyage={voyage} contract={gameState.acceptedContract} />
          : <FleetPanel displayClock={displayClock} ships={gameState.ships} voyage={voyage} contract={gameState.acceptedContract} operationTime={gameState.operationTime} onSelectShip={selectShip} onOpenSettlement={openSettlementFromFleet} />}
      </div></main>
      <NextVoyageBoundaryButton voyage={voyage} planningOpen={planningOpen} />
      <button className="btn btn-secondary" type="button" disabled={voyage?.plannedNavigation !== undefined} title={voyage?.plannedNavigation !== undefined ? "確定計画の航海中は固定ETA・進行状態を保護するため旧スキップを無効にしています" : undefined} onClick={debugSkipThirtyMinutes}>デバッグ: 待ち時間を30分スキップ</button>
      <button className="btn btn-secondary" type="button" onClick={() => useGameStore.getState().resetGame()}>デバッグ: 初期化</button>
    </div>
    {planningOpen && selectedContract && selectedContractId !== null && selectedRewardAmount !== null && <PlannedContractDetailScreen key={selectedContractId} offerId={selectedContractId} contract={selectedContract} rewardAmount={selectedRewardAmount} ships={gameState.ships} eligibleShips={eligibleShips} acceptReason={acceptReason} offeredDeadlineAt={selectedOffer?.deadlineAt ?? null} onAccept={(shipId, speed, review) => handleAccept(selectedContractId, shipId, speed, review)} onClose={() => selectContract(null)} />}
  </div>;
}

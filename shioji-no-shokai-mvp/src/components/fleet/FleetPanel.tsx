import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { PlannedFleetShipCard } from "./PlannedFleetShipCard";
import { FleetCard } from "./FleetCard";
import type { VoyageDisplayClock } from "../../domain/voyageTimePresentation";

interface FleetPanelProps {
  displayClock: VoyageDisplayClock;
  ships: Ship[];
  voyage: Voyage | null;
  contract: AcceptedContract | null;
  operationTime: number;
  onSelectShip: (shipId: string) => void;
  onOpenSettlement: () => void;
}

export function FleetPanel({
  displayClock,
  ships,
  voyage,
  contract,
  operationTime,
  onSelectShip,
  onOpenSettlement,
}: FleetPanelProps) {
  return (
    <section className="contract-board fleet-board">
      <header className="contract-board-header">
        <div>
          <h2>Fleet</h2>
          <p className="contract-board-subtitle">所属船団の状況</p>
        </div>
        <span className="contract-count">{ships.length}隻</span>
      </header>

      <div className="contract-list">
        {ships.map((ship) => {
          const shipVoyage = voyage?.shipId === ship.id ? voyage : null;
          const shipContract = shipVoyage && contract?.id === shipVoyage.contractId ? contract : null;

          if (shipVoyage?.plannedNavigation !== undefined) {
            return (
              <PlannedFleetShipCard
                clock={displayClock}
                key={ship.id}
                ship={ship}
                voyage={shipVoyage}
                contract={shipContract}
                onSelectShip={onSelectShip}
                onOpenSettlement={onOpenSettlement}
              />
            );
          }

          return (
            <FleetCard
              key={ship.id}
              ship={ship}
              voyage={shipVoyage}
              contract={shipContract}
              operationTime={operationTime}
              onSelectShip={onSelectShip}
              onOpenSettlement={onOpenSettlement}
            />
          );
        })}
      </div>
    </section>
  );
}

import type { ContractTemplate } from "../../domain/types";
import { ContractCard } from "./ContractCard";

interface ContractBoardProps {
  contracts: ContractTemplate[];
  onSelectContract: (contractId: string) => void;
}

export function ContractBoard({ contracts, onSelectContract }: ContractBoardProps) {
  return (
    <section className="contract-board">
      <header className="contract-board-header">
        <div>
          <h2>契約板</h2>
          <p className="contract-board-subtitle">セレネ港発の輸送依頼</p>
        </div>
        <span className="contract-count">{contracts.length}件</span>
      </header>
      <div className="contract-list">
        {contracts.map((contract) => (
          <ContractCard key={contract.id} contract={contract} onSelect={() => onSelectContract(contract.id)} />
        ))}
      </div>
    </section>
  );
}

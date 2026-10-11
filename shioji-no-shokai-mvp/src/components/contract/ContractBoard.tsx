import type { ContractTemplate } from "../../domain/types";
import { ContractCard } from "./ContractCard";

interface ContractBoardProps {
  contracts: ContractTemplate[];
  onSelectContract: (contractId: string) => void;
}

export function ContractBoard({ contracts, onSelectContract }: ContractBoardProps) {
  return (
    <section>
      <p className="section-title">セレネ港</p>
      {contracts.map((contract) => (
        <ContractCard key={contract.id} contract={contract} onSelect={() => onSelectContract(contract.id)} />
      ))}
    </section>
  );
}

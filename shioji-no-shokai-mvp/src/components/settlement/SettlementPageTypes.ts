export type SettlementPageStatus =
  | "settlementPending"
  | "settled";

export type SettlementReturnTarget =
  | "contracts"
  | "fleet";

export interface SettlementPageProps {
  voyageLabel: string;
  contractLabel: string;
  shipName: string;
  status: SettlementPageStatus;
  returnTo: SettlementReturnTarget;
  onSettle: () => void;
  onBack: () => void;
}

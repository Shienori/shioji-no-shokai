export type SettlementPageStatus =
  | "settlementPending"
  | "settled";

export type SettlementReturnTarget =
  | "contracts"
  | "fleet";

export interface SettlementDetail {
  routeLabel: string;
  cargoLabel: string;
  arrivedOnTime: boolean;
  arrivalLateHours: number;
  fuelConsumedTons: number | null;
  fuelRemainingTons: number | null;
}

export interface SettlementPageProps {
  voyageLabel: string;
  contractLabel: string;
  shipName: string;
  rewardAmount: number;
  details: SettlementDetail;
  status: SettlementPageStatus;
  returnTo: SettlementReturnTarget;
  onSettle: () => void;
  onBack: () => void;
}

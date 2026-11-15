export type SettlementPageStatus =
  | "settlementPending"
  | "settled";

export type SettlementReturnTarget =
  | "contracts"
  | "fleet";

export interface SettlementAmounts {
  offeredReward: number;
  latePenalty: number;
  receivedReward: number;
  expense: number;
  guaranteeAmount: number;
  finalPayout: number;
}

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
  amounts: SettlementAmounts;
  details: SettlementDetail;
  status: SettlementPageStatus;
  returnTo: SettlementReturnTarget;
  onSettle: () => void;
  onBack: () => void;
}

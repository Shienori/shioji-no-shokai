import { useState } from "react";
import type { AcceptedContract, Ship, Voyage } from "../../domain/types";
import { getPlannedShipPresentation } from "../../domain/plannedShipPresentation";
import { PlanWeatherChart } from "./PlanWeatherChart";

interface Props { ships: Ship[]; voyage: Voyage; contract: AcceptedContract | null; currentRealTime: number; }
export function PlannedVoyageForecastMap({ ships, voyage, contract, currentRealTime }: Props) {
  const [capturedAt, setCapturedAt] = useState(() => Math.floor(currentRealTime));
  try {
    const ship = ships.find(item => item.id === voyage.shipId);
    if (!ship || !contract) throw new Error("Missing planned references");
    const model = getPlannedShipPresentation(ship, voyage, contract);
    const plan = voyage.plannedNavigation!;
    return <section aria-label="確定航路の計画船位と閲覧用予報">
      <p>受注時の確定航路・計画時刻を使用します。予報は閲覧時に取得した版で、受注時保存予報ではありません。実船位から計画船位を引き直しません。</p>
      <button type="button" onClick={() => setCapturedAt(Date.now())}>閲覧用予報を更新</button>
      <PlanWeatherChart route={plan.route} baseRealTime={contract.acceptedAt} departureRealTime={plan.departureRealTime}
        plannedEtaRealTime={model.plannedEtaRealTime} selectedSpeedKnots={model.selectedSpeedKnots} forecastCapturedAt={capturedAt} ships={ships} />
    </section>;
  } catch {
    return <p role="alert">確定航路と計画時刻を確認できません。従来の航路予測へ切り替えて表示しません。</p>;
  }
}

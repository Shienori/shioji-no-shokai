import { useState } from "react";
import { isValidShipFuel } from "../../domain/coalFuel";
import { useGameStore } from "../../state/gameStore";
import { checkPortRefuel, refuelShipAtPort } from "../../state/portRefuel";

function tons(value: number): string {
  return value > 0 && value < 0.01 ? "0.01t未満" : `${value.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}t`;
}

export function PortRefuelPanel({ shipId }: { shipId: string }) {
  const state = useGameStore((store) => store.gameState);
  const [message, setMessage] = useState<string | null>(null);
  const ship = state.ships.find((item) => item.id === shipId);
  if (!ship || ship.kind !== "powered") return null;
  const fuel = isValidShipFuel(ship.fuel) ? ship.fuel : null;
  const check = checkPortRefuel(state, shipId);
  return <section className="contract-card fleet-card">
    <h3>石炭補給</h3>
    <p className="contract-card-detail">当面は全港で無料・待ち時間なし。港で停泊中、依頼の精算後に満載まで補給できます。</p>
    {fuel && <>
      <div className="kv"><span>現在残量</span><span>{tons(fuel.remainingTons)}</span></div>
      <div className="kv"><span>最大搭載量</span><span>{tons(fuel.capacityTons)}</span></div>
      <div className="kv"><span>満載までの量</span><span>{tons(fuel.capacityTons - fuel.remainingTons)}</span></div>
    </>}
    <div className="kv"><span>補給費用</span><span>0G（暫定）</span></div>
    <button className="btn btn-secondary" type="button" disabled={!check.canRefuel} onClick={() => {
      setMessage(refuelShipAtPort(shipId).message);
    }}>満載まで補給（無料）</button>
    {!check.canRefuel && <p className="contract-card-detail">{check.reason}</p>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}

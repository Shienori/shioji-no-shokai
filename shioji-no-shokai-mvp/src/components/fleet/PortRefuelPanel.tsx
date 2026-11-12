import { useId, useState } from "react";
import { isValidShipFuel } from "../../domain/coalFuel";
import { useGameStore } from "../../state/gameStore";
import { checkPortRefuel, refuelShipAtPort } from "../../state/portRefuel";

function tons(value: number): string {
  return value > 0 && value < 0.01 ? "0.01t未満" : `${value.toLocaleString("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}t`;
}

export function PortRefuelPanel({ shipId }: { shipId: string }) {
  const state = useGameStore((store) => store.gameState);
  const [message, setMessage] = useState<string | null>(null);
  const [targetPercent, setTargetPercent] = useState(100);
  const sliderId = useId();
  const ship = state.ships.find((item) => item.id === shipId);
  if (!ship || ship.kind !== "powered") return null;
  const fuel = isValidShipFuel(ship.fuel) ? ship.fuel : null;
  const targetTons = fuel ? fuel.capacityTons * (targetPercent / 100) : undefined;
  const baseCheck = checkPortRefuel(state, shipId);
  const check = checkPortRefuel(state, shipId, targetTons);
  function selectTarget(percent: number) {
    setTargetPercent(percent);
    setMessage(null);
  }
  return <section className="contract-card fleet-card">
    <h3>石炭補給</h3>
    <p className="contract-card-detail">当面は全港共通120G/t。港で停泊中、依頼の精算後に補給できます。目標積載量を選び、補給ボタンで確定してください。</p>
    {fuel && targetTons !== undefined && <>
      <div className="kv"><span>現在残量</span><span>{tons(fuel.remainingTons)}</span></div>
      <div className="kv"><span>最大搭載量</span><span>{tons(fuel.capacityTons)}</span></div>
      <fieldset disabled={!baseCheck.canRefuel} style={{ border: 0, padding: 0, margin: "12px 0" }}>
        <legend>補給後の目標積載量</legend>
        <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
          <button className="btn btn-secondary" type="button" aria-pressed={targetPercent === 50}
            disabled={fuel.remainingTons > fuel.capacityTons / 2} onClick={() => selectTarget(50)}>半載（50%）</button>
          <button className="btn btn-secondary" type="button" aria-pressed={targetPercent === 100}
            onClick={() => selectTarget(100)}>満載（100%）</button>
        </div>
        <label htmlFor={sliderId}>目標：{tons(targetTons)}（{targetPercent}%）</label>
        <input id={sliderId} type="range" min={0} max={100} step={1} value={targetPercent}
          style={{ width: "100%" }} aria-valuetext={`${tons(targetTons)}、${targetPercent}%`}
          onChange={(event) => selectTarget(Number(event.target.value))} />
      </fieldset>
      <div className="kv"><span>補給予定量</span><span>{tons(Math.max(0, targetTons - fuel.remainingTons))}</span></div>
      <p className="contract-card-detail">バーは1%刻みです。半載は最大搭載量の半分で、現在残量に半分を追加する操作ではありません。石炭の積み下ろしは行いません。</p>
      {fuel.remainingTons > fuel.capacityTons / 2 && <p className="contract-card-detail">現在残量が半載を超えているため、半載ボタンは利用できません。</p>}
    </>}
    <div className="kv"><span>補給費用</span><span>{check.costGold.toLocaleString("ja-JP")}G</span></div>
    <button className="btn btn-secondary" type="button" disabled={!check.canRefuel} onClick={() => {
      setMessage(refuelShipAtPort(shipId, targetTons).message);
    }}>この量まで補給（{check.costGold.toLocaleString("ja-JP")}G）</button>
    {!check.canRefuel && <p className="contract-card-detail">{check.reason}</p>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}

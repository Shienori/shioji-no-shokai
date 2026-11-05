interface Props {
  cruisingSpeedKnots: number;
  maxSpeedKnots: number;
  selectedSpeedKnots: number;
  onChange: (speed: number) => void;
}

export function PlanSpeedSelector({ cruisingSpeedKnots: eco, maxSpeedKnots: max, selectedSpeedKnots: selected, onChange }: Props) {
  if (!Number.isSafeInteger(eco) || eco <= 0 || !Number.isSafeInteger(max) || max < eco) {
    return <p role="alert">船の速力を確認できません。</p>;
  }
  const same = eco === max;
  const validSelection = selected === eco || selected === max;
  return <fieldset className="plan-speed-selector">
    <legend>速力</legend>
    <div className="voyage-flow-actions">
      <button type="button" className="btn btn-secondary" aria-pressed={selected === eco} onClick={() => onChange(eco)}>ECO · {eco}ノット</button>
      <button type="button" className="btn btn-secondary" disabled={same} aria-pressed={!same && selected === max} onClick={() => onChange(max)}>MAX · {max}ノット</button>
    </div>
    {same && <p>この船は巡航速力と最大速力が同じです。</p>}
    {!validSelection && <p role="alert">ECOまたはMAXを選択してください。</p>}
  </fieldset>;
}

interface Props {
  economicalSpeedKnots: number;
  standardSpeedKnots: number;
  maxSpeedKnots: number;
  selectedSpeedKnots: number;
  onChange: (speed: number) => void;
}

export function PlanSpeedSelector({
  economicalSpeedKnots,
  standardSpeedKnots,
  maxSpeedKnots,
  selectedSpeedKnots: selected,
  onChange,
}: Props) {
  const speeds = [
    { label: "節約", speed: economicalSpeedKnots },
    { label: "標準", speed: standardSpeedKnots },
    { label: "全速", speed: maxSpeedKnots },
  ];

  const validSpeeds = speeds.every(({ speed }) =>
    Number.isSafeInteger(speed) && speed > 0
  );

  if (!validSpeeds) {
    return <p role="alert">船の速力を確認できません。</p>;
  }

  const validSelection = speeds.some(({ speed }) => speed === selected);

  return (
    <fieldset className="plan-speed-selector">
      <legend>速力計画</legend>
      <div className="voyage-flow-actions">
        {speeds.map(({ label, speed }) => (
          <button
            key={label}
            type="button"
            className="btn btn-secondary"
            aria-pressed={selected === speed}
            onClick={() => onChange(speed)}
          >
            {label} · {speed}ノット
          </button>
        ))}
      </div>
      {!validSelection && (
        <p role="alert">節約・標準・全速のいずれかを選択してください。</p>
      )}
    </fieldset>
  );
}

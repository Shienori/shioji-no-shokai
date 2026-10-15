interface CapacityGaugeProps {
  requiredLabel: string;
  maximumLabel: string;
  required: number;
  maximum: number;
}

export function CapacityGauge({ requiredLabel, maximumLabel, required, maximum }: CapacityGaugeProps) {
  const filledBlocks = maximum <= 0 ? 0 : Math.round(Math.min(1, required / maximum) * 20);

  return (
    <div className="ship-capacity">
      <div className="capacity-required">
        <span className="capacity-required-label">{requiredLabel}</span>
        <span className="capacity-required-value">{required}</span>
      </div>
      <div className="capacity-gauge">
        {Array.from({ length: 20 }, (_, index) => (
          <span
            key={index}
            className={`capacity-block${index < filledBlocks ? " filled" : ""}`}
          />
        ))}
      </div>
      <div className="capacity-maximum">
        <span className="capacity-label">{maximumLabel}</span>
        <span className="capacity-value">{maximum}</span>
      </div>
    </div>
  );
}

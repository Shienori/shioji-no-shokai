import { formatCargoMeasure } from "../../domain/cargoPresentation";

interface CapacityGaugeProps {
  requiredLabel: string;
  maximumLabel: string;
  required: number;
  maximum: number | null;
  unit?: "t" | "m³";
}

export function CapacityGauge({ requiredLabel, maximumLabel, required, maximum, unit }: CapacityGaugeProps) {
  const usable = maximum !== null && Number.isFinite(maximum) && maximum > 0 && Number.isFinite(required) && required >= 0;
  const filledBlocks = usable ? Math.round(Math.min(1, required / maximum!) * 20) : 0;
  const requiredText = unit ? formatCargoMeasure(required, unit) : String(required);
  const maximumText = maximum === null || !Number.isFinite(maximum) ? "—" : unit ? formatCargoMeasure(maximum, unit) : String(maximum);

  return (
    <div className="ship-capacity">
      <div className="capacity-required">
        <span className="capacity-required-label">{requiredLabel}</span>
        <span className="capacity-required-value">{requiredText}</span>
      </div>
      <div className="capacity-gauge" role="img" aria-label={`${requiredLabel} ${requiredText}、${maximumLabel} ${maximumText}`}>
        {Array.from({ length: 20 }, (_, index) => (
          <span
            key={index}
            className={`capacity-block${index < filledBlocks ? " filled" : ""}`}
          />
        ))}
      </div>
      <div className="capacity-maximum">
        <span className="capacity-label">{maximumLabel}</span>
        <span className="capacity-value">{maximumText}</span>
      </div>
    </div>
  );
}

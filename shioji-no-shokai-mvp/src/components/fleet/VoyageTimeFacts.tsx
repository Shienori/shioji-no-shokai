import type { AcceptedContract, Voyage } from "../../domain/types";
import type { VoyageDisplayClock, VoyageTimePresentation } from "../../domain/voyageTimePresentation";
import { getVoyageTimePresentation } from "../../domain/voyageTimePresentation";
import { getCargoForContract } from "../../domain/lotContract";

interface Props {
  voyage: Voyage;
  contract: AcceptedContract | null;
  clock: VoyageDisplayClock;
}

/** Parents must validate the full confirmed plan before rendering this component. */
export function VoyageTimeFacts({ voyage, contract, clock }: Props) {
  let model: VoyageTimePresentation;
  if (!clock) {
    model = { kind: "unavailable", label: "時刻情報", value: "確認できません",
      notice: "表示基準の時計を確認できません。" };
  } else {
    let duration: number | null = null;
    if (voyage.phase === "unloading" && contract && voyage.contractId === contract.id) {
      try {
        const cargo = getCargoForContract(contract);
        duration = cargo.unloadingTimeMsPerUnit * contract.quantity;
      } catch {
        // Invalid saved cargo must not fall back to a newly generated specification.
      }
    }
    model = getVoyageTimePresentation({ voyage, contract, clock,
      unloadingDurationOperationMs: duration });
  }
  if (model.kind === "none") return null;
  const notice = model.kind === "time" || model.kind === "unavailable" ? model.notice : null;
  return <div data-voyage-time-kind={model.kind}
    data-voyage-time-basis={model.kind === "time" ? model.basis : undefined}
    data-voyage-time-ms={model.kind === "time" ? model.realTimeMs : undefined}>
    <div className="contract-facts">
      <div><span className="contract-fact-label">{model.label}</span>
        <span className="contract-fact-value">{model.value}</span></div>
    </div>
    {notice && <p className="contract-card-detail"
      role={model.kind === "unavailable" ? "alert" : undefined}>{notice}</p>}
  </div>;
}

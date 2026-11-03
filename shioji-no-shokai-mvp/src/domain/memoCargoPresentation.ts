import type { AcceptedContract, Voyage, VoyageMemo } from "./types";
import type { CargoLotSnapshot } from "./cargoLotUnits";
import { getCargoPresentation } from "./cargoPresentation";

export function getMemoCargoPresentation(memo: VoyageMemo, contract: AcceptedContract | null, voyage: Voyage | null) {
  if (Object.prototype.hasOwnProperty.call(memo, "cargoLotSnapshot")) {
    const raw = (memo as VoyageMemo & { cargoLotSnapshot?: unknown }).cargoLotSnapshot;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const s = raw as CargoLotSnapshot;
      const display = getCargoPresentation({ cargoId: s.cargoId, quantity: s.quantityLots, acceptedAt: memo.acceptedAt, cargoLotSnapshot: s });
      if (display) return { label: display.label, weightLabel: display.weightLabel, volumeLabel: display.volumeLabel, sourceLabel: "航海履歴に保存された値" };
    }
    return { label: memo.cargoLabel, weightLabel: "確認不可", volumeLabel: "確認不可", sourceLabel: "履歴の単位データが不正です。旧単位へ置き換えていません" };
  }
  if (contract?.id === memo.contractId && voyage?.contractId === memo.contractId && voyage.shipId === memo.shipId) {
    const display = getCargoPresentation(contract);
    if (display) return { label: display.label, weightLabel: display.weightLabel, volumeLabel: display.volumeLabel, sourceLabel: "進行中契約の保存値（履歴への独立保存ではありません）" };
    return { label: memo.cargoLabel, weightLabel: "確認不可", volumeLabel: "確認不可", sourceLabel: "進行中契約の貨物データを確認できません" };
  }
  return {
    label: memo.cargoLabel, weightLabel: "未記録", volumeLabel: "未記録",
    sourceLabel: "保存時の表記。重量・容積・ロット単位の記録がないため、現在の貨物データから換算しません",
  };
}

export function getVoyageMemoStatus(memo: VoyageMemo, voyage: Voyage | null): string {
  if (memo.fuelDepletionReturn) return "契約破棄（燃料切れ）";
  if (memo.settlement) return "精算済み";
  if (voyage?.contractId === memo.contractId && voyage.shipId === memo.shipId) {
    if (voyage.phase === "completed") return "精算待ち";
    if (voyage.phase === "loading") return "積込中";
    if (voyage.phase === "unloading") return "荷卸中";
    return "航海中";
  }
  return "記録済み（終了状態未記録）";
}

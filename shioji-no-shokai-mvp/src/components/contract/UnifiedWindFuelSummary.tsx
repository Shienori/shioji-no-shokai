import type { ContractWindPreview } from "../../domain/contractWindPreview";
import { formatContractPreviewEta } from "../../domain/contractWindPreview";
import { formatDateTime } from "../../domain/time";

export function UnifiedWindFuelSummary({ preview }: { preview: ContractWindPreview | null }) {
  if (!preview || preview.kind === "unavailable") return <p role="status">{preview?.message ?? "船を選択してください。"}</p>;
  const p = preview.prediction;
  return <section aria-label="共通の数値風予測による石炭試算" aria-live="polite">
    <h4>数値風予報・石炭試算</h4>
    <p>閲覧基準：{formatDateTime(preview.previewAt)}／予報発行：{p.forecastIssuedAt === null ? "利用不可" : formatDateTime(p.forecastIssuedAt)}</p>
    <div className="kv"><span>積込後の出港予定</span><span>{formatDateTime(preview.input.departureRealTime)}</span></div>
    <div className="kv"><span>設定速力・積載倍率</span><span>{preview.input.selectedSpeedKnots}ノット・{preview.input.loadSpeedFactor}倍</span></div>
    <div className="kv"><span>予測ETA（港到着）</span><span>{formatContractPreviewEta(preview)}</span></div>
    <div className="kv"><span>現在の石炭</span><span>{preview.input.state.fuelRemaining.toFixed(3)} t</span></div>
    <div className="kv"><span>{p.etaRealTime === null ? "予測可能な範囲の消費" : "到着までの予測消費"}</span><span>{p.totalForecastFuelUsed.toFixed(3)} t</span></div>
    <div className="kv"><span>{p.etaRealTime === null ? "計算終了時の予測残量" : "到着時の予測残量"}</span><span>{p.forecastFuelRemaining.toFixed(3)} t</span></div>
    {p.forecastIssue && <p role="status">{p.forecastIssue === "insufficientFuel" ? "石炭不足の予測です。到着ETAは予測不可です。" : "予報の範囲・内容が不足しているため、到着ETAは予測不可です。"}</p>}
    <p>予報マップと受注確認ETAはこの試算と同じ条件です。積込時間を含み、荷卸し時間は含みません。受注確定時にはその時点の予報が別に保存されるため、閲覧時刻や予報更新により結果は変わります。試算操作で実際の石炭・所持金は変更しません。</p>
  </section>;
}

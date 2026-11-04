import { useId, useRef, useState } from "react";
import type { Voyage } from "../../domain/types";
interface Props {
  voyage: Voyage | null;
  planningOpen: boolean;
  onAdvance?: () => Promise<string> | string;
}
export function NextVoyageBoundaryButton({ voyage, planningOpen, onAdvance }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const helpId = useId();
  const statusId = useId();
  const reason = planningOpen ? "航海計画を閉じてから使用してください。"
    : !voyage ? "進行中の航海がありません。依頼を受注すると使用できます。"
    : voyage.phase === "completed" || voyage.settled ? "航海は完了しています。通常の精算操作を行ってください。"
    : voyage.plannedNavigation === undefined ? "確定計画を使った航海が対象です。"
    : !onAdvance ? "時計・保存への接続待ちです。現在は画面のみで、時間を進める操作は無効です。" : null;
  async function advance() {
    if (locked.current || reason || !onAdvance) return;
    locked.current = true;
    setBusy(true); setMessage("");
    try { setMessage(await onAdvance()); }
    catch (error) { setMessage(`次の区切りへの移動に失敗しました。${error instanceof Error ? error.message : "状態を確認してください。"}`); }
    finally { locked.current = false; setBusy(false); }
  }
  return <section aria-label="次の区切りへ進めるデバッグ操作" style={{ padding: "8px 16px" }} aria-busy={busy}>
    <button className="btn btn-secondary" type="button" disabled={busy || reason !== null} aria-describedby={`${helpId} ${statusId}`} onClick={advance}>
      {busy ? "デバッグ: 次の区切りへ進行中…" : "デバッグ: 次の区切りへ進める"}
    </button>
    <p id={helpId} style={{ fontSize: 12, color: "var(--sub)", marginTop: 6 }}>
      {reason ?? "積込完了・途中寄港と補油・目的港到着・荷卸完了・燃料切れ帰還の、次の区切りまで進めます。精算は自動確定しません。"}
    </p>
    <p id={statusId} role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: 12, marginTop: 6 }}>{busy ? "処理が終わるまでお待ちください。" : message}</p>
  </section>;
}

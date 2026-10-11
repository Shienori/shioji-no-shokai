export default function VoyageTime({
  remainingGameMs,
  etaGameTimeMs,
  unloadCompleteGameTimeMs,
  dueGameTimeMs,
}: {
  remainingGameMs: number;
  etaGameTimeMs: number;
  unloadCompleteGameTimeMs: number;
  dueGameTimeMs: number;
}) {
  return (
    <div className="voyage-time">
      <p className="remaining">
        残り時間：{formatGameDuration(remainingGameMs)}
      </p>
      <p>到着予定：{formatGameTime(etaGameTimeMs)}</p>
      <p>積み下ろし完了予定：{formatGameTime(unloadCompleteGameTimeMs)}</p>
      <p className={dueClassName(remainingGameMs)}>
        納期：{formatGameTime(dueGameTimeMs)}
      </p>
    </div>
  );
}

function formatGameDuration(ms: number) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}時間${minutes}分`;
}

function formatGameTime(ms: number) {
  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function dueClassName(remainingGameMs: number) {
  if (remainingGameMs <= 0) return "due-overdue";
  if (remainingGameMs < 2 * 60 * 60 * 1000) return "due-warning";
  return "due";
}

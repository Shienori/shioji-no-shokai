import { useEffect, useState } from "react";
import VoyageTime from "./VoyageTime";

const GAME_TIME_MULTIPLIER = 6;

export default function SailingScreen({ onArrive }: { onArrive: () => void }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startedAtRealMs = now - 60 * 60 * 1000;
  const durationGameMs = 6 * 60 * 60 * 1000;

  const elapsedGameMs =
    Math.max(0, now - startedAtRealMs) * GAME_TIME_MULTIPLIER;

  const remainingGameMs = Math.max(0, durationGameMs - elapsedGameMs);
  const progress = Math.min(1, elapsedGameMs / durationGameMs);

  return (
    <div className="screen">
      <VoyageTime
        remainingGameMs={remainingGameMs}
        etaGameTimeMs={now + durationGameMs}
        unloadCompleteGameTimeMs={now + durationGameMs}
        dueGameTimeMs={now + durationGameMs}
      />

      <progress
        className={
          remainingGameMs <= 0
            ? "voyage-progress-overdue"
            : remainingGameMs < 2 * 60 * 60 * 1000
            ? "voyage-progress-warning"
            : "voyage-progress"
        }
        max={1}
        value={progress}
      />

      {progress >= 1 && <button onClick={onArrive}>到着</button>}
    </div>
  );
}

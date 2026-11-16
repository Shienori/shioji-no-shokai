import { useEffect, useState } from "react";
import {
  clearDebugLogs,
  getDebugLogs,
  subscribeDebugLogs,
  type DebugLogEntry,
} from "../../state/debugLog";

const LEVEL_LABELS: Record<DebugLogEntry["level"], string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

export function DebugLogPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<DebugLogEntry[]>(getDebugLogs());

  useEffect(() => {
    return subscribeDebugLogs(() => {
      setLogs(getDebugLogs());
    });
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setIsOpen((value) => !value)}
        >
          デバッグログ
        </button>
        {isOpen && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={clearDebugLogs}
          >
            クリア
          </button>
        )}
      </div>

      {isOpen && (
        <div className="max-h-80 w-80 overflow-y-auto rounded-lg border border-slate-300 bg-white/95 p-3 text-xs shadow-lg">
          {logs.length === 0 ? (
            <p className="text-slate-500">ログはまだありません。</p>
          ) : (
            <ul className="space-y-2">
              {logs
                .slice()
                .reverse()
                .map((log) => (
                  <li
                    key={log.id}
                    className={
                      log.level === "error"
                        ? "rounded border border-red-300 bg-red-50 p-2"
                        : "rounded border border-slate-200 bg-slate-50 p-2"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{log.scope}</span>
                      <span
                        className={
                          log.level === "error"
                            ? "text-red-600"
                            : log.level === "warn"
                              ? "text-amber-600"
                              : "text-slate-500"
                        }
                      >
                        {LEVEL_LABELS[log.level]}
                      </span>
                    </div>

                    <p className="mt-1">{log.message}</p>

                    {log.data !== undefined && (
                      <pre className="mt-2 max-h-32 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-100">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}

                    {log.error && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-red-700">
                          エラー詳細
                        </summary>
                        <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-900 p-2 text-[10px] text-slate-100">
                          {`${log.error.name}: ${log.error.message}\n\n${log.error.stack ?? ""}`}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

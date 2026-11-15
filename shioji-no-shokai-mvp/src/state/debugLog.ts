export type DebugLogLevel = "info" | "warn" | "error" | "debug";

export interface DebugLogEntry {
  id: number;
  at: number;
  level: DebugLogLevel;
  scope: string;
  message: string;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const MAX_LOGS = 200;
let nextLogId = 1;
let logs: DebugLogEntry[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getDebugLogs(): DebugLogEntry[] {
  return logs;
}

export function subscribeDebugLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearDebugLogs(): void {
  logs = [];
  notify();
}

function pushLog(entry: Omit<DebugLogEntry, "id" | "at">): void {
  logs = [
    ...logs.slice(-(MAX_LOGS - 1)),
    {
      ...entry,
      id: nextLogId,
      at: Date.now(),
    },
  ];
  notify();
}

export function logDebug(scope: string, message: string, data?: unknown): void {
  pushLog({ level: "debug", scope, message, data });
}

export function logInfo(scope: string, message: string, data?: unknown): void {
  pushLog({ level: "info", scope, message, data });
}

export function logWarn(scope: string, message: string, data?: unknown): void {
  pushLog({ level: "warn", scope, message, data });
}

export function logError(
  scope: string,
  message: string,
  error: unknown,
  data?: unknown,
): void {
  const normalizedError =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : {
          name: "UnknownError",
          message: String(error),
          stack: undefined,
        };

  pushLog({
    level: "error",
    scope,
    message,
    data,
    error: normalizedError,
  });
}

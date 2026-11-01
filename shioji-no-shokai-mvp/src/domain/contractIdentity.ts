let sequence = 0;

/** Instance identity is independent of template identity and wall-clock time. */
export function createContractInstanceId(kind: "offer" | "accepted"): string {
  sequence += 1;
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}_${randomId}_${sequence.toString(36)}`;
}

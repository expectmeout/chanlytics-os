import type { BatchCarry } from "@chanlytics/core";

/** What the run has waited through rides in the payload to the next batch, and only while it is running. */
export function nextBatch(id: string, carry: BatchCarry | undefined): Record<string, string | number> {
  return {
    broadcast_id: id,
    ...(carry?.waits ? { waits: carry.waits } : {}),
    ...(carry?.stalls ? { stalls: carry.stalls } : {}),
  };
}

/** What this batch's job carries of the run so far: how many waits, how many stalls; anything but a count is none. */
export function carriedBy(payload: unknown): Required<BatchCarry> {
  const p: { waits?: unknown; stalls?: unknown } = payload !== null && typeof payload === "object" ? payload : {};
  const count = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0);
  return { waits: count(p.waits), stalls: count(p.stalls) };
}

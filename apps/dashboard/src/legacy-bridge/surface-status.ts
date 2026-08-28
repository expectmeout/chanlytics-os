/**
 * Which surfaces hold REAL data right now, and which tried and failed.
 *
 * This is the seam's whole honesty guarantee reduced to three sets, and it
 * lives alone in this file for two reasons: it is the piece that has broken
 * twice, and it is pure — no Supabase, no DOM, no React — so a test can drive
 * it directly instead of reaching into a module full of side effects.
 *
 * The distinction that matters is READY vs SETTLED. An earlier version marked
 * a surface ready inside setStatus regardless of outcome, so a boot that
 * FAILED still opened the route gate and the surface painted the mockup's
 * seeds as though they were the customer's data: Today claiming "$1,840 booked
 * across 12 appointments", the Inbox listing eleven invented people with
 * working Snooze buttons. Permanently, because the focus-refetch skipped
 * seeded surfaces. Only a real payload may open the gate.
 *
 * Status semantics:
 *   seeded   — boot failed or never ran; the surface has no real data
 *   live     — real data, current
 *   degraded — real data, stale (a refresh failed after a good load)
 *
 * "degraded" may only ever describe a surface that HAS real data; calling a
 * never-loaded surface stale would upgrade the lie rather than tell it.
 */
export type SurfaceStatus = "seeded" | "live" | "degraded";

const statuses = new Map<string, SurfaceStatus>();
const ready = new Set<string>();
const failed = new Set<string>();
const listeners = new Set<() => void>();

export function setStatus(key: string, s: SurfaceStatus): void {
  if (s === "seeded") failed.add(key);
  else {
    failed.delete(key);
    ready.add(key); // only a real payload opens the gate
  }
  if (statuses.get(key) !== s) statuses.set(key, s);
  listeners.forEach((l) => l());
}

/** Seed the ready set with what the cache restored before React mounted. */
export function markHydrated(keys: Iterable<string>): void {
  for (const k of keys) ready.add(k);
}

export function isSurfaceReady(key: string): boolean {
  return ready.has(key);
}

/** True when this surface tried and could not get real data. The shell paints
 *  "can't reach your workspace" instead of the mockup's seeds. */
export function isSurfaceFailed(key: string): boolean {
  return failed.has(key) && !ready.has(key);
}

export function getSurfaceStatuses(): ReadonlyMap<string, SurfaceStatus> {
  return statuses;
}

export function onSurfaceStatusChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

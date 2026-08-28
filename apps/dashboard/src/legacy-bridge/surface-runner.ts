/**
 * The SurfaceData runner: one place that owns apply-with-retry, the shared
 * realtime subscription, per-surface debounce, degraded-state tracking,
 * session-expiry redirects, and focus/reconnect refetch. Flipping the next
 * surface = write its override in surface-data.ts and add it to the array in
 * LegacyApp — nothing else.
 *
 * Status semantics: "seeded" (boot apply failed or never ran — surface shows
 * seed data), "live" (real data), "degraded" (was live; a refresh failed —
 * data is real but stale).
 */
import { createClient } from "@/lib/supabase/client";
import { subscribeMessagesInserts } from "@chanlytics/db";
import { activateOverride, UnauthorizedError, type SurfaceOverride } from "./surface-data";
import { cachedTenant, clearSurfaceCache, snapshotSurface } from "./surface-cache";

export type SurfaceStatus = "seeded" | "live" | "degraded";

const statuses = new Map<string, SurfaceStatus>();
const listeners = new Set<() => void>();

/**
 * Surfaces that hold REAL DATA right now — restored from cache before first
 * paint, or fetched successfully. The route gate opens on this.
 *
 * "Ready" is NOT "settled". The original version added to this set inside
 * setStatus, so a boot that FAILED still opened the gate — and the surface
 * painted the mockup's seeds as though they were the customer's data: Today
 * claiming "$1,840 booked across 12 appointments", the Inbox listing eleven
 * invented people with working Snooze buttons. Permanently, because the
 * focus-refetch below used to skip seeded surfaces. A failed fetch must never
 * be able to present fabricated data as real.
 */
const ready = new Set<string>();
/** Surfaces whose boot genuinely failed — the shell shows an honest pane. */
const failed = new Set<string>();

function setStatus(key: string, s: SurfaceStatus) {
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

/**
 * The running runner's refresh, published so callers outside it use the SAME
 * path. The verb courier used to call activateOverride directly, which skips
 * persist, skips setStatus and swallows the 401 — so after a snooze or a
 * take-over (the verbs with no message row to trigger realtime) the cache kept
 * the PRE-verb snapshot and the next reload painted the thread back into
 * "Needs you", under a pill still claiming "live".
 */
let activeRefresh: ((o: SurfaceOverride) => Promise<void>) | null = null;

export async function refreshSurfaces(overrides: SurfaceOverride[]): Promise<void> {
  const fn = activeRefresh;
  if (!fn) return; // no runner mounted (standalone mockup) — nothing to sync
  await Promise.all(overrides.map((o) => fn(o)));
}

export function getSurfaceStatuses(): ReadonlyMap<string, SurfaceStatus> {
  return statuses;
}

export function onSurfaceStatusChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let runnerSeq = 0;

export function startSurfaces(overrides: SurfaceOverride[]): () => void {
  // Read the cached identity BEFORE any boot can overwrite it. Every
  // successful boot persists with the CURRENT tenant, and snapshotSurface
  // assigns blob.tenant on every write — so the old guard, which read the
  // cache after Promise.all, always compared a value against itself and could
  // never fire.
  const cachedAtBoot = cachedTenant();
  let cancelled = false;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const topic = `bridge-${++runnerSeq}`; // unique per runner: StrictMode double-mounts never collide

  const onUnauthorized = () => {
    // Cached customer data must never outlive the session allowed to see it.
    clearSurfaceCache();
    if (!cancelled) window.location.assign("/login");
  };

  const tenantId = () =>
    (window as unknown as { __WORKSPACES?: Array<{ id: string }> }).__WORKSPACES?.[0]?.id ?? null;

  const persist = (o: SurfaceOverride) => {
    if (o.globals?.length) snapshotSurface(o.key, o.globals, tenantId());
  };

  const refresh = async (o: SurfaceOverride, phase: "boot" | "refresh") => {
    try {
      const ok = await activateOverride(o);
      if (cancelled) return;
      if (ok) {
        persist(o);
        setStatus(o.key, "live");
      } else if (phase === "boot" || !ready.has(o.key)) {
        // "degraded" means "real but stale" — it may only describe a surface
        // that HAS real data. A failed refresh of a never-loaded surface is
        // still just failed, and saying otherwise upgrades the lie.
        setStatus(o.key, "seeded");
      } else setStatus(o.key, "degraded");
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized();
    }
  };

  const boot = async (o: SurfaceOverride) => {
    try {
      let ok = await activateOverride(o);
      if (!ok && !cancelled) {
        await new Promise((r) => setTimeout(r, 800)); // one retry covers boot blips
        if (cancelled) return;
        ok = await activateOverride(o);
      }
      if (cancelled) return;
      if (ok) persist(o);
      setStatus(o.key, ok ? "live" : "seeded");
    } catch (e) {
      if (e instanceof UnauthorizedError) onUnauthorized();
      else if (!cancelled) setStatus(o.key, "seeded");
    }
  };

  activeRefresh = (o: SurfaceOverride) => refresh(o, "refresh");

  const scheduleRefresh = (o: SurfaceOverride) => {
    const prev = timers.get(o.key);
    if (prev) clearTimeout(prev);
    timers.set(
      o.key,
      setTimeout(() => void refresh(o, "refresh"), o.debounceMs ?? 400),
    );
  };

  const realtimeOverrides = overrides.filter((o) => o.refreshOnMessageInserts);
  let unsubscribe: (() => void) | null = null;
  let everSubscribed = false;

  // Restored cache belongs to whoever was signed in when it was written. If a
  // different workspace comes back, that data was never theirs to see: drop it
  // and reload rather than leave another tenant's rows on screen.
  const guardTenant = () => {
    const cached = cachedAtBoot;
    const actual = tenantId();
    if (cached && actual && cached !== actual) {
      clearSurfaceCache();
      window.location.reload();
      return true;
    }
    return false;
  };

  void Promise.all(overrides.map(boot)).then(() => {
    if (cancelled) return;
    if (guardTenant()) return;
    if (!realtimeOverrides.length) return;
    const supabase = createClient();
    unsubscribe = subscribeMessagesInserts(
      supabase,
      () => realtimeOverrides.forEach(scheduleRefresh),
      {
        topic,
        onStatus: (status) => {
          if (status === "SUBSCRIBED") {
            // reconnect after sleep/offline: postgres_changes has no backfill,
            // so refetch to close the gap
            if (everSubscribed) realtimeOverrides.forEach(scheduleRefresh);
            everSubscribed = true;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("realtime_status", topic, status);
          }
        },
      },
    );
  });

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    // A failed surface is the one that MOST needs retrying — it used to be the
    // one excluded, which is how a boot blip became permanent for the session.
    overrides.forEach(scheduleRefresh);
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    cancelled = true;
    activeRefresh = null;
    document.removeEventListener("visibilitychange", onVisible);
    timers.forEach((t) => clearTimeout(t));
    if (unsubscribe) unsubscribe();
  };
}

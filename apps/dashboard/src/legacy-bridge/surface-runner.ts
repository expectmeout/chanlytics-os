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
 * Surfaces that hold real data RIGHT NOW — either restored from cache before
 * first paint, or settled by a boot attempt. Distinct from `statuses`: a
 * cache-hydrated surface is showing real data long before its revalidation
 * finishes, and must not be made to wait behind a loading state.
 */
const ready = new Set<string>();

function setStatus(key: string, s: SurfaceStatus) {
  ready.add(key); // boot settled: whatever it shows now is what it will show
  if (statuses.get(key) === s) {
    listeners.forEach((l) => l());
    return;
  }
  statuses.set(key, s);
  listeners.forEach((l) => l());
}

/** Seed the ready set with what the cache restored before React mounted. */
export function markHydrated(keys: Iterable<string>): void {
  for (const k of keys) ready.add(k);
}

export function isSurfaceReady(key: string): boolean {
  return ready.has(key);
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
      } else if (phase === "boot") setStatus(o.key, "seeded");
      else setStatus(o.key, "degraded");
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
    const cached = cachedTenant();
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
    if (document.visibilityState === "visible") {
      overrides.filter((o) => statuses.get(o.key) !== "seeded").forEach(scheduleRefresh);
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    cancelled = true;
    document.removeEventListener("visibilitychange", onVisible);
    timers.forEach((t) => clearTimeout(t));
    if (unsubscribe) unsubscribe();
  };
}

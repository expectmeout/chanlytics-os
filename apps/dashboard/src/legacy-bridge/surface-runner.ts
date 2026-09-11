/**
 * The SurfaceData runner: one place that owns apply-with-retry, the shared
 * realtime subscription, per-surface debounce, degraded-state tracking,
 * session-expiry redirects, and focus/reconnect refetch. Flipping the next
 * surface = write its override in surface-data.ts and add it to the array in
 * LegacyApp — nothing else.
 *
 * The ready/failed/status bookkeeping this file drives lives in
 * ./surface-status, which is pure and unit-tested; everything here is the
 * side-effecting half.
 */
import { createClient } from "@/lib/supabase/client";
import { subscribeMessagesInserts } from "@chanlytics/db";
import { activateOverride, type SurfaceOverride } from "./surface-data";
import { ApiError } from "../client/api";
import { cachedTenant, clearSurfaceCache, snapshotSurface } from "./surface-cache";
import { isSurfaceReady, setStatus } from "./surface-status";
import { subscribesToRealtime, wantsRefresh } from "./surface-realtime";
import { getActiveWorkspace } from "./workspace";

// Re-exported so consumers keep importing the seam from one place.
export {
  getSurfaceStatuses,
  isSurfaceFailed,
  isSurfaceReady,
  markHydrated,
  onSurfaceStatusChange,
  type SurfaceStatus,
} from "./surface-status";

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

  // The cache is keyed on this, so it must be the workspace actually being
  // viewed — the one the server resolved — or nothing. Keyed on
  // `__WORKSPACES[0]` it was constant for a member of two workspaces, and the
  // guard that exists to stop one tenant's rows being restored under
  // another's name would never have fired.
  const tenantId = () => (window as unknown as { __ACTIVE_WORKSPACE?: string }).__ACTIVE_WORKSPACE ?? null;

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
      } else if (phase === "boot" || !isSurfaceReady(o.key)) {
        // "degraded" means "real but stale" — it may only describe a surface
        // that HAS real data. A failed refresh of a never-loaded surface is
        // still just failed, and saying otherwise upgrades the lie.
        setStatus(o.key, "seeded");
      } else setStatus(o.key, "degraded");
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") onUnauthorized();
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
      if (ok) {
        persist(o);
        setStatus(o.key, "live");
      } else if (isSurfaceReady(o.key)) {
        // The cache already restored REAL rows for this surface before React
        // mounted, and both boot attempts then failed. Recording "seeded"
        // there is the one thing that is not true: yesterday's real
        // conversations were on screen under a status meaning "no real data",
        // so the pill showed neither live nor stale. `refresh` has always used
        // this rule; boot did not.
        setStatus(o.key, "degraded");
      } else {
        setStatus(o.key, "seeded");
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "unauthorized") onUnauthorized();
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

  const realtimeOverrides = overrides.filter(subscribesToRealtime);
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

  // The boot. On a workspace page (/w/<slug>) the surfaces fire at once, the
  // name riding on every request. Off one — the home before it has sent the
  // tab on, the create screen — the workspace surface goes first and the rest
  // wait for its answer, so no read is issued that the server would have to
  // guess at; and it does not guess: an unnamed read from an account in two
  // workspaces is refused (plan 3.4).
  const workspaceFirst = getActiveWorkspace() ? null : overrides.find((o) => o.key === "workspace") ?? null;
  const booted = workspaceFirst
    ? boot(workspaceFirst).then(() => Promise.all(overrides.filter((o) => o !== workspaceFirst).map(boot)))
    : Promise.all(overrides.map(boot));
  void booted.then(() => {
    if (cancelled) return;
    if (guardTenant()) return;
    if (!realtimeOverrides.length) return;
    const supabase = createClient();
    // Scoped to the workspace this tab shows. RLS authorises the events
    // server-side; the filter is what makes the subscription this
    // workspace's and nobody else's, so a member of two workspaces neither
    // receives nor repaints on the other one's rows. The topic carries the
    // workspace too, so a switch is a new channel, never a shared one.
    const ws = tenantId();
    unsubscribe = subscribeMessagesInserts(
      supabase,
      // Routed by table: a live call's transcript turns repaint Live, not the
      // five surfaces that never asked (three of them plpgsql aggregates).
      (row, table, event) =>
        realtimeOverrides
          .filter((o) => wantsRefresh(o, table, { table, event: event ?? "*", row: row as Record<string, unknown> }))
          .forEach(scheduleRefresh),
      {
        topic: ws ? `${topic}:${ws}` : topic,
        tenantId: ws ?? undefined,
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

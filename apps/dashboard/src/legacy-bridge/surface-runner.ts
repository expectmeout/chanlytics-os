/**
 * The SurfaceData runner: one place that owns apply-with-retry, the shared
 * realtime subscription, per-surface debounce, degraded-state tracking,
 * session-expiry redirects, focus/reconnect refetch, and what the shell is
 * told about the connection. Flipping the next surface = write its override in
 * surface-data.ts and add it to the array in LegacyApp — nothing else.
 *
 * The ready/failed/status bookkeeping this file drives lives in
 * ./surface-status, which is pure and unit-tested; everything here is the
 * side-effecting half.
 */
import { createClient } from "@/lib/supabase/client";
import { subscribeMessagesInserts } from "@chanlytics/db";
import { activateOverride, type SurfaceOverride } from "./surface-data";
import { ApiError } from "../client/api";
import { api } from "./api";
import { cachedTenant, clearSurfaceCache, snapshotSurface } from "./surface-cache";
import { isSurfaceReady, setConnection, setStatus } from "./surface-status";
import { ROUTE_DRAWS, routeSurfaceFor } from "./surface-registry";
import { feedWatch, REALTIME_GRACE_MS, subscribesToRealtime, wantsRefresh } from "./surface-realtime";
import { getActiveWorkspace, signInHref } from "./workspace";

// Re-exported so consumers keep importing the seam from one place.
export {
  getConnection,
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
/** The running runner's surfaces: what the shell's Retry reads again. */
let activeOverrides: SurfaceOverride[] = [];

export async function refreshSurfaces(overrides: SurfaceOverride[]): Promise<void> {
  const fn = activeRefresh;
  if (!fn) return; // no runner mounted (standalone mockup) — nothing to sync
  await Promise.all(overrides.map((o) => fn(o)));
}

/** The shell's Retry: every surface the running runner holds, read again now. */
export async function refreshAllSurfaces(): Promise<void> {
  await refreshSurfaces(activeOverrides);
}

/**
 * How many surfaces boot at once.
 *
 * Every surface used to boot in one Promise.all. On the salon's workspace that
 * is 23 requests fired in the same millisecond, and the last of them answered
 * 7.8 SECONDS after the page loaded -- `settings` alone took 7,450ms. The
 * endpoints are not slow: measured one at a time on the same tab the same
 * minute, `settings` answers in 488ms and five together finish in 568ms. The
 * whole of that 7.8s was twenty-three cold functions competing.
 *
 * Four lanes is enough to keep the connection busy and few enough that nothing
 * starves. Everything still boots, and no surface is dropped or deferred to a
 * later trip -- they queue instead of stampeding.
 */
const BOOT_LANES = 4;

/** Run `work` over `items`, at most `lanes` at a time, in order. */
async function inLanes<T>(items: readonly T[], lanes: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = items.slice();
  const lane = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return;
      await work(next);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, lane));
}

/**
 * The order a pass reads surfaces in: the surface the address is asking for
 * first, then the ones its page draws beside it in the page's own order
 * (surface-registry.ts ROUTE_DRAWS), then the rest.
 *
 * Loading twelve surfaces nobody is looking at ahead of the one they are is
 * backwards; so was reading Settings, People and Leads ahead of the calendar
 * Today's day card is drawn from, which landed 1.6 s after the queue beside it.
 * Parsed the way the shell parses it (app-shell.jsx parseHash). A route that
 * owns no surface ranks nothing first, which costs nothing: the order is only
 * a preference.
 */
function screenRank(win: Window): (o: SurfaceOverride) => number {
  const raw = (win.location.hash || "#/today").replace(/^#[/]?/, "");
  const [page, param] = raw.split("/");
  const wanted = routeSurfaceFor(page || "today", param || null);
  const drawn = ROUTE_DRAWS[page || "today"] ?? [];
  return (o) => (o.key === wanted ? 0 : drawn.includes(o.key) ? 1 + drawn.indexOf(o.key) : 1 + drawn.length);
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
    // The page's hash goes along, so signing in again lands where they were.
    if (!cancelled) window.location.assign(signInHref(window.location.hash));
  };

  // The cache is keyed on this, so it must be the workspace actually being
  // viewed — the one the server resolved — or nothing. Keyed on
  // `__WORKSPACES[0]` it was constant for a member of two workspaces, and the
  // guard that exists to stop one tenant's rows being restored under
  // another's name would never have fired.
  const tenantId = () => (window as unknown as { __ACTIVE_WORKSPACE?: string }).__ACTIVE_WORKSPACE ?? null;

  const persist = (o: SurfaceOverride) => {
    if (o.globals?.length) snapshotSurface(o.key, o.globals, tenantId(), o.trimSnapshot);
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
  activeOverrides = overrides;

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
  // What the live feed's own reports mean for the page (surface-realtime.ts):
  // a rejoin reads the gap, and a drop that outlasts the grace is the shell's
  // to say.
  const feed = feedWatch({
    graceMs: REALTIME_GRACE_MS,
    onDown: (down) => setConnection({ realtimeDown: down }),
    // reconnect after sleep/offline: postgres_changes has no backfill, so
    // refetch to close the gap
    onReconnect: () => realtimeOverrides.forEach(scheduleRefresh),
  });

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
  const workspaceFirst = getActiveWorkspace() ? null : (overrides.find((o) => o.key === "workspace") ?? null);
  // Who you are, then what you are looking at, then the rest -- through four
  // lanes rather than all at once. Identity leads even on a workspace page,
  // where it does not BLOCK the others: the shell reads __ME to decide what a
  // role may see, so letting it queue behind three strangers would draw the
  // nav for the wrong role and then correct it.
  const screen = screenRank(window);
  const rank = (o: SurfaceOverride) => (o.key === "workspace" ? 0 : 1 + screen(o));
  const queued = [...overrides].sort((x, y) => rank(x) - rank(y));
  // Surfaces read the same lists in turn -- the calls, the templates, the contacts, and on Leads the page the view
  // asks for again as it mounts. Measured on the salon's Leads page: 31 reads at boot, 20 distinct, because a read
  // that had settled was not shared with the one asking a moment later. Every answer is held until the last surface
  // is in, and let go before the live feed is joined: nothing can change inside the hold without a write (which lets
  // go of it) or an event the feed would not yet have delivered anyway.
  const releaseAnswers = api().holdAnswers();
  const booted = workspaceFirst
    ? boot(workspaceFirst).then(() =>
        inLanes(
          queued.filter((o) => o !== workspaceFirst),
          BOOT_LANES,
          boot,
        ),
      )
    : inLanes(queued, BOOT_LANES, boot);
  void booted.then(() => {
    releaseAnswers();
    if (cancelled) return;
    if (guardTenant()) return;
    if (!realtimeOverrides.length) return;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (e) {
      // A build with no address for the client cannot join the live feed. That is the feed being down, and the
      // shell's line says so (live updates not coming through); it was a rejection nothing was waiting on, which
      // node charged to whichever test was running once a boot finished before its test's stop().
      console.warn("realtime_client_unavailable", e instanceof Error ? e.message : e);
      setConnection({ realtimeDown: true });
      return;
    }
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
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("realtime_status", topic, status);
          feed.onStatus(status);
        },
      },
    );
  });

  // Every surface again, as the boot reads them: the one on screen first, the rest behind it through the lanes. A
  // return used to schedule all of them at once -- twenty surfaces, thirty reads in one burst, with the page's own no
  // sooner than a stranger's. Answers are NOT held here: the live feed is joined by now, and an answer held from
  // before one of its events would hide what the event changed. A return while one pass is still out is that pass.
  let againRunning = false;
  const readEverySurfaceAgain = () => {
    if (againRunning || cancelled) return;
    againRunning = true;
    const screen = screenRank(window);
    void inLanes(
      [...overrides].sort((x, y) => screen(x) - screen(y)),
      BOOT_LANES,
      (o) => refresh(o, "refresh"),
    ).finally(() => {
      againRunning = false;
    });
  };

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    // A failed surface is the one that MOST needs retrying — it used to be the
    // one excluded, which is how a boot blip became permanent for the session.
    readEverySurfaceAgain();
  };
  document.addEventListener("visibilitychange", onVisible);

  // The browser says when this device loses its connection and when it has it
  // back. Offline is the shell's to say at once; back online, every surface is
  // read again now rather than at the next focus, because anything may have
  // changed meanwhile.
  const onOffline = () => setConnection({ offline: true });
  const onOnline = () => {
    setConnection({ offline: false });
    readEverySurfaceAgain();
  };
  if (typeof navigator !== "undefined" && navigator.onLine === false) setConnection({ offline: true });
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  return () => {
    cancelled = true;
    releaseAnswers();
    activeRefresh = null;
    activeOverrides = [];
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    timers.forEach((t) => clearTimeout(t));
    feed.stop();
    if (unsubscribe) unsubscribe();
    // What this runner watched goes with it; the next one says what it finds.
    setConnection({ offline: false, realtimeDown: false });
  };
}

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
import type { subscribeWorkspaceChanges, SubscribeOptions } from "@chanlytics/db/realtime";
import { MIN_MS, sendingEndsAt } from "@chanlytics/contracts";
import { activateOverride, readSlot, type SurfaceOverride } from "./surface-data";
import { ApiError } from "../client/api";
import { api, dropPrefetched, serversClockOf } from "./api";
import { cachedTenant, sealSurfaceCache, snapshotSurface } from "./surface-cache";
import {
  getConnection,
  getSurfaceStatuses,
  isSurfaceReady,
  setConnection,
  setStatus,
  surfaceMoved,
} from "./surface-status";
import { ROUTE_WAIT_MS, keepForItsPage, routeDrawsFor, routeSurfaceFor } from "./surface-registry";
import { feedWatch, REALTIME_GRACE_MS, subscribesToRealtime, wantsRefresh, type FeedWatch } from "./surface-realtime";
import { getActiveWorkspace, routeOnScreen, signInHref } from "./workspace";
import { knownZone, msUntilTheDayTurns, pageClock, workspaceZone } from "./zone";

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
/** The running runner's boot, settled once its last surface is in, whether each read worked or not. */
let activeBoot: Promise<void> = Promise.resolve();
/**
 * A return to the tab this soon after it was hidden reads nothing again, while the live feed is up and every surface
 * is live: the feed kept them current meanwhile. Every return used to read every surface -- about 28 reads on a
 * workspace, for a glance at another app; the phone app's five pages each did it on every return to the app.
 */
const AWAY_BEFORE_READ_AGAIN_MS = MIN_MS / 2;
/** A surface whose first read failed is read once more after this: one retry covers boot blips. */
const BOOT_RETRY_MS = 800;
/** A refresh waits this long after the last one asked for, unless the surface names its own debounce. */
const REFRESH_DEBOUNCE_MS = 400;
/**
 * And never longer than this after the first: a broadcast's receipts are each their own notice, a few hundred
 * milliseconds apart, and each restarted the wait, so a customer's new message reached no open page until they stopped.
 * A surface whose read is dear names a longer one of its own (`maxWaitMs`).
 */
const REFRESH_MAX_WAIT_MS = 3_000;

/**
 * Once the boot is in: when work nobody is waiting for may start (people.ts reading a list's people ahead) without
 * standing in the lanes the page's own surfaces boot through -- twenty-three reads at once is what made a cold load
 * take 7.8 s. Settled at once when no runner is booting.
 */
export function afterBoot(): Promise<void> {
  return activeBoot;
}

/**
 * A read the page on screen opens on that is no surface -- a person's page reads its person (people-detail.ts
 * warmPersonOnScreen) -- said to the boot before it starts, so the surfaces nobody is looking at wait for it as they
 * wait for the page's own. Measured on production (25 Sep 2026, a cold person page): the person's read took 3,236 ms
 * beside nine of the boot's, and 773 ms alone. Held for the route's wait at most (ROUTE_WAIT_MS), so a read that never
 * lands never keeps the shell's badge and bell from theirs.
 */
const pageReads = new Set<Promise<unknown>>();
export function bootWaitsFor(read: Promise<unknown>): void {
  pageReads.add(read);
  const done = () => pageReads.delete(read);
  read.then(done, done);
}
const pageReadsIn = (win: Window): Promise<void> => {
  // This boot's, then let go of: a read that never lands is this boot's wait at most, never the next one's.
  const reads = [...pageReads];
  pageReads.clear();
  if (reads.length === 0) return Promise.resolve();
  const cap = (win as unknown as { __routeWaitMs?: number }).__routeWaitMs ?? ROUTE_WAIT_MS;
  return Promise.race([Promise.allSettled(reads).then(() => undefined), new Promise<void>((r) => setTimeout(r, cap))]);
};

export async function refreshSurfaces(overrides: SurfaceOverride[]): Promise<void> {
  const fn = activeRefresh;
  if (!fn) return; // no runner mounted (standalone mockup) — nothing to sync
  await Promise.all(overrides.map((o) => fn(o)));
}

/** The shell's Retry: every surface the running runner holds, read again now. */
export async function refreshAllSurfaces(): Promise<void> {
  // Every surface the running runner holds that a page on screen draws: a surface read only where it is drawn waits for its page.
  // And every one the status line names as stopped refreshing, wherever it is drawn: Retry reads what the line says failed.
  const statuses = getSurfaceStatuses();
  await refreshSurfaces(readHere(activeOverrides, (o) => statuses.get(o.key) === "degraded"));
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
 * Parsed the way the shell parses it (app-shell.jsx parseRoute). A route that
 * owns no surface ranks nothing first, which costs nothing: the order is only
 * a preference.
 */
function screenRank(win: Window): (o: SurfaceOverride) => number {
  const [page, param] = routeOnScreen(win).split("/");
  const wanted = routeSurfaceFor(page || "today", param || null);
  const drawn = routeDrawsFor(page || "today", param || null);
  return (o) => (o.key === wanted ? 0 : drawn.includes(o.key) ? 1 + drawn.indexOf(o.key) : 1 + drawn.length);
}
/** Whether the page on screen is drawn from this surface: its own, or one it names (ROUTE_DRAWS). A stranger is not. */
function screenOwn(win: Window): (o: SurfaceOverride) => boolean {
  const rank = screenRank(win);
  const [page, param] = routeOnScreen(win).split("/");
  const strangers = 1 + routeDrawsFor(page || "today", param || null).length;
  return (o) => rank(o) < strangers;
}

/**
 * What a pass over these surfaces reads here (a return to the tab, the network back, a rejoin of the live feed, Retry-all): every
 * one but a surface read only where it is drawn (`onDemand`) and not drawn here, which is kept for its page instead
 * (surface-registry.ts keepForItsPage), so its page reads it once as it comes on screen and never shows what the pass missed.
 * `alsoRead` names any such surface the pass reads all the same (Retry's: what the status line says stopped refreshing).
 */
function readHere(
  overrides: readonly SurfaceOverride[],
  alsoRead: (o: SurfaceOverride) => boolean = () => false,
): SurfaceOverride[] {
  const drawn = screenOwn(window);
  return overrides.filter((o) => {
    if (!o.onDemand || drawn(o) || alsoRead(o)) return true;
    keepForItsPage(o.key);
    return false;
  });
}

/**
 * What a return to the tab reads: every surface, unless the tab was away less than AWAY_BEFORE_READ_AGAIN_MS with the
 * live feed up and every one of these surfaces live. A failed surface is the one that MOST needs retrying -- it used to
 * be the one excluded, which is how a boot blip became permanent for the session. The visibilitychange listener.
 */
function onReturn(overrides: readonly SurfaceOverride[], readEverySurfaceAgain: () => void): () => void {
  let hiddenAt: number | null = null;
  return () => {
    if (document.visibilityState !== "visible") {
      hiddenAt ??= Date.now();
      return;
    }
    const away = hiddenAt === null ? Infinity : Date.now() - hiddenAt;
    hiddenAt = null;
    const statuses = getSurfaceStatuses();
    // A surface read only where it is drawn, and not drawn here, is none the feed could have let go stale: it does not count.
    const drawn = screenOwn(window);
    const allLive = overrides.every((o) => (o.onDemand && !drawn(o)) || statuses.get(o.key) === "live");
    if (away < AWAY_BEFORE_READ_AGAIN_MS && allLive && !getConnection().realtimeDown) return;
    readEverySurfaceAgain();
  };
}

/**
 * How the runner joins the live feed: the workspace's topic, over the client the page holds. Handed in rather than
 * built here: the runner used to make the Supabase browser client itself once its boot was in, so a node test that
 * mounted real surfaces built one with no URL or key, and the throw -- in an un-awaited continuation -- failed
 * whichever test was running when the boot happened to finish.
 */
export type JoinLiveFeed = (
  onChange: Parameters<typeof subscribeWorkspaceChanges>[1],
  opts: SubscribeOptions,
) => () => void;

/** One runner's own: what its reads, its live feed and its stop share. */
interface SurfaceRun {
  readonly overrides: SurfaceOverride[];
  /** The surfaces that watch the live feed. */
  readonly realtime: SurfaceOverride[];
  /** The tenant the cache was written for, read before this runner's boot could overwrite it. */
  readonly cachedAtBoot: string | null;
  /** Each surface's pending refresh. */
  readonly timers: Map<string, ReturnType<typeof setTimeout>>;
  /** When each pending refresh was first asked for: the wait ends by REFRESH_MAX_WAIT_MS after it. */
  readonly firstAsked: Map<string, number>;
  /**
   * What each surface holds is as new as this (ms, the client's clock; `readSlot` names the surface and the view shown): when
   * its last read was started, or the moment of the oldest read that one could share (client/api.ts sharesFrom), the older of
   * the two. A change committed before it is in what the surface holds (readAfter).
   */
  readonly readFrom: Map<string, number>;
  /**
   * What each pending refresh was asked for by (askedBy): the view it is of, and when the newest notice behind it arrived,
   * Infinity if any carried no `at`. A read of the same view that could not be answered from anything older than that lets the
   * refresh go (noteRead).
   */
  readonly asked: Map<string, { slot: string; arrived: number }>;
  cancelled: boolean;
  /** Leaves the live feed, once it is joined. */
  unsubscribe: (() => void) | null;
  /**
   * While the boot is out: the surfaces the live feed said changed, read once the boot is in (refreshSoon). Null once
   * it is in, when what the feed says is read as it comes.
   */
  held: Set<SurfaceOverride> | null;
}

function newSurfaceRun(overrides: SurfaceOverride[]): SurfaceRun {
  // Read the cached identity BEFORE any boot can overwrite it. Every
  // successful boot persists with the CURRENT tenant, and snapshotSurface
  // assigns blob.tenant on every write — so the old guard, which read the
  // cache after Promise.all, always compared a value against itself and could
  // never fire.
  const cachedAtBoot = cachedTenant();
  return {
    overrides,
    cachedAtBoot,
    cancelled: false,
    timers: new Map<string, ReturnType<typeof setTimeout>>(),
    firstAsked: new Map<string, number>(),
    readFrom: new Map<string, number>(),
    asked: new Map<string, { slot: string; arrived: number }>(),
    realtime: overrides.filter(subscribesToRealtime),
    unsubscribe: null,
    held: new Set(),
  };
}

// The cache is keyed on this, so it must be the workspace actually being
// viewed — the one the server resolved — or nothing. Keyed on
// `__WORKSPACES[0]` it was constant for a member of two workspaces, and the
// guard that exists to stop one tenant's rows being restored under
// another's name would never have fired.
const viewedWorkspace = () => (window as unknown as { __ACTIVE_WORKSPACE?: string }).__ACTIVE_WORKSPACE ?? null;

function signOutOnUnauthorized(run: SurfaceRun): void {
  // Cached customer data must never outlive the session allowed to see it, and a read landing before the page unloads
  // must not write it back (surface-cache.ts sealSurfaceCache).
  sealSurfaceCache();
  // The page's hash goes along, so signing in again lands where they were.
  if (!run.cancelled) window.location.assign(signInHref(window.location));
}

function persistSurface(o: SurfaceOverride): void {
  if (o.globals?.length || o.value) snapshotSurface(o.key, o.globals ?? [], viewedWorkspace(), o.trimSnapshot, o.value);
}

/**
 * A read of this surface is about to be asked for (by a write, a notice, a return to the tab, the boot): remember what it will be
 * as new as (`readFrom`), and answer what to do when it has landed or failed. It is remembered when asked, not when the read
 * starts: a read queued behind one still out (activateOverride) starts later, which only makes the note older, and an older
 * note only lets fewer notices go unread.
 *  - It covers the refresh the live feed has pending for this surface when every notice behind that refresh arrived before the
 *    read could be answered from anything older: they were told of changes already committed, so the read holds them, and the
 *    refresh is let go (a write's re-read made while the early commits of a multi-write verb waited out their 400 ms). Notices
 *    that carried no `at` (a database from before 00408) are not judged: their refresh stands, as it always did.
 *  - If it fails, the surface holds what it held: the note goes back, and a refresh it let go is asked for again.
 */
function noteRead(run: SurfaceRun, o: SurfaceOverride): (landed: boolean) => void {
  const slot = readSlot(o);
  const before = run.readFrom.get(slot);
  const mine = api().sharesFrom();
  run.readFrom.set(slot, mine);
  const pending = run.asked.get(o.key);
  const timer = run.timers.get(o.key);
  const covers = !!pending && !!timer && pending.slot === slot && pending.arrived <= mine;
  if (covers && timer) {
    clearTimeout(timer);
    run.timers.delete(o.key);
    run.firstAsked.delete(o.key);
    run.asked.delete(o.key);
  }
  return (landed) => {
    if (landed) return;
    if (run.readFrom.get(slot) === mine) {
      if (before === undefined) run.readFrom.delete(slot);
      else run.readFrom.set(slot, before);
    }
    if (covers && !run.cancelled) scheduleSurfaceRefresh(run, o);
  };
}

/**
 * Whether this surface holds what a notice of the live feed tells of: it was read after the change was made, so the notice asks
 * for nothing (your own change is read once, 0047). The write's re-read (refresh-map.ts) and the notice its commits send are two
 * reads of one change otherwise -- the notice's always a fresh request of its own (refreshSoon), up to 22 requests for one reply.
 * Judged by the notice's `at`, the database's clock when it told, against the surface's own last read (`readFrom`, this
 * browser's clock), once the read is put on the servers' clock (api.ts serversClockOf: less the margin the clocks may
 * disagree by and how far this browser's runs ahead, measured on every answer). A browser a few seconds fast dropped
 * the notice of a change made just after its read began, and nothing read it again (the wiring's second audit, S2-1).
 * `at` is the clock of the first statement of the transaction that told (00408), not of its commit: a transaction that ran
 * longer than a read's start can tell of a change the read did not hold with an `at` before it, and is not covered here. A
 * notice that reached the tab before the read began is judged by noteRead, by when it arrived, which is after its commit
 * whatever either clock says.
 * A notice with no `at` (a database from before 00408), and any notice while the boot is out (its answers are held: a read
 * during it may be the boot's), is read as it always was.
 */
function readAfter(run: SurfaceRun, o: SurfaceOverride, told: string | undefined): boolean {
  if (!told || run.held) return false;
  const from = run.readFrom.get(readSlot(o));
  const at = Date.parse(told);
  return from !== undefined && Number.isFinite(at) && at < serversClockOf(from);
}

/**
 * A notice has asked for this surface to be read (refreshSoon): when it arrived, for the read that comes first to know it
 * holds the change (noteRead). A notice that carries no `at` is not judged, and neither is any refresh it joins.
 */
function askedBy(run: SurfaceRun, o: SurfaceOverride, told: string | undefined, arrived: number): void {
  if (run.held) return; // held for the boot's end: scheduled then, and never let go
  const was = run.asked.get(o.key);
  const newest = told && Number.isFinite(Date.parse(told)) ? arrived : Infinity;
  run.asked.set(o.key, { slot: readSlot(o), arrived: Math.max(was?.arrived ?? 0, newest) });
}

async function refreshSurface(run: SurfaceRun, o: SurfaceOverride, phase: "boot" | "refresh"): Promise<void> {
  const settle = noteRead(run, o);
  try {
    const ok = await activateOverride(o);
    settle(ok);
    if (run.cancelled) return;
    if (ok) {
      persistSurface(o);
      setStatus(o.key, "live");
    } else if (phase === "boot" || !isSurfaceReady(o.key)) {
      // "degraded" means "real but stale" — it may only describe a surface
      // that HAS real data. A failed refresh of a never-loaded surface is
      // still just failed, and saying otherwise upgrades the lie.
      setStatus(o.key, "seeded");
    } else setStatus(o.key, "degraded");
  } catch (e) {
    if (e instanceof ApiError && e.code === "unauthorized") signOutOnUnauthorized(run);
  }
}

async function bootSurface(run: SurfaceRun, o: SurfaceOverride): Promise<void> {
  try {
    let settle = noteRead(run, o);
    let ok = await activateOverride(o);
    settle(ok);
    if (!ok && !run.cancelled) {
      await new Promise((r) => setTimeout(r, BOOT_RETRY_MS)); // one retry covers boot blips
      if (run.cancelled) return;
      settle = noteRead(run, o);
      ok = await activateOverride(o);
      settle(ok);
    }
    if (run.cancelled) return;
    if (ok) {
      persistSurface(o);
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
    if (e instanceof ApiError && e.code === "unauthorized") signOutOnUnauthorized(run);
    else if (!run.cancelled) setStatus(o.key, "seeded");
  }
}

function scheduleSurfaceRefresh(run: SurfaceRun, o: SurfaceOverride): void {
  const prev = run.timers.get(o.key);
  if (prev) clearTimeout(prev);
  const now = Date.now();
  const first = run.firstAsked.get(o.key) ?? now;
  run.firstAsked.set(o.key, first);
  const wait = Math.max(
    0,
    Math.min(o.debounceMs ?? REFRESH_DEBOUNCE_MS, first + (o.maxWaitMs ?? REFRESH_MAX_WAIT_MS) - now),
  );
  run.timers.set(
    o.key,
    setTimeout(() => {
      run.firstAsked.delete(o.key);
      run.asked.delete(o.key); // the read below is the one they asked for, not one that holds them
      void refreshSurface(run, o, "refresh");
    }, wait),
  );
}

/**
 * A surface the live feed says changed: read soon, or, while the boot is out, once it is in. A read made during the
 * boot is answered from what the boot holds (holdAnswers), which may be from before the change. Only a surface that does
 * not hold the change already comes here (readAfter): the notice of this tab's own write, whose re-read the write has
 * made, does not, and a read it asks for is still a read of its own.
 */
function refreshSoon(run: SurfaceRun, o: SurfaceOverride): void {
  if (run.held) {
    run.held.add(o);
    return;
  }
  // A read already out was sent before this change: the refresh it asks for must not share it, as a write's must not
  // (client/api.ts forget). Today and the Inbox both read the conversations, and the Inbox's refresh after a message
  // could be answered by Today's read from a moment before it, the message missing until the next. (And a read that
  // did share one is as old as it, readFrom: so what it holds is never taken for newer than it is.)
  api().forget();
  scheduleSurfaceRefresh(run, o);
}

/**
 * What the live feed's own reports mean for the page (surface-realtime.ts):
 * a rejoin reads the gap, and a drop that outlasts the grace is the shell's
 * to say.
 */
function watchLiveFeed(run: SurfaceRun): FeedWatch {
  return feedWatch({
    graceMs: REALTIME_GRACE_MS,
    onDown: (down) => setConnection({ realtimeDown: down }),
    // reconnect after sleep/offline: the feed replays nothing it missed, so
    // refetch to close the gap (what is drawn here; the rest is kept for its
    // page: readHere)
    onReconnect: () => readHere(run.realtime).forEach((o) => refreshSoon(run, o)),
  });
}

// Restored cache belongs to whoever was signed in when it was written. If a
// different workspace comes back, that data was never theirs to see: drop it
// and reload rather than leave another tenant's rows on screen.
function tenantChangedSinceCache(run: SurfaceRun): boolean {
  const cached = run.cachedAtBoot;
  const actual = viewedWorkspace();
  if (cached && actual && cached !== actual) {
    // Sealed, not only cleared: what the other reads land with before the reload is this workspace's, never to be
    // written into the tab under the one that was cached.
    sealSurfaceCache();
    window.location.reload();
    return true;
  }
  return false;
}

/** A boot under way: settled once its last surface is in, and the hold on answers it lets go of then. */
interface SurfaceBoot {
  booted: Promise<void>;
  releaseAnswers: () => void;
  /** Settled once the workspace surface's boot has: the workspace on screen is known (joinFeedEarly). */
  whoIsLooking: Promise<void>;
}

function bootInPasses(run: SurfaceRun): SurfaceBoot {
  const { overrides } = run;
  // Who is looking, known: the workspace surface's boot settled, which says the workspace on screen
  // (__ACTIVE_WORKSPACE), the topic the live feed is joined on.
  let knowWho = () => {};
  const whoIsLooking = new Promise<void>((r) => (knowWho = r));
  const boot = (o: SurfaceOverride) => {
    const read = bootSurface(run, o);
    if (o.key === "workspace") void read.finally(knowWho);
    return read;
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
  //
  // In two passes (25 Sep 2026). The first is the page's: who is looking, its own surface and what it draws beside it
  // (screenOwn). The second, everyone else's, starts once the first is in and the page's own read (bootWaitsFor) has
  // landed. In one pass the strangers filled the other three lanes at once, and the server answered the page's read
  // among them: measured on production, a cold person page's read took 3,236 ms in that crowd and 773 ms alone, with
  // 26 reads of 520 KB out for a page that draws one person. The shell's badge and bell come a beat later than they
  // did; the page comes seconds sooner.
  const screen = screenRank(window);
  const own = screenOwn(window);
  const rank = (o: SurfaceOverride) => (o.key === "workspace" ? 0 : 1 + screen(o));
  const queued = [...overrides].sort((x, y) => rank(x) - rank(y));
  const pagesOwn = queued.filter((o) => o.key === "workspace" || own(o));
  // A stranger that is read only where it is drawn is not booted: its page reads it as it comes on screen (readWhatWasMissed).
  const strangers = queued.filter((o) => !pagesOwn.includes(o) && !o.onDemand);
  // Surfaces read the same lists in turn -- the calls, the templates, the contacts, and on Leads the page the view
  // asks for again as it mounts. Measured on the salon's Leads page: 31 reads at boot, 20 distinct, because a read
  // that had settled was not shared with the one asking a moment later. Every answer is held until the last surface
  // is in; what the live feed says meanwhile is held too (refreshSoon), and read once the answers are let go of.
  const releaseAnswers = api().holdAnswers();
  const firstPass = workspaceFirst
    ? boot(workspaceFirst).then(() =>
        inLanes(
          pagesOwn.filter((o) => o !== workspaceFirst),
          BOOT_LANES,
          boot,
        ),
      )
    : inLanes(pagesOwn, BOOT_LANES, boot);
  const booted = firstPass
    .then(() => (run.cancelled ? undefined : pageReadsIn(window)))
    .then(() => {
      // The page's own reads are in: what the document's head started for them and they did not take is nobody's.
      dropPrefetched(window);
      return run.cancelled ? undefined : inLanes(strangers, BOOT_LANES, boot);
    });
  activeBoot = booted.then(
    () => undefined,
    () => undefined,
  );
  // A run with no workspace surface (a test's) knows who is looking when its boot is in, as every run once did.
  if (!overrides.some((o) => o.key === "workspace")) void booted.finally(knowWho);
  return { booted, releaseAnswers, whoIsLooking };
}

/**
 * The live feed, joined as soon as who is looking is known rather than once the whole boot is in. It was joined at the
 * end, and Realtime has no backfill: a message that landed after a surface's read and before the join -- the length
 * of the boot, two seconds and more on a phone -- was never heard, and the Inbox went without it until the next event
 * or a return to the tab. What the feed says while the boot is out is held (refreshSoon) and read once the boot's
 * answers are let go of.
 */
function joinFeedEarly(run: SurfaceRun, boot: SurfaceBoot, joinFeed: JoinLiveFeed, feed: FeedWatch): void {
  void boot.booted.then(() => {
    boot.releaseAnswers();
    const due = run.held;
    run.held = null;
    if (run.cancelled || !due) return;
    // A boot read still out may have been sent before what the feed said: the reads it asks for share none (refreshSoon).
    if (due.size) api().forget();
    for (const o of due) scheduleSurfaceRefresh(run, o);
  });
  void boot.whoIsLooking.then(() => {
    if (run.cancelled) return;
    if (tenantChangedSinceCache(run)) return;
    if (!run.realtime.length) return;
    // Scoped to the workspace this tab shows: the database tells each
    // workspace's changes on a topic of its own, and Realtime admits only its
    // members (00265), so a member of two workspaces neither hears nor
    // repaints on the other one's. A switch is a new topic; a tab with no
    // workspace joins nothing.
    const ws = viewedWorkspace();
    run.unsubscribe = joinFeed(
      // Routed by table: a live call's transcript turns repaint Live, not the
      // five surfaces that never asked (three of them plpgsql aggregates).
      (row, table, event, at) => {
        const arrived = Date.now();
        // The notice's clock rides on the change (00408), for a rule that judges a change by when it was told.
        const change = { table, event, row, ...(at ? { at } : {}) };
        run.realtime
          // A surface read after the change was made holds it, and asks for nothing (readAfter): asked before its rule, which
          // keeps a page for its own page (onlyOnItsPage) a change it already holds. Teammates' and other tabs' changes
          // are later than any read of this tab's and read as ever.
          .filter((o) => !readAfter(run, o, at) && wantsRefresh(o, table, change))
          .forEach((o) => {
            refreshSoon(run, o);
            askedBy(run, o, at, arrived);
          });
      },
      {
        tenantId: ws ?? undefined,
        onStatus: (status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.warn("realtime_status", ws, status);
          feed.onStatus(status);
        },
      },
    );
  });
}

/** The return to the tab and the connection's comings and goings, heard; answers what stops hearing them. */
function listenForReturns(run: SurfaceRun): () => void {
  const { overrides } = run;
  // Every surface again, as the boot reads them: the one on screen first, the rest behind it through the lanes. A
  // return used to schedule all of them at once -- twenty surfaces, thirty reads in one burst, with the page's own no
  // sooner than a stranger's. Answers are NOT held here: the live feed is joined by now, and an answer held from
  // before one of its events would hide what the event changed. A return while one pass is still out is that pass.
  let againRunning = false;
  const readEverySurfaceAgain = () => {
    if (againRunning || run.cancelled) return;
    againRunning = true;
    const screen = screenRank(window);
    void inLanes(
      // What is drawn here, as the boot reads it; a surface read only where it is drawn waits for its page.
      readHere(overrides).sort((x, y) => screen(x) - screen(y)),
      BOOT_LANES,
      (o) => refreshSurface(run, o, "refresh"),
    ).finally(() => {
      againRunning = false;
    });
  };

  const onVisible = onReturn(overrides, readEverySurfaceAgain);
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
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
  };
}

/** How far past the end of the sending hours their re-judging waits: a timer that fires a hair early judges the hour it leaves. */
const PAST_THE_HOUR_MS = 1_000;

/**
 * The business's day turns: the surfaces that count the day so far (`readAtMidnight`) are read again, a second past its midnight by
 * the workspace's zone, and the timer is armed again for the next (a day the clocks change is 23 or 25 hours, so it is the zone's
 * midnight each time, not a day's length). Nothing else moves them at midnight: a tab left open overnight said yesterday's totals
 * under "Today so far" until its first message. A tab nobody is looking at reads as it is shown; a surface read only where it is
 * drawn is read where its page is on screen and kept for its page elsewhere (readHere), as a return to the tab does. A zone saved
 * moves the next midnight: the workspace's change (`workspace:changed`, told once the new zone is published) arms the timer again.
 * And Sent's runs are said to have moved: a run waiting for approval whose day has just passed waits on nobody now (contracts
 * runWaitsOnYou), so every count of what needs you and every page that draws the runs asks again, with no read (S7-3); and
 * so they are once today's sending hours end, when a visit's run made for today is too late (sendingEndsAt).
 */
function watchTheDayTurn(run: SurfaceRun): () => void {
  const counting = run.overrides.filter((o) => o.readAtMidnight);
  if (!counting.length) return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The end of today's sending hours: a visit's run made for today waits on nobody after it (sendingEndsAt).
  let sendingTimer: ReturnType<typeof setTimeout> | null = null;
  let owed = false;
  let stopped = false;
  /** Which arming is the latest: one still waiting for the zone when another begins gives way to it. */
  let armings = 0;
  const read = () => {
    owed = false;
    // A read already out was sent before the day turned: the reads this asks for share none (refreshSoon).
    api().forget();
    readHere(counting).forEach((o) => void refreshSurface(run, o, "refresh"));
  };
  const arm = async (): Promise<void> => {
    const mine = (armings += 1);
    const zone = knownZone() ?? (await workspaceZone().catch(() => pageClock().zone()));
    if (stopped || run.cancelled || mine !== armings) return;
    if (timer) clearTimeout(timer);
    if (sendingTimer) clearTimeout(sendingTimer);
    let wait: number;
    let sendingEnds: Date | null;
    try {
      wait = msUntilTheDayTurns(zone, Date.now());
      sendingEnds = sendingEndsAt(zone, new Date());
    } catch {
      return; // a zone the browser cannot read: the day is not turned by a clock here
    }
    // Once today's sending hours end, the runs that wait for a word are judged again (the count, the head, the bell's "is
    // ready" row): a visit's run made for today is too late from then, and Approve would be refused.
    if (sendingEnds)
      sendingTimer = setTimeout(
        () => surfaceMoved("broadcasts"),
        sendingEnds.getTime() - Date.now() + PAST_THE_HOUR_MS,
      );
    timer = setTimeout(() => {
      surfaceMoved("broadcasts");
      if (document.visibilityState === "visible") read();
      else owed = true;
      void arm();
    }, wait);
  };
  const onShown = () => {
    if (owed && document.visibilityState === "visible") read();
  };
  const onZone = () => void arm();
  document.addEventListener("visibilitychange", onShown);
  window.addEventListener("workspace:changed", onZone);
  void arm();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (sendingTimer) clearTimeout(sendingTimer);
    document.removeEventListener("visibilitychange", onShown);
    window.removeEventListener("workspace:changed", onZone);
  };
}

/**
 * Starts the surfaces: each one's first read (the boot), the live feed once who is looking is known, and the reads again on a
 * return to the tab or to the network. Answers the stop, which undoes them in the same order.
 */
export function startSurfaces(overrides: SurfaceOverride[], joinFeed: JoinLiveFeed): () => void {
  // Said now, at the call, not when the boot ends: a missing feed found then is a throw nobody awaits.
  if (typeof joinFeed !== "function" && overrides.some(subscribesToRealtime))
    throw new TypeError("startSurfaces: surfaces that watch the live feed need a feed to join");
  const run = newSurfaceRun(overrides);
  activeRefresh = (o: SurfaceOverride) => refreshSurface(run, o, "refresh");
  activeOverrides = overrides;
  const feed = watchLiveFeed(run);
  const boot = bootInPasses(run);
  joinFeedEarly(run, boot, joinFeed, feed);
  const stopListening = listenForReturns(run);
  const stopDay = watchTheDayTurn(run);

  return () => {
    run.cancelled = true;
    boot.releaseAnswers();
    activeRefresh = null;
    activeOverrides = [];
    stopListening();
    stopDay();
    run.timers.forEach((t) => clearTimeout(t));
    feed.stop();
    if (run.unsubscribe) run.unsubscribe();
    // What this runner watched goes with it; the next one says what it finds.
    setConnection({ offline: false, realtimeDown: false });
  };
}

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
import { activateOverride, readSlot, readWasPartial, type SurfaceOverride } from "./surface-data";
import { ApiError } from "../client/api";
import { api, dropPrefetched, serversClockOf } from "./api";
import { cachedTenant, sealSurfaceCache, snapshotSurface } from "./surface-cache";
import { getSurfaceStatuses, isSurfaceReady, onSurfaceMoved, setConnection, setStatus } from "./surface-status";
import {
  ROUTE_WAIT_MS,
  drawsTheScreen,
  keepForItsPage,
  keepUntilDrawn,
  readLanded,
  routeDrawsFor,
  routePartsOf,
  routeSurfaceFor,
} from "./surface-registry";
import {
  deliveryTicksOnly,
  feedWatch,
  REALTIME_GRACE_MS,
  RECEIPTS_LONGEST_WAIT_MS,
  subscribesToRealtime,
  wantsRefresh,
  type FeedWatch,
  type RealtimeChange,
} from "./surface-realtime";
import { getActiveWorkspace, routeOnScreen, signInHref } from "./workspace";
import { watchTheClock } from "./hearing/clock";
import { watchTheDayTurn } from "./hearing/day-turn";
import { pageHidden } from "./hearing/front";
import { passesOf, type Passes } from "./hearing/passes";

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
/** A surface whose first read failed is read once more after this: one retry covers boot blips. */
const BOOT_RETRY_MS = 800;
/**
 * A read asked for after the boot (a notice, a write, a pass) that failed, or landed in part, is asked for again after these, one
 * after the other: a notice is the only word that a record changed, so the read it asks for is not dropped on the first busy
 * moment (the wiring's second audit, S2-5). After the last the surface stays as the status line says it is: not refreshing.
 */
const RETRY_AFTER_MS = [2_000, 10_000] as const;
/**
 * The surfaces a hidden page still reads as the feed tells of them: who is looking, the Inbox, a call in progress and the bell,
 * which say themselves in the tab's title, its badge and the phone's icon. Every other notice is held until the page is in front
 * again (hearing/passes.ts holdWhileHidden): a pinned tab read the Inbox, Today and the threads all day for nobody (S10-3).
 */
const READ_WHILE_HIDDEN: ReadonlySet<string> = new Set(["workspace", "inbox", "live", "notifications"]);
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
  const { page, param } = routePartsOf(routeOnScreen(win));
  const wanted = routeSurfaceFor(page, param);
  const drawn = routeDrawsFor(page, param);
  return (o) => (o.key === wanted ? 0 : drawn.includes(o.key) ? 1 + drawn.indexOf(o.key) : 1 + drawn.length);
}
/** Whether the page on screen is drawn from this surface: its own, or one it names (ROUTE_DRAWS). A stranger is not. */
function screenOwn(win: Window): (o: SurfaceOverride) => boolean {
  const rank = screenRank(win);
  const { page, param } = routePartsOf(routeOnScreen(win));
  const strangers = 1 + routeDrawsFor(page, param).length;
  return (o) => rank(o) < strangers;
}

/**
 * What a pass over these surfaces reads here (a return to the tab, the network back, a rejoin of the live feed, the day's turn,
 * Retry-all): every one but a surface read only where it is drawn (`onDemand`), or heard only on its page (`its-page`), when no
 * page on screen draws it. The first is kept for its page (surface-registry.ts keepForItsPage), the second for whichever page
 * next draws it (keepUntilDrawn): read once as it comes on screen, never showing what the pass missed. People, Sent's runs and the
 * playbooks were read at every return to Today, the heaviest of the pass, for pages nobody had open (the wiring's second audit,
 * S10-7). `alsoRead` names any such surface the pass reads all the same (Retry's: what the status line says stopped refreshing).
 */
function readHere(
  overrides: readonly SurfaceOverride[],
  alsoRead: (o: SurfaceOverride) => boolean = () => false,
): SurfaceOverride[] {
  const drawn = screenOwn(window);
  const route = routeOnScreen();
  return overrides.filter((o) => {
    if (alsoRead(o)) return true;
    if (o.onDemand) {
      if (drawn(o)) return true;
      keepForItsPage(o.key);
      return false;
    }
    if (o.fresh !== "its-page" || drawn(o) || drawsTheScreen(o.key, route)) return true;
    keepUntilDrawn(o.key);
    return false;
  });
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
  /**
   * What the live feed told each pending refresh of (a table, its event and its status): handed to the read, which may read
   * only what those can have changed (`apply(heard)`: a delivery tick re-reads the threads, not the calls and the holds, S10-2).
   */
  readonly heard: Map<string, RealtimeChange[]>;
  /** The one pass that reads everything again (hearing/passes.ts), once the runner has started it. */
  passes: Passes | null;
  /** Stops waiting for the workspace's id, where the tab joined no feed for want of it (joinFeedEarly). */
  leaveWorkspaceWait?: () => void;
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
    heard: new Map<string, RealtimeChange[]>(),
    passes: null,
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
    run.heard.delete(o.key);
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

/**
 * Read a surface again: its status, its cache, and what it held for its pages. One that failed, or landed only in part (a read of
 * Today whose calls could not be read: `apply` said "partial"), is asked for again after RETRY_AFTER_MS, unless something has
 * asked for it meanwhile; `attempt` counts the tries. `heard` is what the feed told the refresh of, for the read to narrow to.
 */
async function refreshSurface(
  run: SurfaceRun,
  o: SurfaceOverride,
  phase: "boot" | "refresh",
  heard?: readonly RealtimeChange[],
  attempt = 0,
): Promise<void> {
  const settle = noteRead(run, o);
  const from = run.readFrom.get(readSlot(o));
  try {
    const ok = await activateOverride(o, heard);
    settle(ok);
    if (run.cancelled) return;
    const whole = ok && !readWasPartial(o.key);
    if (ok) {
      persistSurface(o);
      // What it was kept for, let pass or left for its pages before this read began, it now holds (S2-7).
      if (from !== undefined) readLanded(o.key, from);
    }
    if (whole) setStatus(o.key, "live");
    else if (!ok && (phase === "boot" || !isSurfaceReady(o.key))) {
      // "degraded" means "real but stale" — it may only describe a surface
      // that HAS real data. A failed refresh of a never-loaded surface is
      // still just failed, and saying otherwise upgrades the lie.
      setStatus(o.key, "seeded");
    } else setStatus(o.key, "degraded");
    if (!whole) retryLater(run, o, attempt);
  } catch (e) {
    if (e instanceof ApiError && e.code === "unauthorized") signOutOnUnauthorized(run);
  }
}

/** Ask for a surface whose read failed, or landed in part, once more, unless a refresh of it is already asked for. */
function retryLater(run: SurfaceRun, o: SurfaceOverride, attempt: number): void {
  const wait = RETRY_AFTER_MS[attempt];
  if (wait === undefined || run.cancelled || run.timers.has(o.key)) return;
  run.timers.set(
    o.key,
    setTimeout(() => {
      run.timers.delete(o.key);
      if (!run.cancelled) void refreshSurface(run, o, "refresh", undefined, attempt + 1);
    }, wait),
  );
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
    if (ok && readWasPartial(o.key)) {
      // Real, and in part: it stands as not refreshing, and the rest is asked for again (S2-5).
      persistSurface(o);
      setStatus(o.key, "degraded");
      retryLater(run, o, 0);
    } else if (ok) {
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
  // A count made of receipts is read once a run's receipts quieten (receiptsQuietMs; S3-5); anything else at its own pace.
  const ticksQuiet = deliveryTicksOnly(run.heard.get(o.key)) ? o.receiptsQuietMs : undefined;
  const quiet = ticksQuiet ?? o.debounceMs ?? REFRESH_DEBOUNCE_MS;
  const longest = ticksQuiet === undefined ? (o.maxWaitMs ?? REFRESH_MAX_WAIT_MS) : RECEIPTS_LONGEST_WAIT_MS;
  const wait = Math.max(0, Math.min(quiet, first + longest - now));
  run.timers.set(
    o.key,
    setTimeout(() => {
      run.timers.delete(o.key);
      run.firstAsked.delete(o.key);
      run.asked.delete(o.key); // the read below is the one they asked for, not one that holds them
      // What the feed told this refresh of, for the read to narrow to; none where a write or a pass asked as well.
      const heard = run.heard.get(o.key);
      run.heard.delete(o.key);
      void refreshSurface(run, o, "refresh", heard);
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
 * What the live feed's own reports mean for the page (surface-realtime.ts): the feed replays nothing it missed, so each join reads
 * the gap, and a drop that outlasts the grace is the shell's to say. Both joins go through the one pass, through the lanes, and
 * skip what a read since the join holds:
 *  - The first: a surface read before the feed was joined (the boot, the document's head) never heard what changed between its
 *    read and the join, which on a phone is seconds. Once the boot is in, what tells of a customer's message or a call and was
 *    read before the join is read once more (S2-4; caughtUpAtJoin). Every boot read begins before the join, so the rest wait for
 *    their next notice or the rolling heal: reading them all again would read the whole boot twice on every cold open.
 *  - A rejoin after sleep or a drop: what is heard here is read again, and a surface a return's pass read since is not (S2-7).
 */
function watchLiveFeed(run: SurfaceRun, booted: Promise<void>): FeedWatch {
  return feedWatch({
    graceMs: REALTIME_GRACE_MS,
    onDown: (down) => setConnection({ realtimeDown: down }),
    onJoin: () => {
      const at = Date.now();
      // A feed reported down while the tab had no workspace to join (S2-6) is up now.
      setConnection({ realtimeDown: false });
      void booted.then(() => run.passes?.again("join", readBefore(run, at).filter(caughtUpAtJoin), at));
    },
    onReconnect: () => {
      const at = Date.now();
      void run.passes?.again("rejoin", readBefore(run, at), at);
    },
  });
}

/**
 * Whether the feed's first join reads this surface again, when its read began before the join: it tells of a customer's message
 * or a call, which the page must not miss for the length of a load, and its read is not dear (it names no longer wait than the
 * runner's own: People, Sent's runs, the playbooks and Today's headline do). The full answer is the feed's own replay from the
 * load's start (0019 step 4), owed to a proof on the local stack.
 */
function caughtUpAtJoin(o: SurfaceOverride): boolean {
  return (
    (o.maxWaitMs ?? REFRESH_MAX_WAIT_MS) <= REFRESH_MAX_WAIT_MS &&
    (wantsRefresh(o, "messages") || wantsRefresh(o, "calls"))
  );
}

/** The surfaces the feed tells of whose last read began before `at`, or that were never read: what a join owes a read. */
function readBefore(run: SurfaceRun, at: number): SurfaceOverride[] {
  return run.realtime.filter((o) => {
    const from = run.readFrom.get(readSlot(o));
    return from === undefined || from < at;
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
    if (viewedWorkspace()) {
      joinWorkspaceFeed(run, joinFeed, feed);
      return;
    }
    // The workspace read failed, so the tab does not know its topic yet: it joins as a later read says it (a Retry, a return),
    // and says the feed is down while it has none, once the boot is in. It joined nothing for good, and said nothing (S2-6).
    const unhear = onSurfaceMoved(["workspace"], () => {
      if (run.cancelled || run.unsubscribe || !viewedWorkspace()) return;
      unhear();
      joinWorkspaceFeed(run, joinFeed, feed);
    });
    run.leaveWorkspaceWait = unhear;
    void boot.booted.then(() => {
      if (!run.cancelled && !run.unsubscribe) setConnection({ realtimeDown: true });
    });
  });
}

/**
 * Join the live feed on the workspace this tab shows: the database tells each workspace's changes on a topic of its own, and
 * Realtime admits only its members (00265), so a member of two workspaces neither hears nor repaints on the other one's. A
 * switch is a new topic.
 */
function joinWorkspaceFeed(run: SurfaceRun, joinFeed: JoinLiveFeed, feed: FeedWatch): void {
  const ws = viewedWorkspace();
  run.unsubscribe = joinFeed(
    // Routed by table: a live call's transcript turns repaint Live, not the
    // five surfaces that never asked (three of them plpgsql aggregates).
    (row, table, event, at) => {
      const arrived = Date.now();
      // The notice's clock rides on the change (00408), for a rule that judges a change by when it was told.
      const change = { table, event, row, ...(at ? { at } : {}) };
      const hidden = pageHidden();
      run.realtime
        // A surface read after the change was made holds it, and asks for nothing (readAfter): asked before its rule, which
        // keeps a page for its own page (onlyOnItsPage) a change it already holds. Teammates' and other tabs' changes
        // are later than any read of this tab's and read as ever.
        .filter((o) => !readAfter(run, o, at) && wantsRefresh(o, table, change))
        .forEach((o) => {
          // Nobody is looking: held, and read as the page comes in front, but what says itself in the title and the badge.
          if (hidden && !READ_WHILE_HIDDEN.has(o.key) && run.passes) {
            run.passes.holdWhileHidden(o);
            return;
          }
          const told = run.heard.get(o.key);
          if (told) told.push(change);
          else run.heard.set(o.key, [change]);
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
  // The one pass that reads everything again: a return, the network back, a join of the feed, the page in front, the day's turn.
  const passes = passesOf({
    overrides,
    lanes: BOOT_LANES,
    read: (o) => refreshSurface(run, o, "refresh"),
    readFrom: (o) => run.readFrom.get(readSlot(o)),
    here: (list) => readHere(list),
    drawn: (o) => screenOwn(window)(o),
    order: () => screenRank(window),
    stopped: () => run.cancelled,
  });
  run.passes = passes;
  const boot = bootInPasses(run);
  const feed = watchLiveFeed(run, boot.booted);
  joinFeedEarly(run, boot, joinFeed, feed);
  const stopDay = watchTheDayTurn({ overrides, passes, stopped: () => run.cancelled });
  // What the clock moves with no record changing: remade each minute where drawn, read again where a source tells nothing, and
  // anything drawn here not read for a quarter of an hour (the rolling heal).
  const stopClock = watchTheClock({
    overrides,
    readFrom: (o) => run.readFrom.get(readSlot(o)),
    asked: (o) => run.timers.has(o.key),
    read: (o) => void refreshSurface(run, o, "refresh"),
    stopped: () => run.cancelled,
  });

  return () => {
    run.cancelled = true;
    boot.releaseAnswers();
    activeRefresh = null;
    activeOverrides = [];
    passes.stop();
    stopDay();
    stopClock();
    run.leaveWorkspaceWait?.();
    run.timers.forEach((t) => clearTimeout(t));
    feed.stop();
    if (run.unsubscribe) run.unsubscribe();
    // What this runner watched goes with it; the next one says what it finds.
    setConnection({ offline: false, realtimeDown: false });
  };
}

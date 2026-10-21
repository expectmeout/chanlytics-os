/**
 * Stale-while-revalidate cache for flipped surfaces.
 *
 * The problem this exists to solve: the mockup ships seed data in the same
 * window globals the real data lands in, so every boot painted FABRICATED
 * numbers for as long as the first fetch took, then swapped them for real
 * ones. A flash of wrong data is worse than a flash of no data — on a
 * dashboard about someone's customers it is briefly lying to them.
 *
 * So on a successful apply we snapshot the globals a surface owns, and on the
 * next boot we restore them SYNCHRONOUSLY before React ever renders. A refresh
 * then paints real (seconds-old) data immediately and revalidates in the
 * background — no seed frame, no skeleton, no transition.
 *
 * Kept in the browser's local storage, one slot per workspace, so a new tab and the next visit paint at once too: a
 * first load on a phone waited a second or two for its reads where a reload of a warm tab drew in under one (field data,
 * 12-19 Oct 2026; the loadability review, 19 Oct 2026). It holds real customer messages, so it is kept only while the
 * session that read them is: every sign-in clears it before anything is read (login's signInLanding, Google's start), and
 * a sign-out, a 401, a switch of workspace or of person seals it (sealSurfaceCache). The proxy sends a visitor with no
 * session to sign in before this page loads, so nobody without one is painted it. A snapshot older than a day is never
 * drawn (MAX_AGE_MS): what a page paints from it is read again at once, and a day is as stale as it may look meanwhile.
 * Build-keyed, so a deploy starts cold. Per-tab memory (a view's place, a draft) stays the tab's own (tab-memory.ts).
 */

import { clearReadCaches } from "./read-cache";
import { restoreSurfaceValue, surfaceValue } from "../surfaces/surface-values";
import type { SurfaceKey } from "../surfaces/surface-values";
import { clearTabMemory } from "./tab-memory";
import { getActiveWorkspace } from "./workspace";
import { publicEnv } from "@/lib/public-env";
import { DAY_MS } from "@chanlytics/contracts";

// Storage slot names (not a credential — the secret scanner reads "KEY" as one): one per workspace, by the address's word.
const CACHE_PREFIX = "chanlytics.surfaces.v2:";
/** The slot of the workspace the address names; the home's own where it names none. */
const slotName = (): string => `${CACHE_PREFIX}${getActiveWorkspace() ?? "-"}`;
/** The oldest snapshot drawn: a day. Older, the page waits for its reads as a first visit does. */
const MAX_AGE_MS = DAY_MS;

/** The browser's local storage, or null where it is refused (a private window, a sandbox, a test's stand-in). */
function cacheStore(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
/**
 * Where a surface's typed value (surface-values.ts) sits in its snapshot, beside the window globals it also owns: what a
 * surface's own trim (`trimSnapshot`, Leads' first hundred rows) reads and rewrites.
 */
export const SURFACE_VALUE_SLOT = "$value";
const VALUE_SLOT = SURFACE_VALUE_SLOT;
const BUILD = publicEnv.NEXT_PUBLIC_BUILD_SHA;
/** A payload larger than this isn't worth the main-thread cost to parse. */
const MAX_BYTES = 2_000_000;
/**
 * A snapshot is written this long after the last one, and never later than MAX_WAIT_MS after the first one waiting:
 * a boot lands twenty-odd surfaces over a few seconds, and each used to parse, re-serialise and write the whole blob
 * (up to 2 MB) at once -- measured on an Android WebView (27 Sep 2026), 0.4 s of the main thread in setItem alone
 * while Today loaded. The page's hide writes what waits (a reload, a tab closed or put away), so the next load
 * still paints the latest.
 */
const WRITE_AFTER_MS = 1000;
const MAX_WAIT_MS = 5000;

interface CacheBlob {
  build: string;
  /** When it was written (ms): a snapshot older than MAX_AGE_MS is not drawn. */
  savedAt: number;
  /**
   * The workspace the address named when these rows were read (`/w/<slug>`, as written there; null off a workspace
   * page): every read names the address's workspace (client/api.ts), so it is the workspace the rows are of. A load at
   * another address draws none of them (hydrateSurfaceCache), and a read there starts a cache of its own rather than
   * adding to this one (snapshotSurface).
   */
  at: string | null;
  tenant: string | null;
  surfaces: Record<string, Record<string, unknown>>;
}

/**
 * The slot as this tab last read or wrote it, kept parsed. A snapshot builds on what is cached, and each one used to
 * parse the whole slot again, up to 2 MB, on every read of every surface once the boot's write had gone. The slot is
 * this tab's own, so what it holds is what was last written here: it is read again (a string, compared) but parsed only
 * when it is not that.
 */
let parsedCopy: { raw: string; blob: CacheBlob | null } | null = null;

/** The slot, parsed; `own` for a copy of its own, which the page's globals may take and change. */
function readCacheBlob(own = false): CacheBlob | null {
  try {
    const raw = cacheStore()?.getItem(slotName());
    if (!raw) return null;
    if (!own && parsedCopy?.raw === raw) return parsedCopy.blob;
    const parsed = JSON.parse(raw) as CacheBlob;
    // A deploy can change a viewmodel's shape; restoring the old shape would
    // render garbage or throw inside a legacy component. Build-keyed, so a
    // new deploy simply starts cold. And a day old at most.
    const fresh = typeof parsed?.savedAt === "number" && Date.now() - parsed.savedAt < MAX_AGE_MS;
    const blob = parsed && parsed.build === BUILD && parsed.surfaces && fresh ? parsed : null;
    if (!own) parsedCopy = { raw, blob };
    return blob;
  } catch {
    return null; // private mode, quota, corrupt entry — behave as a cold boot
  }
}

function write(blob: CacheBlob): void {
  try {
    let raw = JSON.stringify(blob);
    // Too big to be worth parsing on the next boot: shed the biggest surfaces until it fits. It used to be removed
    // whole, so a Leads view of 500 rows and a Show more emptied Today, Inbox and People with it, and the owners
    // it hit were the ones using the finder most. Dropping the write silently would be worse than either: the
    // OLDER snapshot would stay behind to be painted as current.
    while (raw.length > MAX_BYTES) {
      const sizes = Object.entries(blob.surfaces)
        .map(([k, v]) => [k, JSON.stringify(v).length] as const)
        .sort((a, b) => b[1] - a[1]);
      if (!sizes.length) {
        cacheStore()?.removeItem(slotName());
        return;
      }
      console.warn("surface_cache_oversize", raw.length, sizes[0][0]);
      delete blob.surfaces[sizes[0][0]];
      raw = JSON.stringify(blob);
    }
    setSlot(raw);
    parsedCopy = { raw, blob };
  } catch {
    /* quota or private mode — caching is an optimisation, never a requirement */
  }
}

/**
 * The slot written; where the browser's quota refuses it, the other workspaces' slots go first and it is tried once more:
 * the workspace on screen is the one worth painting next.
 */
function setSlot(raw: string): void {
  const local = cacheStore();
  if (!local) return;
  const name = slotName();
  try {
    local.setItem(name, raw);
  } catch {
    for (const other of slotsOf(local)) if (other !== name) local.removeItem(other);
    local.setItem(name, raw);
  }
}

/** Every workspace's slot this browser holds. */
function slotsOf(local: Storage): string[] {
  const names: string[] = [];
  for (let i = 0; i < local.length; i++) {
    const name = local.key(i);
    if (name?.startsWith(CACHE_PREFIX)) names.push(name);
  }
  return names;
}

/** What this tab has cached and not written yet: the freshest copy, so every read here looks at it first. */
let pending: CacheBlob | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let waitingSince = 0;
let hideHeard = false;
/**
 * Signing out closed the cache: nothing this page reads from now on is kept. A sign-out clears the rows and then posts
 * the form, inside the app after up to two seconds for the phone to be forgotten, while the runner still runs; a read
 * landing in between was written back by the next snapshot, and the next person to sign in on that tab was painted the
 * last one's rows before the tenant guard could look (defect 52). Closed for the page's life: a sign-out leaves it.
 */
let sealed = false;

function current(): CacheBlob | null {
  return pending ?? readCacheBlob();
}

/** The workspace the address names now: the one every read this page makes is about. */
const addressed = (): string | null => getActiveWorkspace();

/** Whether a cache is of the workspace the address names: the only one whose rows this page may draw or add to. */
const ofThisAddress = (blob: CacheBlob | null): blob is CacheBlob => !!blob && blob.at === addressed();

/** Drop the slot and what waits for it, and nothing else the tab keeps: what it held is another workspace's. */
function dropSlot(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  pending = null;
  parsedCopy = null;
  try {
    cacheStore()?.removeItem(slotName());
  } catch {
    /* nothing to drop */
  }
}

/** Write what waits, now. The page's hide calls it; a test reading the tab's storage calls it first. */
export function flushSurfaceCache(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  const blob = pending;
  pending = null;
  if (blob) write(blob);
}

function keep(blob: CacheBlob): void {
  if (sealed) return;
  const now = Date.now();
  if (!pending) waitingSince = now;
  pending = blob;
  if (!hideHeard && typeof window !== "undefined" && typeof window.addEventListener === "function") {
    hideHeard = true;
    window.addEventListener("pagehide", flushSurfaceCache);
    window.addEventListener("visibilitychange", () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") flushSurfaceCache();
    });
  }
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  if (now - waitingSince >= MAX_WAIT_MS) return flushSurfaceCache();
  writeTimer = setTimeout(flushWhenIdle, Math.min(WRITE_AFTER_MS, MAX_WAIT_MS - (now - waitingSince)));
}

/**
 * The write, once the page is idle as well as quiet: the snapshot is up to 2 MB of text made and stored in one go, and
 * written on the timer alone it fell under a press or a swipe after a refresh (the strips review, 18 Oct 2026: 134 ms on a
 * phone's CPU). The page hidden still writes at once (flushSurfaceCache).
 */
function flushWhenIdle(): void {
  writeTimer = null;
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(() => flushSurfaceCache(), { timeout: MAX_WAIT_MS });
  else flushSurfaceCache();
}

/** Restore cached globals onto window. Call ONCE, at module scope, after the
 *  manifest has installed its seeds so the cache wins. Returns the surface
 *  keys that were restored — those surfaces already have real data and must
 *  not show a loading state. */
export function hydrateSurfaceCache(): Set<string> {
  const restored = new Set<string>();
  // A copy of its own: the pages change what they are handed in place, and the kept copy stays what was written.
  const blob = pending ?? readCacheBlob(true);
  if (!blob) return restored;
  // Rows read for another workspace are never drawn under this one's address: a phone's push for workspace B opened
  // /w/b on a tab holding A's, and B's address drew A's Inbox, People, Today and name until the workspaces read landed
  // (the runner's tenant guard looks only then). On a workspace page they are dropped, since nothing here may build on
  // them; off one (the home, which sends the tab on to its workspace) they are left for that workspace's own load.
  if (!ofThisAddress(blob)) {
    if (addressed()) dropSlot();
    return restored;
  }
  const w = window as unknown as Record<string, unknown>;
  for (const [key, globals] of Object.entries(blob.surfaces)) {
    try {
      for (const [name, value] of Object.entries(globals)) {
        if (name === VALUE_SLOT) restoreSurfaceValue(key, value);
        else w[name] = value;
      }
      restored.add(key);
    } catch {
      /* one bad surface must not stop the others */
    }
  }
  return restored;
}

/** What a snapshot of a surface holds: the globals it owns, as they are on window now. */
function globalsNow(globals: string[]): Record<string, unknown> {
  const w = window as unknown as Record<string, unknown>;
  const snap: Record<string, unknown> = {};
  for (const name of globals) {
    if (w[name] !== undefined) snap[name] = w[name];
  }
  return snap;
}

/**
 * Persist the globals a surface owns, and its typed value where it has one (`value`, the key it is published under),
 * after its apply succeeded. `trim` is the surface's own say over what the cache holds of it (Leads: its first hundred
 * rows, which is all an instant paint needs); the window's globals are untouched.
 */
export function snapshotSurface(
  key: string,
  globals: string[],
  tenant: string | null,
  trim?: (snap: Record<string, unknown>) => Record<string, unknown>,
  value?: SurfaceKey,
): void {
  if ((!globals.length && !value) || sealed) return;
  const kept = current();
  // Rows join only a cache of the same workspace, by both its names: the address's, and the one the server resolved
  // where both have said it. Any other cache is another workspace's, and these rows start one of their own.
  const was = ofThisAddress(kept) && (!tenant || !kept.tenant || kept.tenant === tenant) ? kept : null;
  const snap = globalsNow(globals);
  const typed = value ? surfaceValue(value) : undefined;
  if (typed !== undefined) snap[VALUE_SLOT] = typed;
  // A new object over the one kept, never the kept one changed: what was written stays what it says.
  keep({
    build: BUILD,
    savedAt: Date.now(),
    at: addressed(),
    tenant: tenant || (was?.tenant ?? tenant),
    surfaces: { ...was?.surfaces, [key]: trim ? trim(snap) : snap },
  });
}

/**
 * A surface the page changed in place, taken into the tab's cached copy for the workspace the page is in (the bridge's
 * `__ACTIVE_WORKSPACE`, read here once for every caller): a saved view of People, a person a mark says was read.
 */
export function resnapshotHere(key: string, globals: string[], value?: SurfaceKey): void {
  resnapshotSurface(key, globals, window.__ACTIVE_WORKSPACE ?? null, value);
}

// Only into an entry already cached for this tenant: a new one could carry no tenant, and the runner's guard skips those.
export function resnapshotSurface(key: string, globals: string[], tenant: string | null, value?: SurfaceKey): void {
  const blob = current();
  if (sealed || !ofThisAddress(blob) || !tenant || blob.tenant !== tenant || !blob.surfaces[key]) return;
  const snap = globalsNow(globals);
  const typed = value ? surfaceValue(value) : undefined;
  if (typed !== undefined) snap[VALUE_SLOT] = typed;
  keep({ ...blob, savedAt: Date.now(), surfaces: { ...blob.surfaces, [key]: snap } });
}

/** The workspace the server resolved for the rows cached at this address; null where nothing is cached for it. */
export function cachedTenant(): string | null {
  const blob = current();
  return ofThisAddress(blob) ? blob.tenant : null;
}

/** Sign-in, sign-out, 401, and tenant mismatch all clear it — cached customer data must
 *  never outlive the session that was allowed to see it. Every workspace's slot goes. */
export function clearSurfaceCache(): void {
  // What waits to be written goes first: a write after the clear would put the rows back.
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  pending = null;
  parsedCopy = null;
  try {
    // Every workspace's rows this browser kept: whoever comes next, signed in again or someone else, starts cold. This
    // address's by its name too, whatever the store says of its length.
    const local = cacheStore();
    if (local) for (const name of new Set([slotName(), ...slotsOf(local)])) local.removeItem(name);
  } catch {
    /* nothing to clear */
  }
  try {
    // What the pages kept in this tab (a view's place, a draft) goes with the rows it was kept beside.
    clearTabMemory(sessionStorage);
  } catch {
    /* nothing to clear */
  }
  // And every read the pages kept, the people this tab opened among them, in memory and in the tab (read-cache.ts):
  // outside the try, so storage refusing its own slot still lets go of what is in memory.
  clearReadCaches();
}

/**
 * Leaving the page as someone else, or for another workspace: the cache cleared, and closed for the rest of this page's
 * life, so no read can put rows back. A read landing between a clear and the page's unload was written back by the next
 * second's write or the page's hide, so every way out that changes who is looking or what they look at seals it: a
 * sign-out, a 401, a switch, the second step, a phone's push for another workspace, an account deleted.
 */
export function sealSurfaceCache(): void {
  clearSurfaceCache();
  sealed = true;
}

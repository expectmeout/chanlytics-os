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
 * sessionStorage, not localStorage, on purpose: this holds real customer
 * messages. It must survive a refresh (it does — sessionStorage is per-tab and
 * persists across reloads) and die with the tab.
 */

import { clearTabMemory } from "./tab-memory";

// Storage slot name (not a credential — the secret scanner reads "KEY" as one).
const CACHE_NAME = "chanlytics.surfaces.v1";
const BUILD = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
/** A payload larger than this isn't worth the main-thread cost to parse. */
const MAX_BYTES = 2_000_000;

interface CacheBlob {
  build: string;
  tenant: string | null;
  surfaces: Record<string, Record<string, unknown>>;
}

function read(): CacheBlob | null {
  try {
    const raw = sessionStorage.getItem(CACHE_NAME);
    if (!raw) return null;
    const blob = JSON.parse(raw) as CacheBlob;
    // A deploy can change a viewmodel's shape; restoring the old shape would
    // render garbage or throw inside a legacy component. Build-keyed, so a
    // new deploy simply starts cold.
    if (!blob || blob.build !== BUILD || !blob.surfaces) return null;
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
        sessionStorage.removeItem(CACHE_NAME);
        return;
      }
      console.warn("surface_cache_oversize", raw.length, sizes[0][0]);
      delete blob.surfaces[sizes[0][0]];
      raw = JSON.stringify(blob);
    }
    sessionStorage.setItem(CACHE_NAME, raw);
  } catch {
    /* quota or private mode — caching is an optimisation, never a requirement */
  }
}

/** Restore cached globals onto window. Call ONCE, at module scope, after the
 *  manifest has installed its seeds so the cache wins. Returns the surface
 *  keys that were restored — those surfaces already have real data and must
 *  not show a loading state. */
export function hydrateSurfaceCache(): Set<string> {
  const restored = new Set<string>();
  const blob = read();
  if (!blob) return restored;
  const w = window as unknown as Record<string, unknown>;
  for (const [key, globals] of Object.entries(blob.surfaces)) {
    try {
      for (const [name, value] of Object.entries(globals)) w[name] = value;
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
 * Persist the globals a surface owns, after its apply succeeded. `trim` is the surface's own say over what the cache
 * holds of it (Leads: its first hundred rows, which is all an instant paint needs); the window's globals are untouched.
 */
export function snapshotSurface(
  key: string,
  globals: string[],
  tenant: string | null,
  trim?: (snap: Record<string, unknown>) => Record<string, unknown>,
): void {
  if (!globals.length) return;
  const blob = read() ?? { build: BUILD, tenant, surfaces: {} };
  blob.build = BUILD;
  if (tenant) blob.tenant = tenant;
  const snap = globalsNow(globals);
  blob.surfaces[key] = trim ? trim(snap) : snap;
  write(blob);
}

// Only into an entry already cached for this tenant: a new one could carry no tenant, and the runner's guard skips those.
export function resnapshotSurface(key: string, globals: string[], tenant: string | null): void {
  const blob = read();
  if (!blob || !tenant || blob.tenant !== tenant || !blob.surfaces[key]) return;
  blob.surfaces[key] = globalsNow(globals);
  write(blob);
}

export function cachedTenant(): string | null {
  return read()?.tenant ?? null;
}

/** Sign-out, 401, and tenant mismatch all clear it — cached customer data must
 *  never outlive the session that was allowed to see it. */
export function clearSurfaceCache(): void {
  try {
    sessionStorage.removeItem(CACHE_NAME);
    // What the pages kept in this tab (a view's place, a draft) goes with the rows it was kept beside.
    clearTabMemory(sessionStorage);
  } catch {
    /* nothing to clear */
  }
}

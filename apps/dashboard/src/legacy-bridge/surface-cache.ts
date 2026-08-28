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
    const raw = JSON.stringify(blob);
    if (raw.length > MAX_BYTES) {
      // Dropping the write silently would leave the OLDER snapshot behind to
      // be painted as current on the next boot. Stale-forever is worse than
      // cold, so remove it.
      console.warn("surface_cache_oversize", raw.length);
      sessionStorage.removeItem(CACHE_NAME);
      return;
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

/** Persist the globals a surface owns, after its apply succeeded. */
export function snapshotSurface(key: string, globals: string[], tenant: string | null): void {
  if (!globals.length) return;
  const w = window as unknown as Record<string, unknown>;
  const blob = read() ?? { build: BUILD, tenant, surfaces: {} };
  blob.build = BUILD;
  if (tenant) blob.tenant = tenant;
  const snap: Record<string, unknown> = {};
  for (const name of globals) {
    if (w[name] !== undefined) snap[name] = w[name];
  }
  blob.surfaces[key] = snap;
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
  } catch {
    /* nothing to clear */
  }
}

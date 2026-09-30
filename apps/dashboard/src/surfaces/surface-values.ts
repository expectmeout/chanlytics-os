/**
 * What a surface that has left the shell reads from the seam, typed (decision 0015, step 3).
 *
 * A legacy page reads its rows off `window` (`window.__REPORTS`), which is the only place a script the frame loads can
 * find them. A TSX surface imports: it asks for its surface by key (`useSurface("reports")`, src/surfaces/use-surface.ts)
 * and is handed the value the override published, of the type the key says. This is the store behind that: one value
 * for each key, written by the override that owns the surface (`setSurfaceValue`), and the surface cache's (it keeps
 * the value beside the window's globals, and gives it back before React draws, `restoreSurfaceValue`).
 *
 * A key may also name a **mirror**, the window global the pages that have not moved still read (Today and Ask read
 * `__REPORTS`). The mirror is written whenever the value is, so the two never say different things, and it is a line
 * to delete on the day its last reader moves: `declareSurfaceValue("reports", "__REPORTS")` is the whole of it.
 *
 * A value is a surface's whole answer, an object the override replaces and never changes in place, so a component that
 * holds it sees it change by identity (React's `useSyncExternalStore` asks for exactly that).
 */
import type { ReportsSurface } from "./reports/surface";
import type { GoogleSurface } from "../legacy-bridge/google";

/** Every surface a TSX surface can read, by the key its override is registered under. */
export interface SurfaceValues {
  reports: ReportsSurface;
  google: GoogleSurface;
}

export type SurfaceKey = keyof SurfaceValues;

const values = new Map<SurfaceKey, SurfaceValues[SurfaceKey]>();
const mirrors = new Map<SurfaceKey, string>();

/** Name the window global the pages still on the shell read this surface under, and publish what is held under it. */
export function declareSurfaceValue(key: SurfaceKey, mirror: string): void {
  mirrors.set(key, mirror);
  const have = values.get(key);
  if (have !== undefined) mirrorTo(key, have);
}

function mirrorTo(key: SurfaceKey, value: SurfaceValues[SurfaceKey] | undefined): void {
  const name = mirrors.get(key);
  if (name && typeof window !== "undefined") Reflect.set(window, name, value);
}

/** The override's answer, published: held here, and mirrored where the pages that have not moved look. */
export function setSurfaceValue<K extends SurfaceKey>(key: K, value: SurfaceValues[K] | undefined): void {
  if (value === undefined) values.delete(key);
  else values.set(key, value);
  mirrorTo(key, value);
}

/** What the surface last published, or nothing before its first read. */
export function surfaceValue<K extends SurfaceKey>(key: K): SurfaceValues[K] | undefined {
  return values.get(key) as SurfaceValues[K] | undefined;
}

/** The cache handing a surface's value back at boot: a value read in an earlier visit, painted before the first read. */
export function restoreSurfaceValue(key: string, value: unknown): void {
  if (!isSurfaceKey(key)) return;
  setSurfaceValue(key, value as SurfaceValues[SurfaceKey]);
}

/** Whether a name is a key of `SurfaceValues`: the cache is written by keys of every surface, the typed or not. */
function isSurfaceKey(key: string): key is SurfaceKey {
  return Object.hasOwn(SURFACE_KEYS, key);
}

// The keys as a value, so a name from the cache is checked against the same list the type is. A key added to
// `SurfaceValues` without a line here is a type error.
const SURFACE_KEYS: Record<SurfaceKey, true> = { reports: true, google: true };

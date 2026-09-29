/**
 * Which surfaces hold REAL data right now, and which tried and failed.
 *
 * This is the seam's whole honesty guarantee reduced to three sets, and it
 * lives alone in this file for two reasons: it is the piece that has broken
 * twice, and it is pure — no Supabase, no DOM, no React — so a test can drive
 * it directly instead of reaching into a module full of side effects.
 *
 * The distinction that matters is READY vs SETTLED. An earlier version marked
 * a surface ready inside setStatus regardless of outcome, so a boot that
 * FAILED still opened the route gate and the surface painted the mockup's
 * seeds as though they were the customer's data: Today claiming "$1,840 booked
 * across 12 appointments", the Inbox listing eleven invented people with
 * working Snooze buttons. Permanently, because the focus-refetch skipped
 * seeded surfaces. Only a real payload may open the gate.
 *
 * Status semantics:
 *   seeded   — boot failed or never ran; the surface has no real data
 *   live     — real data, current
 *   degraded — real data, stale (a refresh failed after a good load)
 *
 * "degraded" may only ever describe a surface that HAS real data; calling a
 * never-loaded surface stale would upgrade the lie rather than tell it.
 *
 * And each surface's own signal (at the foot): a number that moves when its
 * rows land or its status changes, and the hook a component redraws on.
 */
export type SurfaceStatus = "seeded" | "live" | "degraded";

const statuses = new Map<string, SurfaceStatus>();
const ready = new Set<string>();
const failed = new Set<string>();
const listeners = new Set<() => void>();

/**
 * Record a surface's status after a read. The listeners hear it only when something changed -- the status, whether
 * the surface is ready, whether it failed -- and so does the surface's own signal (below). Every read
 * used to tell every listener, and the shell drew itself whole on each: a live surface read again and still live is
 * not news. What a read brought is the surface's own event, heard by what draws it.
 */
export function setStatus(key: string, s: SurfaceStatus): void {
  const was = `${statuses.get(key)}|${ready.has(key)}|${failed.has(key)}`;
  if (s === "seeded") failed.add(key);
  else {
    failed.delete(key);
    ready.add(key); // only a real payload opens the gate
  }
  statuses.set(key, s);
  if (`${s}|${ready.has(key)}|${failed.has(key)}` === was) return;
  surfaceMoved(key);
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

export function getSurfaceStatuses(): ReadonlyMap<string, SurfaceStatus> {
  return statuses;
}

export function onSurfaceStatusChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Whether this device can reach the workspace, and whether the live feed that
 * keeps the surfaces current is up. Kept beside the surfaces' own status, and
 * heard through the same listeners, because the shell reads them together: a
 * surface can be live by its last read on a device that has since gone offline.
 */
export interface Connection {
  offline: boolean;
  realtimeDown: boolean;
}

const connection: Connection = { offline: false, realtimeDown: false };

/** Record what changed: the listeners hear it once, and not at all when nothing did. */
export function setConnection(next: Partial<Connection>): void {
  let changed = false;
  for (const k of ["offline", "realtimeDown"] as const) {
    const v = next[k];
    if (v !== undefined && v !== connection[k]) {
      connection[k] = v;
      changed = true;
    }
  }
  if (changed) listeners.forEach((l) => l());
}

export function getConnection(): Connection {
  return { ...connection };
}

/* ---------------------------- each surface's own signal ---------------------------- */

/**
 * A number for each surface that moves when its rows land or its status changes, and a hook that redraws a component
 * when one of the surfaces it names moves (`useSurface(keys)`, over React's useSyncExternalStore).
 *
 * The shell used to hear one notice for every surface: `setStatus` called every listener on each read, and LegacyApp
 * drew the whole shell again on each -- about seven whole-shell renders for one inbound message, the sidebar, the top
 * bar and every page, whatever the read was of. A component now names the surfaces it draws and is drawn again when
 * one of them moves, and by nothing else; the shell names the surfaces of the route on screen (surface-registry.ts
 * routeSurfaces).
 *
 * A surface's rows land where it says so: each override's own events (`surface:clients`, dispatched by the seam after
 * its read, and by the few places that publish a surface's rows outside it -- a Leads view, a held Calendar window,
 * People read again for who is looking), heard here and counted against its key (`hearSurfaces`). Its status moves
 * in setStatus above, which tells this only when it changed. No React import: the hook is made over the React it is
 * given, so the page tests' stub React runs it as the app's React does.
 */
const versions = new Map<string, number>();
const heard = new Map<string, Set<() => void>>();

/** The surface moved: its rows landed or its status changed. Everyone who named it is told, once. */
export function surfaceMoved(key: string): void {
  versions.set(key, (versions.get(key) ?? 0) + 1);
  for (const fn of [...(heard.get(key) ?? [])]) fn();
}

/** How often these surfaces have moved, summed: a number that changes whenever any of them moves. */
export function surfaceVersion(keys: readonly string[]): number {
  let n = 0;
  for (const k of keys) n += versions.get(k) ?? 0;
  return n;
}

/** Hear these surfaces move; answers the stop. A key named twice is heard once. */
export function onSurfaceMoved(keys: readonly string[], fn: () => void): () => void {
  const named = [...new Set(keys)];
  for (const k of named) {
    let set = heard.get(k);
    if (!set) heard.set(k, (set = new Set()));
    set.add(fn);
  }
  return () => {
    for (const k of named) heard.get(k)?.delete(fn);
  };
}

/** What `hearSurfaces` needs of an override: its key, and the events that say its rows landed. */
export interface SurfaceEvents {
  key: string;
  events?: readonly string[];
}

/**
 * Count each surface's own events against its key, on this window, for as long as the page lives: the seam
 * dispatches them after a read, and so does every place that publishes a surface's rows outside a read. Answers the
 * stop, for a test's window.
 */
export function hearSurfaces(overrides: readonly SurfaceEvents[], win: Window = window): () => void {
  const offs: Array<() => void> = [];
  for (const o of overrides) {
    for (const e of o.events ?? []) {
      const moved = () => surfaceMoved(o.key);
      win.addEventListener(e, moved);
      offs.push(() => win.removeEventListener(e, moved));
    }
  }
  return () => offs.forEach((off) => off());
}

/** The part of React the hook needs: the app's React, or the page tests' stub. */
export interface SurfaceReact {
  useCallback<T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]): T;
  useSyncExternalStore<T>(subscribe: (fn: () => void) => () => void, snapshot: () => T, server?: () => T): T;
}

/** What a component names: a surface, a few, or a route (the surfaces its page is drawn from). */
export type SurfaceNames = string | readonly string[] | { page: string; param?: string | null };

/**
 * `useSurface(names)`: redraw this component when one of these surfaces moves, and answer how often they have. One
 * key, a list, or a route, which `routeKeys` turns into the surfaces its page is drawn from (surface-registry.ts
 * routeSurfaces); the list is compared by its words, so a new array each draw is the same subscription.
 */
export function surfaceHook(
  react: SurfaceReact,
  routeKeys?: (page: string, param?: string | null) => readonly string[],
): (names: SurfaceNames) => number {
  return function useSurface(names) {
    const list =
      typeof names === "string" ? [names] : "page" in names ? (routeKeys?.(names.page, names.param) ?? []) : names;
    const words = list.join(",");
    // The words are what the subscription is of: the list itself is a new array on most draws.
    const subscribe = react.useCallback((fn: () => void) => onSurfaceMoved(words ? words.split(",") : [], fn), [words]);
    const snapshot = () => surfaceVersion(list);
    return react.useSyncExternalStore(subscribe, snapshot, snapshot);
  };
}

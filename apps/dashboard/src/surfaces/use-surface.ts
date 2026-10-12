/**
 * How a TSX surface reads its data (decision 0015, step 3): `useSurface("reports")` answers the value the surface's
 * override last published, of the type its key says, and draws the component again when the surface moves (its rows
 * landed, its status changed: the same signal a legacy page's `useSurface` hears). Before the first read it answers
 * nothing, which a surface says as its own empty state; the cache may already have given it a value from the last visit.
 *
 * The typed door onto the seam, where the shell's pages read `window.__PEOPLE`. A surface reads nothing off `window`.
 */
import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { followState, surfaceValue } from "./surface-values";
import type { FollowState, SurfaceKey, SurfaceValues } from "./surface-values";
import { getSurfaceStatuses, isSurfaceFailed, onSurfaceMoved } from "@/legacy-bridge/surface-status";
import { partBegins, partReady } from "@/client/page-speed";

export function useSurface<K extends SurfaceKey>(key: K): SurfaceValues[K] | undefined {
  const subscribe = useCallback((fn: () => void) => onSurfaceMoved([key], fn), [key]);
  const snapshot = () => surfaceValue(key);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Whether the surface's read failed and none ever landed (`isSurfaceFailed`, the status the shell's own gate reads): a surface
 * that answers nothing is either not read yet or could not be, and a page that must say which draws this beside
 * `useSurface`. Drawn again when the surface's status moves, which a value that stays absent does not.
 */
export function useSurfaceFailed(key: SurfaceKey): boolean {
  const subscribe = useCallback((fn: () => void) => onSurfaceMoved([key], fn), [key]);
  const snapshot = () => isSurfaceFailed(key);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Whether a read of this surface has come back in this document, with real data or with none. Until one has, what the
 * surface holds, if anything, is what the cache kept from an earlier visit, and the read that is out is of what the page
 * opened on: a page that follows its own address asks for nothing meanwhile, or it would only read it twice.
 */
export function useSurfaceSettled(key: SurfaceKey): boolean {
  const subscribe = useCallback((fn: () => void) => onSurfaceMoved([key], fn), [key]);
  const snapshot = () => getSurfaceStatuses().has(key);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** A surface that follows the period Reports shows: what it holds, and where that stands against the period shown. */
export interface Follower<V> {
  value: V | undefined;
  state: FollowState;
}

/**
 * A read that follows the period Reports shows (reports/period-surface.ts): its value, and `state`: "current" when the value is
 * of the period shown, "coming" while the read for a pick is out (the value, if any, is of the period left, and a page dims it),
 * "failed" when that read could not be made (a page says so, with its Retry, and never holds the period it left for good). Drawn
 * again when the surface moves: its rows landed, its status changed, or the period shown did.
 */
export function useFollower<K extends SurfaceKey>(key: K): Follower<SurfaceValues[K]> {
  const value = useSurface(key);
  const subscribe = useCallback((fn: () => void) => onSurfaceMoved([key], fn), [key]);
  const snapshot = () => followState(key);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { value, state };
}

/**
 * Say when a part of the page is drawn with its rows (client/page-speed.ts, decision 0053): `page` as the field data
 * names it (contracts vitalsPageOf), `part` the part's own word, `ready` whether what it draws has arrived (its
 * surface's value, a read it waited for; an empty state drawn is drawn). Its READY is the frame after the first draw
 * with `ready`, timed from the page's start, so it says which part a person waited for. A part that shows one thing at a
 * time (an open thread, a call) names it as `key`, `null` when nothing is open: each new one is timed from the press
 * that opened it, as a move inside its page. Call it before any early return, as any hook.
 */
export function usePartShown(page: string, part: string, ready: boolean, key?: string | null): void {
  // Read at the start of a run: whether its rows were there as it began (the tab's cache, a view held).
  const readyNow = useRef(ready);
  readyNow.current = ready;
  const begun = useRef(false);
  const runKey = key === undefined ? "" : key;
  useLayoutEffect(() => {
    if (runKey === null) return;
    partBegins({ page, part, key: runKey, warm: readyNow.current, changed: begun.current });
    begun.current = true;
  }, [page, part, runKey]);
  useLayoutEffect(() => {
    if (runKey !== null && ready) partReady(page, part, runKey);
  }, [page, part, runKey, ready]);
}

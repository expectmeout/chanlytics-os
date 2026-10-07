/**
 * How a TSX surface reads its data (decision 0015, step 3): `useSurface("reports")` answers the value the surface's
 * override last published, of the type its key says, and draws the component again when the surface moves (its rows
 * landed, its status changed: the same signal a legacy page's `useSurface` hears). Before the first read it answers
 * nothing, which a surface says as its own empty state; the cache may already have given it a value from the last visit.
 *
 * The typed door onto the seam, where the shell's pages read `window.__PEOPLE`. A surface reads nothing off `window`.
 */
import { useCallback, useSyncExternalStore } from "react";
import { surfaceValue } from "./surface-values";
import type { SurfaceKey, SurfaceValues } from "./surface-values";
import { isSurfaceDegraded, isSurfaceFailed, onSurfaceMoved } from "@/legacy-bridge/surface-status";

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
 * Whether the surface holds a read and its latest one failed (`isSurfaceDegraded`): what `useSurfaceFailed` leaves unsaid once any
 * read has landed. A page that asks for a view other than the one it holds (a period picked) says the failure by this, and not by
 * dimming the held view for good. Drawn again when the surface's status moves.
 */
export function useSurfaceDegraded(key: SurfaceKey): boolean {
  const subscribe = useCallback((fn: () => void) => onSurfaceMoved([key], fn), [key]);
  const snapshot = () => isSurfaceDegraded(key);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

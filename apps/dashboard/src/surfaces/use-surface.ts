/**
 * How a TSX surface reads its data (decision 0015, step 3): `useSurface("reports")` answers the value the surface's
 * override last published, of the type its key says, and draws the component again when the surface moves (its rows
 * landed, its status changed: the same signal a legacy page's `useSurface` hears). Before the first read it answers
 * nothing, which a surface says as its own empty state; the cache may already have given it a value from the last visit.
 *
 * The typed door onto the seam, where the shell's pages read `window.__REPORTS`. A surface reads nothing off `window`.
 */
import { useCallback, useSyncExternalStore } from "react";
import { surfaceValue } from "./surface-values";
import type { SurfaceKey, SurfaceValues } from "./surface-values";
import { onSurfaceMoved } from "@/legacy-bridge/surface-status";

export function useSurface<K extends SurfaceKey>(key: K): SurfaceValues[K] | undefined {
  const subscribe = useCallback((fn: () => void) => onSurfaceMoved([key], fn), [key]);
  const snapshot = () => surfaceValue(key);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

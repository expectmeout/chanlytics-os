import { useCallback } from "react";
import { Surface, type SurfaceHandle } from "@/shell/Surface";

/**
 * More is the workspace with its drawer asked open: everything the four tabs do not hold, in the web's own menu. Asked
 * once, as the page first reports; a re-tap of the tab asks again (the tabs' layout). It was asked on every route the
 * page reported, and the page closes the drawer on each route change, so the two fought.
 */
export default function MoreTab() {
  const onReady = useCallback((h: SurfaceHandle) => h.ask({ t: "menu" }), []);
  return <Surface route="today" tab="more" onReady={onReady} />;
}

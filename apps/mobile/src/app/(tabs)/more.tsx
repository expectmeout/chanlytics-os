import { useCallback } from "react";
import { Surface, type SurfaceHandle } from "@/shell/Surface";
import { front } from "@/shell/front";

/** More is the workspace with its drawer asked open: everything the four tabs do not hold, in the web's own menu. */
export default function MoreTab() {
  const onReady = useCallback((h: SurfaceHandle) => {
    front.set("more", h);
    h.ask({ t: "menu" });
  }, []);
  return <Surface route="today" onReady={onReady} />;
}

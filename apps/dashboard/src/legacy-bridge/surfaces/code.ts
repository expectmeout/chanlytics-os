/**
 * A surface's read as a chunk of its own (lib/code-once.ts), for a surface the frame registers by a light module of its
 * description (what it reads and hears) while the read and its making stay out of every page's first load (the loadability
 * review, 19 Oct 2026). Where the page the tab opened on draws the surface, its first read waits on that code, so the
 * fetch starts at once, as the frame itself loads, and rides beside it; anywhere else it starts as the surface is first
 * read, after the page's own surfaces. Part of the SurfaceData seam (../surface-data.ts).
 */
import { codeOnce, type CodeOnce } from "../../lib/code-once";
import { drawsTheScreen } from "../surface-registry";
import { routeOnScreen } from "../workspace";

/** Whether the page on screen draws this surface; false where there is no page (a node test's stand-in window). */
function drawnNow(key: string): boolean {
  if (typeof window === "undefined" || typeof window.location?.pathname !== "string") return false;
  return drawsTheScreen(key, routeOnScreen());
}

export function surfaceCode<T>(key: string, load: () => Promise<T>): CodeOnce<T> {
  const code = codeOnce(load);
  if (drawnNow(key)) code.warm();
  return code;
}

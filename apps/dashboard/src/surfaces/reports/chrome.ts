/**
 * What the frame draws around Reports' page: which addresses under `reports` the page takes (a lens), and the crumbs, the mount and
 * the strip of views each has (surfaces/routes.ts). The strip is the frame's one (`SurfaceTabs`, its tabs links), as People's scopes
 * are: the page says which lenses there are, the frame draws and moves them. Which are shown is decided from what the shell already
 * holds of the workspace (its list, which Reports' first draw waits for: ROUTE_WAITS), never from a read of Reports' own, so the strip
 * stands at first paint and never gains a tab.
 */
import { isLensParam, lensOf, lensOfRoute, lensRoute, lensesFor, type LensId } from "@chanlytics/contracts";
import { workspaceOverride } from "@/legacy-bridge/surface-data";
import type { SurfaceViews } from "../routes";

/** Which params of `reports` the page draws: a lens's. The Overview is `reports` itself; `reports/overview` is no address. */
export const reportsTakes = (param: string): boolean => isLensParam(param);

/** The lenses shown here, as the frame's strip draws them; `picked` is the one the address names. */
function lensViews(picked: LensId): SurfaceViews {
  const ws = workspaceOverride.current();
  const tabs = lensesFor({ sellsBy: ws?.sells_by, role: ws?.role }).map((l) => ({
    id: l.id,
    label: l.label,
    to: lensRoute(l.id),
    testid: `lens-${l.id}`,
  }));
  return { name: "reports", label: "Which report", testid: "reports-lenses", picked, tabs };
}

/**
 * The crumbs, the mount and the views of an address: Reports alone for the Overview, Reports then the lens for any other, and one
 * mount for them all, because the page follows its address (reports-page.tsx): a lens picked is said in the path, and a page mounted
 * afresh for each would lose its period's dimming and its place with every pick.
 */
export function reportsChrome({ param }: { param: string | null }) {
  const lens = lensOfRoute(param ? `reports/${param}` : "reports") ?? "overview";
  const crumbs = lens === "overview" ? ["Reports"] : [{ label: "Reports", to: "reports" }, lensOf(lens).label];
  return { crumbs, mount: "reports", views: lensViews(lens) };
}

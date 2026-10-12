/**
 * What the frame draws around Reports' page: which addresses under `reports` the page takes (a lens), and the crumbs, the mount and
 * the strip of views each has (surfaces/routes.ts). The strip is the frame's one (`SurfaceTabs`, its tabs links), as People's scopes
 * are: the page says which lenses there are, the frame draws and moves them. Which are shown is decided from what the shell already
 * holds of the workspace (its list, which Reports' first draw waits for: ROUTE_WAITS), never from a read of Reports' own, so the strip
 * stands at first paint and never gains a tab.
 */
import {
  lensIsShown,
  lensOf,
  lensRoute,
  lensesFor,
  reportsParamParts,
  type LensId,
  type LensWho,
  type ReportDays,
} from "@chanlytics/contracts";
import { workspaceOverride } from "@/legacy-bridge/surface-data";
import { adsShown } from "../campaigns/ads/shown";
import type { SurfaceViews } from "../routes";

/**
 * Which params of `reports` the page draws: a lens's, the days a member picked, or a lens over such days (contracts
 * reportsParamParts). The Overview is `reports` itself; `reports/overview` is no address.
 */
export const reportsTakes = (param: string): boolean => reportsParamParts(param) !== null;

/**
 * Whether the workspace has ads to report: a demo session, or a workspace whose Ads preview is on (campaigns/ads/shown.ts),
 * drawn from the Ads sample. MOCKUP: the wiring lane (decision 0049) sets
 * this from the workspace's connected ad accounts, and the lens is then a real one. A test reads a chrome with no window, which is
 * no demo.
 */
export const adsAreOn = (): boolean => adsShown();

/**
 * Who is looking and how their customers buy, as the workspace list the shell holds says it: the one place Reports asks, for the
 * strip and for the page's body. Null before the list is held (the shell reads it before the page draws, ROUTE_WAITS, but a read
 * that failed leaves none).
 */
const lensWho = (): LensWho | null => {
  const ws = workspaceOverride.current();
  return ws ? { sellsBy: ws.sells_by, role: ws.role, adsOn: adsAreOn() } : null;
};

/** What is known of a workspace whose list is not held: deals are not on, and the person is the lowest rung. */
const notHeld = (): LensWho => ({ sellsBy: undefined, role: undefined, adsOn: adsAreOn() });

/**
 * Whether a lens is shown here: yes or no, or null where the answer waits on a list the shell has not held (how the workspace sells
 * decides the Pipeline). A lens open to everyone never waits. The page draws nothing for a null, rather than an empty that claims
 * "you book directly" of a workspace nobody has asked.
 */
export function lensShownHere(lens: LensId): boolean | null {
  const who = lensWho();
  if (who) return lensIsShown(lens, who);
  return lensIsShown(lens, notHeld()) ? true : null;
}

/**
 * The lenses shown here, as the frame's strip draws them (before the list is held, those that need nothing of it); `picked`
 * is the one the address names. Each tab's address keeps the days the address says (`days`): a member who picked a week
 * and moves to another lens is looking at that week there, never back on the period.
 */
function lensViews(picked: LensId, days: ReportDays | null): SurfaceViews {
  const tabs = lensesFor(lensWho() ?? notHeld()).map((l) => ({
    id: l.id,
    label: l.label,
    to: lensRoute(l.id, days),
    testid: `lens-${l.id}`,
  }));
  // One mount across the lenses (reportsChrome below): the page stays as the lens changes, and the lens's body is the
  // view that moves (reports-page.tsx).
  return { name: "reports", label: "Which report", testid: "reports-lenses", picked, tabs };
}

/**
 * The crumbs, the mount and the views of an address: Reports alone for the Overview, Reports then the lens for any other, and one
 * mount for them all, because the page follows its address (reports-page.tsx): a lens picked is said in the path, and a page mounted
 * afresh for each would lose its period's dimming and its place with every pick.
 */
export function reportsChrome({ param }: { param: string | null }) {
  const at = reportsParamParts(param ?? "") ?? { lens: "overview" as const, days: null, review: null };
  const crumbs = at.lens === "overview" ? ["Reports"] : [{ label: "Reports", to: "reports" }, lensOf(at.lens).label];
  return { crumbs, mount: "reports", views: lensViews(at.lens, at.days) };
}

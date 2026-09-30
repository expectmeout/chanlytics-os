/**
 * The routes that have left the shell (decision 0015, step 3): each has an App Router page of its own, and the frame,
 * which stays mounted in the layout, draws its chrome around it. A route is here when its page is
 * `app/(os)/w/[workspace]/<route>/page.tsx` and its row has left `legacy/pages/app-routes.jsx`; the registry test
 * (`tooling/scripts/tests/shell/surfaces/surface-registry.test.mjs`) holds the two to each other, in both directions.
 *
 * What the frame needs to know of one is what its row said: which item of the sidebar it lights, its crumbs, and
 * whether it draws in a pane. The page itself arrives as the layout's `children`.
 */
import { conversationsCrumbs, conversationsNav, inboxCrumbs } from "./inbox/routes";

/** A crumb: its words alone, or its words and the route pressing it goes to. */
type Crumb = string | { label: string; to: string };

/** How the frame wraps a route's page: the row's `activeNav`, `crumbs` and `pane`, each fixed or asked of the address's param. */
interface SurfaceRoute {
  activeNav: string | ((param: string | null) => string);
  crumbs: readonly Crumb[] | ((param: string | null) => readonly Crumb[]);
  pane: boolean;
  /** An address under the route (`inbox/th-1`) is the route's page too: the page follows it and stays mounted across it. */
  params?: boolean;
  /** What the frame keys the view's mount by, for a page that follows its address (the row's `mount`). */
  mount?: string;
}

/** Every route with a page of its own, by the route's word (the path after the workspace's slug). */
export const SURFACE_ROUTES: Readonly<Record<string, SurfaceRoute>> = {
  reports: { activeNav: "reports", crumbs: ["Reports"], pane: true },
  inbox: { activeNav: "inbox", crumbs: inboxCrumbs, pane: true, params: true, mount: "inbox" },
  conversations: {
    activeNav: conversationsNav,
    crumbs: conversationsCrumbs,
    pane: true,
    params: true,
    mount: "conversations",
  },
};

/**
 * Whether an address is one of these routes' page: the route alone, `reports`, and not an address under it
 * (`reports/anything`, which the frame's table takes and says is not found), unless the route takes one (`inbox/th-1`).
 */
export function routeHasPage(route: string): boolean {
  const page = route.split("/")[0] ?? "";
  const row = Object.hasOwn(SURFACE_ROUTES, page) ? SURFACE_ROUTES[page] : undefined;
  return !!row && (route === page || row.params === true);
}

/**
 * Whether a move from the route on screen to another stays within one route's page, which follows its address and stays mounted
 * across it: `inbox/th-1` to `inbox/th-2`, or to `inbox`. Only a page that takes an address under it (`params`) is one: the App Router
 * keys its segment by that param, so asking it for the move would fetch the page and draw it again.
 */
export function staysOnPage(from: string, to: string): boolean {
  const page = to.split("/")[0] ?? "";
  const row = Object.hasOwn(SURFACE_ROUTES, page) ? SURFACE_ROUTES[page] : undefined;
  return !!row && row.params === true && from.split("/")[0] === page;
}

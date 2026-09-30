/**
 * The routes that have left the shell (decision 0015, step 3): each has an App Router page of its own, and the frame,
 * which stays mounted in the layout, draws its chrome around it. A route is here when its page is
 * `app/(os)/w/[workspace]/<route>/page.tsx` and its row has left `legacy/pages/app-routes.jsx`; the registry test
 * (`tooling/scripts/tests/shell/surfaces/surface-registry.test.mjs`) holds the two to each other, in both directions.
 *
 * What the frame needs to know of one is what its row said: which item of the sidebar it lights, its crumbs, and
 * whether it draws in a pane. The page itself arrives as the layout's `children`.
 */

/** How the frame wraps a route's page: the row's `activeNav`, `crumbs` and `pane`. */
export interface SurfaceRoute {
  activeNav: string;
  crumbs: readonly string[];
  pane: boolean;
}

/** Every route with a page of its own, by the route's word (the path after the workspace's slug). */
export const SURFACE_ROUTES: Readonly<Record<string, SurfaceRoute>> = {
  reports: { activeNav: "reports", crumbs: ["Reports"], pane: true },
};

/**
 * Whether an address is one of these routes' page: the route alone, `reports`, and not an address under it
 * (`reports/anything`, which the frame's table takes and says is not found).
 */
export function routeHasPage(route: string): boolean {
  return Object.hasOwn(SURFACE_ROUTES, route);
}

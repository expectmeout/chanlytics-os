/**
 * The routes that have left the shell (decision 0015, step 3): each has an App Router page of its own, and the frame,
 * which stays mounted in the layout, draws its chrome around it. A route is here when its page is
 * `app/(os)/w/[workspace]/<word>/page.tsx` (`<word>` is the route's own name, or the product's where `ROUTE_WORDS` says
 * another) and its row has left `legacy/pages/app-routes.jsx`; the registry test
 * (`tooling/scripts/tests/shell/surfaces/surface-registry.test.mjs`) holds the two to each other, in both directions.
 *
 * What the frame needs to know of one is what its row said: which item of the sidebar it lights, its crumbs, and
 * whether it draws in a pane. The page itself arrives as the layout's `children`.
 *
 * A route may take addresses under it (`inbox/th-1`, `clients/<id>`, `clients/pipeline:v-board`): `params` says every one
 * is the page's, `takes` says which of them the page draws (an address it does not take stays with the frame's table:
 * People's Leads scope, until Leads leaves), and the crumbs and the mount of an address are the row's function of it, or,
 * where they depend on what the surface holds and on the frame's own Back, its `chrome`.
 */
import { calendarChrome } from "./calendar/chrome";
import { conversationsCrumbs, conversationsNav, inboxCrumbs } from "./inbox/routes";
import { peopleChrome, peopleTakes } from "./people/chrome";

/** A crumb: its words alone, or its words and the route pressing it goes to (`go`: the page's own move, as a person's People crumb is). */
type Crumb = string | { label: string; to: string } | { label: string; to?: string; go: unknown };

/**
 * The top bar's one act, drawn by the frame (app-routes.jsx drawRoute) from what the surface says: a link that opens
 * elsewhere (`href`: the Calendar's booking link), or the Ask door (`ask`), which only a demo session offers (Ask opens
 * there over seeded pages; a real workspace has nothing to ask), composing from `prompt` where the surface gives one.
 * `glyph` is an icon of the kit; `primary` is the filled button.
 */
interface SurfaceAct {
  label: string;
  glyph: string;
  primary?: boolean;
  href?: string;
  ask?: boolean;
  prompt?: string;
  testid?: string;
}

/** What the frame draws around an address of a route that has a `chrome`. */
interface SurfaceChrome {
  crumbs: readonly Crumb[];
  /** What the view is mounted under, where the page follows its address itself: absent, the route's own key. */
  mount?: string;
  act?: SurfaceAct | null;
}

/** What the frame hands a route's `chrome`: the address's param, and the shell's own Back to People. */
interface ChromeAt {
  param: string | null;
  backToPeople: unknown;
}

/** How the frame wraps a route's page: the row's `activeNav`, `crumbs` and `pane`, each fixed or asked of the address's param. */
interface SurfaceRoute {
  activeNav: string | ((param: string | null) => string);
  crumbs: readonly Crumb[] | ((param: string | null) => readonly Crumb[]);
  pane: boolean;
  /** An address under the route (`inbox/th-1`) is the route's page too: the page follows it and stays mounted across it. */
  params?: boolean;
  /** Which params of the route the page draws, where not every one is (`clients/<id>` but not `clients/leads`); absent, the route alone. */
  takes?: (param: string) => boolean;
  /** What the frame keys the view's mount by, for a page that follows its address (the row's `mount`). */
  mount?: string;
  /** The top bar's act, where the surface has one. */
  act?: SurfaceAct;
  /** The chrome of an address, where it depends on the param or on what the surface holds; absent, `crumbs`, `mount` and `act`. */
  chrome?: (at: ChromeAt) => SurfaceChrome;
}

/**
 * Every route with a page of its own, by the route's word (the path after the workspace's slug). A route's `takes` and
 * `chrome` are read when an address is drawn, never when this module loads: the frame's modules (workspace.ts reads this
 * table) and the surfaces' chromes reach each other, and a chrome named here by reference would be read before its own
 * module had run, in whichever order they were first imported.
 */
export const SURFACE_ROUTES: Readonly<Record<string, SurfaceRoute>> = {
  reports: { activeNav: "reports", crumbs: ["Reports"], pane: true },
  today: {
    activeNav: "home",
    crumbs: ["Today"],
    pane: false,
    act: { label: "New task", glyph: "plus", primary: true, ask: true, prompt: "New task: " },
  },
  inbox: { activeNav: "inbox", crumbs: inboxCrumbs, pane: true, params: true, mount: "inbox" },
  conversations: {
    activeNav: conversationsNav,
    crumbs: conversationsCrumbs,
    pane: true,
    params: true,
    mount: "conversations",
  },
  calendar: {
    activeNav: "calendar",
    crumbs: ["Calendar"],
    pane: true,
    takes: () => true,
    chrome: () => calendarChrome(),
  },
  // People, the shell's `clients` (path word `people`): the list, its views, the New list door, the Pipeline and a person's
  // page (people/chrome.ts). Leads stays with the frame's table until its surface moves.
  clients: {
    activeNav: "clients",
    crumbs: ["People"],
    pane: true,
    takes: (param) => peopleTakes(param),
    chrome: (at) => peopleChrome(at),
  },
  // Lists (path word `lists`): a list's own address lands on People with that list picked (people/lists-route.tsx).
  segments: { activeNav: "clients", crumbs: ["People"], pane: true, takes: () => true },
};

const pageOf = (route: string): string => (route.includes("/") ? route.slice(0, route.indexOf("/")) : route);
const paramOf = (route: string): string => (route.includes("/") ? route.slice(route.indexOf("/") + 1) : "");

/**
 * Whether an address is one of these routes' page: the route alone, `reports`, an address under it that the route takes
 * whole (`inbox/th-1`), or one its page takes (`clients/c-1`). An address the page does not take (`reports/anything`,
 * `clients/leads`) is the frame's table's, which draws its row, or says it is not found.
 */
export function routeHasPage(route: string, routes: Readonly<Record<string, SurfaceRoute>> = SURFACE_ROUTES): boolean {
  const page = pageOf(route);
  const row = Object.hasOwn(routes, page) ? routes[page] : undefined;
  if (!row) return false;
  const param = paramOf(route);
  return param === "" || row.params === true || (row.takes?.(param) ?? false);
}

/**
 * Whether a move from the route on screen to another stays within one route's page, which follows its address and stays
 * mounted across it: `inbox/th-1` to `inbox/th-2`, or to `inbox`; `clients/list:s1` to `clients/c-1`. Only a page that takes
 * addresses under it is one (`params` for every address, `takes` for the ones it names): the App Router keys its segment by
 * that param, so asking it for the move would fetch the page and draw it again. A page that takes none (`reports`) has no
 * address to stay within, so a move to it is always the router's.
 */
export function staysOnPage(from: string, to: string): boolean {
  const row = Object.hasOwn(SURFACE_ROUTES, pageOf(to)) ? SURFACE_ROUTES[pageOf(to)] : undefined;
  return (
    !!row &&
    pageOf(from) === pageOf(to) &&
    routeHasPage(to) &&
    (row.params === true || (row.takes !== undefined && routeHasPage(from)))
  );
}

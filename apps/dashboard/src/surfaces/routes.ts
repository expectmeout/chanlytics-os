/**
 * The routes that have left the shell (decision 0015, step 3): each has an App Router page of its own, and the frame,
 * which stays mounted in the layout, draws its chrome around it. A route is here when its page is
 * `app/(os)/w/[workspace]/<word>/page.tsx` (`<word>` is the route's own name, or the product's where
 * `ROUTE_WORDS` says another) and its row has left `legacy/pages/app-routes.jsx`; the registry test
 * (`tooling/scripts/tests/shell/surfaces/surface-registry.test.mjs`) holds the two to each other, in both directions.
 *
 * What the frame needs to know of one is what its row said: which item of the sidebar it lights, its crumbs, and
 * whether it draws in a pane. The page itself arrives as the layout's `children`.
 *
 * A route may take addresses under it (`clients/<id>`, `clients/pipeline:v-board`): `takes` says which of the
 * route's params the page draws, and `chrome` names the crumbs an address has, as the row's `draw` did. An address the
 * page does not take stays with the frame's table (People's Leads scope, until Leads leaves).
 */
import { broadcastsChrome, playbooksChrome } from "./campaigns/routes";
import { calendarChrome } from "./calendar/chrome";
import { conversationsCrumbs, conversationsNav, inboxCrumbs } from "./inbox/routes";
import { liveChrome } from "./live/routes";
import { peopleChrome, peopleTakes } from "./people/chrome";

/** A crumb: its words, and where it goes (`to`, or the page's own move, `go`, as a person's People crumb is). */
type Crumb = string | { label: string; to: string } | { label: string; to?: string; go: unknown };

/**
 * The top bar's one act, drawn by the frame (app-routes.jsx drawRoute) from what the surface says: a link that opens
 * elsewhere (`href`: the Calendar's booking link), or the Ask door (`ask`), which only a demo session offers (Ask opens there
 * over seeded pages; a real workspace has nothing to ask), composing from `prompt` where the surface gives one. `glyph` is an icon of
 * the kit; `primary` is the filled button.
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

/** What the frame draws around a route's page. */
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
  /** Every address under the route (`inbox/th-1`) is the route's page too: the page follows it and stays mounted across it. */
  params?: boolean;
  /** Which params of the route the page draws, where not every one is (`clients/<id>` but not `clients/leads`); absent, the route alone. */
  takes?: (param: string) => boolean;
  /** What the frame keys the view's mount by, for a page that follows its address (the row's `mount`). */
  mount?: string;
  /** The top bar's act, where the surface has one. */
  act?: SurfaceAct;
  /** The chrome of an address, where it depends on the param or on what the surface holds; absent, `crumbs`. */
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
  outbound: {
    activeNav: "outbound",
    crumbs: ["Campaigns", "Playbooks"],
    pane: true,
    takes: () => true,
    chrome: playbooksChrome,
  },
  messages: { activeNav: "messages", crumbs: ["Campaigns", "Templates"], pane: true },
  broadcasts: {
    activeNav: "broadcasts",
    crumbs: ["Campaigns", "Broadcasts"],
    pane: false,
    takes: () => true,
    chrome: broadcastsChrome,
  },
  live: {
    activeNav: "live",
    crumbs: [{ label: "Inbox", to: "inbox" }, "Live"],
    pane: true,
    takes: () => true,
    chrome: liveChrome,
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
 * Whether an address is one of these routes' page: the route alone, `reports`, or an address under it that the page
 * takes (`inbox/th-1`, `clients/c-1`). An address the page does not take (`reports/anything`, `clients/leads`) is the frame's
 * table's, which draws its row, or says it is not found.
 */
export function routeHasPage(route: string, routes: Readonly<Record<string, SurfaceRoute>> = SURFACE_ROUTES): boolean {
  const page = pageOf(route);
  if (!Object.hasOwn(routes, page)) return false;
  const param = paramOf(route);
  const row = routes[page];
  return param === "" || row?.params === true || (row?.takes?.(param) ?? false);
}

/**
 * Whether a move from one route to the other stays on one page: the router's page for `inbox` or `clients` draws every
 * address it takes, so a move between two of them (`inbox/th-1` to `inbox/th-2`, or to `inbox`) is the page's own (a
 * pushed or replaced entry in the history the App Router patches), never a request for a page that is already drawn.
 */
export function onOnePage(from: string, to: string): boolean {
  return routeHasPage(from) && routeHasPage(to) && pageOf(from) === pageOf(to);
}

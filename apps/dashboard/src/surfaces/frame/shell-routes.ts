/**
 * The frame's routes (moved from legacy/pages/app-shell.jsx, the one-system plan's step 7e): a route read from the address,
 * what it resolves to for the route table and the gates, and the sidebar's items as routes. The route is read, followed
 * and moved in one place, `CHANLY.address` (constants.ts: the bridge's in the app; the mockup's own over its hash).
 *
 * Routes (the address after /w/<slug>; the standalone mockup writes them after a #/ instead): /today, the operator's
 * brief; /inbox; /clients, People; /clients/pipeline; /clients/<id>, a person; /soon/<surface>, an in-design landing.
 */
import { CHANLY } from "./constants";
import { frameSurfaceState, isDemoFrame } from "./frame-window";

/** A route's page and its param, as drawn. */
export interface ShellRoute {
  page: string;
  param: string | null;
}

/** The route an address opens, resolved for the table and the gates (see routeAt). */
export interface RouteAt extends ShellRoute {
  raw: ShellRoute;
  soonState: string | null;
  retiredTo: string | null;
  routeKey: string;
}

/** The address the frame reads: the window's (a test's stand-in), else its own. */
const frameAddress = () =>
  (window.CHANLY && window.CHANLY.address ? window.CHANLY : CHANLY).address as typeof CHANLY.address;

// Is this route's data actually available? The bridge installs __surfaceGate for the real surfaces; others are seeded and
// always ready. `own`: the route's own surface alone, without the bands its first draw waits for beside it (ROUTE_WAITS).
export const routeReady = (page: string, param: string | null, own = false) =>
  !window.__surfaceGate || window.__surfaceGate(page, param, own);

// A real surface whose fetch failed. Painting the mockup here would show invented customers as real, so the frame says so.
export const routeFailed = (page: string, param: string | null) =>
  !!window.__surfaceFailed && window.__surfaceFailed(page, param);

/** A route's page and its param, from the route as written (`inbox/th-1`). */
export const routeParts = (route: string): ShellRoute => {
  const [page, param] = route.split("/");
  return { page: page || "today", param: param || null };
};
export const parseRoute = () => routeParts(frameAddress().route());
/** The frame's address, for a move or a listener. */
export const shellAddress = frameAddress;

/**
 * The route an address opens, resolved for the table and the gates: `page` and `param` as drawn, `raw` as written, the
 * soon/ answer, where a retired address lands and the gate's key. What its view is mounted under is the table's
 * (route-table.tsx, a row's `mount`), in drawRoute's answer.
 *
 * soon/<surface> was the landing for a page not built yet, and an old link, a bookmark or a bell row can still name one
 * that has since shipped. The registry decides what it opens: a page it lists as real opens, a demo page keeps its
 * landing, and a name it does not know is not found (the wiring audit's N16). The standalone mockup keeps every landing.
 *
 * Where this address lands now, if it moved (surface-registry surfaceRetiredTo): People took over Leads and the Deal board,
 * and Setup left Settings for the first run. Worked out before the rows, so a pane that moved draws nothing for the frame
 * before the redirect (useRouteMoves).
 */
export const routeAt = (route: ShellRoute): RouteAt => {
  const surfaceState = frameSurfaceState();
  const soonState =
    route.page === "soon" && route.param && surfaceState ? surfaceState(route.param) || "unknown" : null;
  const { page, param } = soonState === "real" ? { page: route.param || "", param: null } : route;
  const retiredTo = (window.__surfaceRetired && window.__surfaceRetired(page, param, isDemoFrame())) || null;
  // The gate is asked per PANE, so this key must carry the param. What the surface is MOUNTED under is the route table's.
  const routeKey = `${page}/${param || ""}`;
  return { page, param, raw: route, soonState, retiredTo, routeKey };
};

// Sidebar nav id → route
export const NAV_ROUTE: Readonly<Partial<Record<string, string>>> = {
  home: "today",
  people: "clients",
  campaigns: "campaigns",
  agents: "fleet",
  inbox: "inbox",
  clients: "clients",
  store: "store",
  fleet: "fleet",
  studio: "studio",
  outbound: "campaigns",
  content: "content",
  broadcasts: "broadcasts",
  messages: "messages",
  pipeline: "pipeline",
  calendar: "calendar",
  leads: "leads",
  segments: "segments",
  reports: "reports",
  tasks: "tasks",
  admin: "admin",
  conversations: "conversations",
  live: "live",
  calls: "conversations/phone",
  chats: "conversations/chats",
  email: "conversations/mail",
};

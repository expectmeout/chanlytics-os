/**
 * THE surface classification — one table that says, for every route the shell
 * knows, whether it is fed by real data or by the mockup's invented seeds.
 *
 * Why this exists as a registry instead of per-route conditionals: the previous
 * approach gated exactly one route (Settings) by hand and left fifteen
 * fabricated branches reachable in production — Broadcasts animating a delivery
 * that never happened, Calendar claiming three times that a customer was
 * notified, Reports showing $48,300 the schema has no column for. A rule
 * applied per-route is a rule someone forgets per-route. Here the
 * classification IS the enforcement: the shell asks this table, and anything
 * marked "demo" renders the honest ComingSoon pane outside an explicit demo
 * session. A test asserts the table covers every route the shell declares, so
 * adding a route without classifying it fails CI rather than shipping a
 * finished-looking fabrication.
 *
 * "demo" does not mean bad — it means the surface's data is invented, and
 * invented data may only render in a session that declared itself a demo
 * (window.__DEMO_MODE). Flipping a surface to real later is a one-line change
 * here, made in the same directory as the override that makes it true.
 */
import { FIRST_RUN_ROUTE } from "@chanlytics/contracts";

import { isSurfaceFailed, isSurfaceReady, onSurfaceStatusChange } from "./surface-status";

export type SurfaceState = "real" | "demo";

export const SURFACE_STATES: Record<string, SurfaceState> = {
  // Fed by live data through the SurfaceData seam.
  today: "real",
  inbox: "real",
  conversations: "real",
  clients: "real", // People · Clients; Leads / Deal board / Lists stay demo
  reports: "real", // the receptionist's numbers; the share link stays demo
  live: "real", // calls in progress + the last few, and the three writes: whisper, hand over, end. Live LISTEN stays in the demo — there is no audio path.

  // Render entirely from seed data. Each becomes one edited line here the day
  // its slice ships.
  // The mockup surfaces (Agents: fleet, store, studio, tasks; Content; Pipeline;
  // the shared report viewer) stay in the tree and stay hidden from
  // every real workspace: no nav entry, no tab, the Not-in-this-release card for
  // a hand-typed address. Ruben's decision, 11 September 2026: most of it is
  // revisited when the product is at 100%, and none of those features is built
  // before then. Nothing here is a promise to a customer or an operator.
  // Lifted 18 Sep 2026 (Ruben): a scope of People at clients/leads, fed by the leads surface.
  leads: "real", // the route itself still redirects (SURFACE_RETIRED): the scope is clients/leads
  segments: "real", // People › Lists: the lists kept by hand and the computed ones, with their people
  pipeline: "demo", // retired into People, like leads
  calendar: "real", // the owner's calendar as the receptionist reads it: taken, open, closed — a viewer, never a scheduler
  shared: "demo", // the read-only report viewer — a share link over invented numbers
  tasks: "demo",
  fleet: "demo",
  store: "demo",
  studio: "demo",
  outbound: "real", // Campaigns › Playbooks: standing rules over the people who said yes, under the two Autonomy rows, and the reach-outs as chains (the reach_outs surface, each report read as its row opens)
  content: "demo",
  broadcasts: "real", // one approved template to the people who said yes; SMS and email stay not available
  messages: "real", // Campaigns › Messages: what the receptionist and the campaigns send, as the customer sees it, a reach-out's emails included (drawn from the reach_outs surface's chains, each count read as its row opens)
  start: "real", // the first run: Setup's rows a step at a time, read from the workspace (contracts/first-run.ts)
  admin: "demo", // the page itself: every pane below is classified, and a
  // pane nobody has listed inherits this honest default
  "admin/profile": "real", // you: name, the address you signed in with, your role
  "admin/workspace": "real",
  "admin/team": "real", // split out of workspace: the people, their roles, invites
  "admin/autonomy": "real", // the policies table, live for the reply row
  "admin/notifications": "real", // who is alerted, from tenant_config
  "admin/integrations": "real", // the channels in tenant_channels, read-only
  // Billing is real on every workspace (billing-real.jsx). Memory is not built,
  // and says so IN the pane: falling through to the page's "demo" replaced all
  // of Settings with a bare card; the pane keeps the nav and states what exists
  // instead (settings.jsx PaneSoon).
  "admin/billing": "real",
  "admin/memory": "real",
  "admin/activity": "real", // both ledgers, from GET /activity, owners only
  // The back office (gate 5, #300): every workspace sorted by who needs a
  // person, read from the guarded platform routes. It was never listed here,
  // so its tab fell through to the page's "demo" and a platform admin who
  // clicked Back office got the Not-in-this-release card -- found by Ruben
  // on 11 September, the day the tab became the way to file a campaign.
  "admin/platform": "real",
  // A partner's account and link (0012): the offer for everyone else, the row for a partner (partner-real.jsx).
  "admin/partner": "real",
};

/**
 * Which SurfaceData override backs each real route — the map the route gate
 * consults before painting. Lives HERE, beside the classification, because the
 * two must agree: a surface is only "real" if an override actually feeds it,
 * and a test pins that every "real" row has an entry and vice versa.
 */
export const ROUTE_SURFACE: Record<string, string> = {
  today: "today",
  inbox: "inbox",
  conversations: "conversations",
  clients: "people",
  // The scope's own surface, so the gate waits for it before the Leads scope
  // paints; the route `leads` itself redirects to `clients/leads`, and is here
  // because a surface may only be classified real when an override feeds it.
  leads: "leads",
  segments: "people",
  reports: "reports",
  live: "live",
  broadcasts: "broadcasts",
  // The templates ride on the settings surface; the page waits for it like Settings does.
  messages: "settings",
  outbound: "playbooks",
  calendar: "calendar",
  // The first run is Setup's rows, so it waits for Setup's read.
  start: "setup",
  // The pane is fed by settingsOverride, so the route gate waits for it the
  // same way the other real routes do — otherwise it paints the mockup's
  // fabricated business for a frame before the truth arrives.
  "admin/profile": "settings",
  "admin/workspace": "settings",
  "admin/team": "settings",
  "admin/autonomy": "settings",
  "admin/notifications": "settings",
  "admin/integrations": "settings",
  // Billing's rows come from its own surface, and its pane draws their reading
  // and failed states itself. The gate still waits for settings: the page picks
  // the real pane over the mockup's by __SETTINGS, so waiting on billing alone
  // could paint the mockup's billing for a frame.
  "admin/billing": "settings",
  "admin/memory": "settings",
  "admin/activity": "settings",
  // The pane fetches its own list through the typed client on mount; it waits
  // for the settings surface like every other pane, so nothing paints early.
  "admin/platform": "settings",
  "admin/partner": "settings",
};

/** A person's page, as ROUTE_DRAWS names it. */
export const PERSON_ROUTE = "clients/person";

/**
 * The person a route opens (`clients/<id>`), or null. A real person's id is a uuid (the route refuses anything else,
 * server/request-guards.ts requireUuid); the mockup's seeded people are `c-…` and keep the list's gate and its seeds.
 */
export function personRouteId(page: string, param?: string | null): string | null {
  return page === "clients" && param && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param)
    ? param
    : null;
}

/**
 * What a page draws from surfaces other than its own, in the order the page
 * draws them, so a boot on that page reads them right after its own surface
 * (surface-runner.ts screenRank) rather than in the runner's fixed order.
 *
 * Today draws the day beside its queue from the calendar, the queue's runs from
 * broadcasts, the card's period line and Worth a look from reports, the day's
 * playbook rows, the bell's rows for While you were away, a call in progress
 * from live, the card's Setup and Google lines, and from People the day card's
 * needs-someone flag and channel glyphs and Worth a look's people -- last,
 * because contacts is the heaviest read; the bands that read it draw without it
 * and again when it lands (surface:clients). Measured on the salon
 * (22 Sep 2026): the calendar was read eleventh, behind Settings, People and
 * Leads that nobody was looking at, so the day popped in 1.6 s after the queue
 * beside it. The Calendar draws an appointment's person's deal from People
 * (its peek's stage and "Start a proposal", 0008), and whether deals are on at
 * all, so a cold Calendar reads People next. A route absent here draws only its
 * own surface.
 */
export const ROUTE_DRAWS: Record<string, readonly string[]> = {
  // Setup first: what is left to set up is drawn ABOVE the queue (dashboard-a-brief.jsx TodaySetup), and read seventh it
  // landed after the queue and pushed it down (Ruben, 24 Sep: "does not load properly like the rest of the page").
  today: ["setup", "calendar", "broadcasts", "reports", "playbooks", "notifications", "live", "google", "people"],
  calendar: ["people"],
  // The first run's receptionist card fills in from the settings read: the brain and the resolved numbers. Try it
  // watches the Live page's calls for the test call (first-run-try.ts).
  start: ["settings", "live"],
  // A person's page reads its own person (people-detail.ts); People's row gives it their name in the crumbs and the
  // head while that read is out, so People is read next.
  [PERSON_ROUTE]: ["people"],
  // A reach-out's chains are Playbooks' rows, and their emails Templates' email rows (Part 4 PR 8): the reach-outs
  // surface, read beside each page's own.
  outbound: ["reach_outs"],
  messages: ["reach_outs"],
};

/**
 * What a page's first draw waits for besides its own surface: a band drawn ABOVE the page's own content, which would
 * push that content down if it landed after it. Today draws what is left to set up above its queue. A wait that
 * failed is over (the band says so where it would be, or draws nothing), and a wait never makes a page unavailable:
 * that is its own surface's to say, and a page whose own surface is in draws after ROUTE_WAIT_MS whatever else is
 * still out (app-shell.jsx).
 */
export const ROUTE_WAITS: Record<string, readonly string[]> = {
  today: ["setup"],
};
export const ROUTE_WAIT_MS = 3000;

/** What a route draws beside its own surface: a person's page is one route of its own, whatever its id. */
export function routeDrawsFor(page: string, param?: string | null): readonly string[] {
  return ROUTE_DRAWS[personRouteId(page, param) ? PERSON_ROUTE : page] ?? [];
}

/**
 * Published for the mockup shell (a classic script that cannot import).
 * Absent — the standalone mockup opened without the bridge — everything
 * renders, which is correct there: the whole artifact is a demo.
 */
/**
 * The state of one route, most specific first.
 *
 * Settings is one page with six panes behind it, and they are not all at the
 * same stage: the workspace pane can be fed by real APIs while billing and
 * integrations are still drawn from seeds. Classifying only the PAGE forced a
 * choice between hiding a finished pane and shipping five invented ones — so
 * the table now accepts `admin/workspace` as well as `admin`, and falls back
 * to the page when no sub-route is listed.
 *
 * The fallback is what keeps this safe: a new pane nobody has classified
 * inherits its page's state, which is `demo`, which is the honest default.
 */
/**
 * The pane a page opens on when the route names none.
 *
 * The shell renders Settings as `tab={param || "workspace"}`, so /admin with
 * no pane DOES render the workspace pane — while the gate, asked about
 * "admin", answered `demo` and replaced it with the Coming Soon card. The
 * sidebar's Settings link is exactly that route, so the finished pane was
 * unreachable by normal navigation and only a hand-typed #/admin/workspace
 * could find it.
 *
 * The gate has to be asked about what will actually RENDER.
 */
export const SURFACE_DEFAULT_PARAM: Record<string, string> = {
  admin: "workspace",
};

/**
 * Which override the route gate must WAIT for, most specific first.
 *
 * The twin of surfaceStateFor, and it exists because the registry being right
 * was not enough. ROUTE_SURFACE has carried `admin/workspace` since Settings
 * was flipped, but the gate looked up `ROUTE_SURFACE[page]` with the bare page
 * — "admin" — found nothing, and answered "ready" before any settings data had
 * arrived. A cold load of Settings therefore painted the mockup's business,
 * its invented staff and its invented phone number to a real owner, for as
 * long as the fetch took.
 *
 * Same resolution as the classification, for the same reason: the gate has to
 * be asked about what will actually RENDER.
 */
export function routeSurfaceFor(page: string, param?: string | null): string | undefined {
  const pane = param || SURFACE_DEFAULT_PARAM[page];
  // People has two scopes and they are fed by two surfaces. Leads is
  // `clients/leads` with the view spelled after it (`clients/leads:s-…:l-…`),
  // so the gate must be asked about the SCOPE, not the page: asked about
  // "clients" it would wait for People's rows and paint the Leads scope with
  // no searches, no rows and no counts for as long as its own read took.
  if (page === "clients" && pane && /^leads(:|$)/.test(pane)) return ROUTE_SURFACE.leads;
  // A person's page reads its own person and says Reading… itself, so it never waits for the whole list: measured on
  // production (23 Sep 2026), a new tab held "Reading…" until People's 29 rows landed at 0.87 s and only then asked
  // for the person, whose page drew at 1.5 s. It waits for who is looking (the workspace surface, which carries __ME):
  // a role decides what the page offers, and a first draw that said it wrong would be corrected a moment later.
  if (personRouteId(page, pane)) return "workspace";
  if (pane) {
    const specific = ROUTE_SURFACE[`${page}/${pane}`];
    if (specific) return specific;
  }
  return ROUTE_SURFACE[page];
}

export function surfaceStateFor(page: string, param?: string | null): SurfaceState | undefined {
  const pane = param || SURFACE_DEFAULT_PARAM[page];
  if (pane) {
    const specific = SURFACE_STATES[`${page}/${pane}`];
    if (specific) return specific;
  }
  return SURFACE_STATES[page];
}

/**
 * Mockup surfaces a real workspace no longer has, and where they went. Leads
 * and the Deal board assumed a sales team moving cards; Chanlytics counts the
 * booked appointment as the conversion, and People now shows who booked and
 * who asked and never did. A real workspace lands on People; the standalone
 * mockup keeps its pages.
 *
 * Leads came back on 18 September 2026 (Ruben), but not as a page of its own:
 * it is a SCOPE of People, so the old address lands on `clients/leads` rather
 * than on the list of clients. The Deal board stays retired.
 */
export const SURFACE_RETIRED: Record<string, string> = {
  leads: "clients/leads",
  pipeline: "clients",
};

/**
 * Addresses of one pane that moved elsewhere. Setup left Settings for the first run (docs/superpowers/specs/
 * 2026-09-24-first-run-design.md): bell rows written before then, by the edge and by migrations 00065 and 00123, carry
 * `admin/setup`, so the address stays good and lands where Setup is now.
 */
export const ROUTES_MOVED: Record<string, string> = {
  "admin/setup": FIRST_RUN_ROUTE,
};

/** Retired pages the mockup no longer has either: the seeded Leads page was deleted when Leads became a scope of People. */
const GONE_FROM_THE_TREE = new Set(["leads"]);

/**
 * Where a retired page, or a pane that moved, lands now; undefined for an address that is where it always was. A pane
 * that moved and a page gone from the tree move for everyone; a retired page the mockup still has (the Deal board)
 * stays where it is in a demo session (`demo`), which is the one place it is still drawn.
 */
export function surfaceRetiredTo(page: string, param?: string | null, demo = false): string | undefined {
  const moved = param ? ROUTES_MOVED[`${page}/${param}`] : undefined;
  if (moved) return moved;
  return demo && !GONE_FROM_THE_TREE.has(page) ? undefined : SURFACE_RETIRED[page];
}

export function installSurfaceRegistry(): void {
  const w = window as unknown as {
    __surfaceState?: (page: string, param?: string | null) => SurfaceState | undefined;
    __surfaceRetired?: (page: string, param?: string | null, demo?: boolean) => string | undefined;
  };
  w.__surfaceState = surfaceStateFor;
  w.__surfaceRetired = surfaceRetiredTo;
}

/**
 * The shell's route gate, installed at MODULE SCOPE — not in an effect.
 *
 * app-shell.jsx computes `routeLoading`'s INITIAL state during its first
 * render, and it is a child of LegacyApp: children render before parent
 * effects run. Installing the gate in a useEffect therefore left it undefined
 * at the only moment it mattered, `routeReady()` fell back to `true`, and a
 * cold boot painted the seeded mockup hero ($1,840 revenue, a fabricated
 * operator) for one frame — then the reading pane, then the truth. Strictly worse
 * than no gate at all.
 *
 * Module scope runs before React renders anything, so the very first frame is
 * already gated. It also survives StrictMode's mount/unmount/mount, which the
 * effect's cleanup used to tear down mid-sequence. LegacyApp.tsx calls it at
 * its module scope; the e2e harness's fixture calls it over its own record.
 */
export function installRouteGate(): void {
  const w = window as unknown as {
    __surfaceGate?: (page: string, param?: string | null, own?: boolean) => boolean;
    __surfaceFailed?: (page: string, param?: string | null) => boolean;
    __onSurfaceReady?: (fn: () => void) => () => void;
    __routeWaitMs?: number;
  };
  w.__routeWaitMs = ROUTE_WAIT_MS;
  // The PANE decides, not the page. Asked with the bare page name, Settings
  // resolved to nothing and the gate waved a cold load straight through onto
  // the mockup's fabricated business.
  // `own`: the route's own surface alone, without what its first draw waits for beside it (ROUTE_WAITS).
  w.__surfaceGate = (page, param, own = false) => {
    const key = routeSurfaceFor(page, param);
    if (key && !isSurfaceReady(key)) return false;
    if (own) return true;
    return (ROUTE_WAITS[page] ?? []).every((k) => isSurfaceReady(k) || isSurfaceFailed(k));
  };
  w.__surfaceFailed = (page, param) => {
    const key = routeSurfaceFor(page, param);
    return key ? isSurfaceFailed(key) : false;
  };
  w.__onSurfaceReady = onSurfaceStatusChange;
}

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
import {
  FIRST_RUN_ROUTE,
  RECORD_KINDS,
  personRouteOf,
  reportsParamParts,
  type RecordKind,
} from "@chanlytics/contracts";

import {
  heardOnItsPage,
  heardTables,
  type DeclaredReads,
  type ReadsDeclaration,
  type RealtimeChange,
} from "./surface-realtime";
import { getSurfaceStatuses, isSurfaceFailed, isSurfaceReady, onSurfaceStatusChange } from "./surface-status";
import { routeOnScreen } from "./workspace";
import { hearMoves } from "./hearing/after-the-move";
import { PAGE_HEARS, type PageCell } from "./hearing/page-hears";

export type SurfaceState = "real" | "demo";

export const SURFACE_STATES: Record<string, SurfaceState> = {
  // Fed by live data through the SurfaceData seam.
  today: "real",
  inbox: "real",
  conversations: "real",
  clients: "real", // People, and its scopes: Leads (clients/leads), the Pipeline (clients/pipeline, 0008) and the lists (seg:, list:)
  reports: "real", // the receptionist's numbers; the share link stays demo
  live: "real", // calls in progress + the last few, and the three writes: whisper, hand over, end. Live LISTEN stays in the demo — there is no audio path.

  // The rest: each real from the day its slice shipped, or demo, drawn from the
  // mockup's seeds. The mockup surfaces (Agents: fleet, store, studio, tasks;
  // Content; the Deal board; the shared report viewer) stay in the tree and stay
  // hidden from every real workspace: no nav entry, no tab, the
  // Not-in-this-release card for a hand-typed address. Ruben's decision, 11
  // September 2026: most of it is revisited when the product is at 100%, and none
  // of those features is built before then. Nothing here is a promise to a
  // customer or an operator.
  // Lifted 18 Sep 2026 (Ruben): a scope of People at clients/leads, fed by the leads surface.
  leads: "real", // the route itself still redirects (SURFACE_RETIRED): the scope is clients/leads
  segments: "real", // People › Lists: the lists kept by hand and the computed ones, with their people
  pipeline: "demo", // the mockup's Deal board, retired: its address lands on People (SURFACE_RETIRED); the real Pipeline is People's scope, clients/pipeline (0008)
  calendar: "real", // the owner's calendar as the receptionist reads it: taken, open, closed — a viewer, never a scheduler
  shared: "demo", // the read-only report viewer — a share link over invented numbers
  tasks: "demo",
  fleet: "demo",
  store: "demo",
  studio: "demo",
  campaigns: "real", // Campaigns: Sequences (decision 0060) and the sheet it opens over it, a message, over the playbooks', broadcasts', library's and reach-outs' surfaces
  outbound: "real", // the old Playbooks list, retired: it lands on Sequences, and a playbook on its sequence (contracts retiredRouteOf)
  // Campaigns › Sequences (decision 0060): everything sent on its own, one list and a record, over the sequences surface.
  "campaigns/sequences": "real",
  "campaigns/messages": "real", // Campaigns › Messages (D4: the Library), a view kept beside Sequences under Campaigns' one mount (19 Oct 2026)
  content: "demo",
  broadcasts: "real", // Sent's sheets (a run's, To send, Get their yes) beside Sequences' list; its own address lands on Sequences
  messages: "real", // Campaigns › Messages: what the receptionist and the campaigns send, as the customer sees it, a reach-out's emails included (drawn from the reach_outs surface's chains, each count read as its row opens)
  start: "real", // the first run: Setup's rows a step at a time, read from the workspace (contracts/first-run.ts)
  // Settings, the page itself. Every pane it draws is classified below, and one nobody has listed is not a pane: Settings
  // opens Profile for it (settings/frame/tabs.ts SET_TAB), which the settings read feeds. It was "demo" once, as the honest
  // default for a pane nobody had classified, and the frame drew the card that says Not in this release for any address
  // nobody had listed -- a typed one (settings/hours), and the retired admin/setup, for a frame before the move ran (A3c).
  admin: "real",
  "admin/profile": "real", // you: name, the address you signed in with, your role
  "admin/workspace": "real", // Details: who the business is and what it sells
  "admin/hours": "real", // Hours & booking: the week, closed days, the booking tool, link and rules
  "admin/receptionist": "real", // How it answers: its voice, what it knows, what it can do, what it is told
  "admin/team": "real", // split out of workspace: the people, their roles, invites
  "admin/autonomy": "real", // the policies table, live for the reply row
  "admin/notifications": "real", // who is alerted, from tenant_config
  "admin/integrations": "real", // the channels in tenant_channels, read-only
  // Billing is real on every workspace (surfaces/settings/billing). Memory is not built,
  // and says so IN the pane: falling through to the page's "demo" replaced all
  // of Settings with a bare card; the pane keeps the nav and states what exists
  // instead (settings.jsx PaneSoon). ⌘K's Memory jump lands on Business, where
  // what the receptionist knows lives (contracts ask-jump.ts).
  "admin/billing": "real",
  "admin/memory": "real",
  "admin/activity": "real", // both ledgers, from GET /activity, owners only
  // The back office (gate 5, #300): every workspace sorted by who needs a
  // person, read from the guarded platform routes. It was never listed here,
  // so its tab fell through to the page's "demo" and a platform admin who
  // clicked Back office got the Not-in-this-release card -- found by Ruben
  // on 11 September, the day the tab became the way to file a campaign.
  "admin/platform": "real",
  // A partner's account and link (0012): the offer for everyone else, the row for a partner (surfaces/settings/partner).
  "admin/partner": "real",
};

/**
 * Which SurfaceData override backs each real route — the map the route gate
 * consults before painting. Lives HERE, beside the classification, because the
 * two must agree: a surface is only "real" if an override actually feeds it,
 * and a test pins that every "real" row has an entry and vice versa.
 */
export const ROUTE_SURFACE: Record<string, string> = {
  // Settings: every pane, and Profile for an address that names none, is fed by the settings read.
  admin: "settings",
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
  // Campaigns is Sequences' list (decision 0060): the gate waits for it; the sheets it opens over it read theirs (ROUTE_DRAWS).
  campaigns: "sequences",
  "campaigns/sequences": "sequences", // its Sequences view (0060) is its own list: the gate waits for it, never the home's moments
  // Messages, at its address and at its old route: the templates ride on the settings surface; the page waits for it like Settings does.
  "campaigns/messages": "settings",
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
  "admin/hours": "settings",
  "admin/receptionist": "settings",
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
  // A person's tab is their address with its word (0052): `clients/<id>/history` is still their page (personRouteOf).
  const id = param ? personRouteOf(param).id : null;
  return page === "clients" && id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

/**
 * What a page draws from surfaces other than its own, in the order the page
 * draws them, so a boot on that page reads them right after its own surface
 * (surface-runner.ts screenRank) rather than in the runner's fixed order.
 *
 * Today draws the day beside its queue from the calendar, the queue's runs from
 * broadcasts, the card's period line and Worth a look from the reports headline (one small read, never the whole report), the day's
 * playbook rows, the bell's rows for While you were away, a call in progress
 * from live, the card's Setup and Google lines, and from People the day card's
 * needs-someone flag and channel glyphs and Worth a look's people -- last,
 * because contacts is the heaviest read; the bands that read it draw without it
 * and again when it lands (surface:clients). Measured on the salon
 * (22 Sep 2026): the calendar was read eleventh, behind Settings, People and
 * Leads that nobody was looking at, so the day popped in 1.6 s after the queue
 * beside it. The Calendar draws its campaign marks from their own span read. A
 * route absent here draws only its own surface.
 */
export const ROUTE_DRAWS: Record<string, readonly string[]> = {
  // Setup first: what is left to set up is drawn ABOVE the queue (surfaces/today/pages/setup-card.tsx TodaySetup), and read seventh it
  // landed after the queue and pushed it down (Ruben, 24 Sep: "does not load properly like the rest of the page").
  today: [
    "setup",
    "calendar",
    "broadcasts",
    "reports_headline",
    "playbooks",
    "notifications",
    "live",
    "google",
    "people",
    // A reply to a reach-out, read: its queue row and the bell's door (Reach out Part 5, PR 8).
    "reach_out_replies",
    // The line and the runs' number: Live's strip and Sent's are made of the channels read (surfaces/channels/surface.ts).
    "channels",
    // The counts of the lists pinned here, read on their own (surfaces/today/pins-surface.ts; R10): People's are as of its
    // last read, which nothing on Today reads again.
    "today_pins",
  ],
  // The Calendar's campaign marks (surfaces/calendar/runs-surface.ts): their own span read, on demand. It read People's whole
  // book here for one pill and the deal beside a visit; the visit's person now carries those facts on the board's own read
  // (contracts calendar-person-facts.ts), so a cold Calendar reads no People.
  calendar: ["calendar_runs"],
  // The first run's receptionist card fills in from the settings read: the brain and the resolved numbers. Try it
  // watches the Live page's calls for the test call (first-run-try.ts).
  start: ["settings", "live"],
  // A person's page reads its own person (people-detail.ts); People's row gives it their name in the crumbs and the
  // head while that read is out, so People is read next. The person surface is the page's own read, heard there.
  [PERSON_ROUTE]: ["people", "person"],
  // Get their yes, a sheet over People's list (`clients/get-yes`, the Campaigns wiring review's lane 7): the number and the
  // opt-in its code carries are Sent's read (campaigns/broadcasts/surface.ts), beside People's own.
  "clients/get-yes": ["people", "broadcasts"],
  // A reply to a reach-out, read: the Inbox's strip, composer line and row chip (Reach out Part 5, PR 7). A call in a
  // thread is drawn from the calls Conversations reads (surfaces/inbox/thread/call.tsx tlCallFor), the same door as the Inbox's own.
  // And Sent's runs: the Needs-you rows and the badge say the runs waiting for your word (needs-you.ts), on the Inbox. Their own
  // read, nothing of People, started from the document's head with the Inbox's (the Inbox's run review, 18 Oct 2026).
  inbox: ["reach_out_replies", "conversations", "broadcasts"],
  // A reach-out's chains are Playbooks' rows, and their emails Templates' email rows (Part 4 PR 8): the reach-outs
  // surface, read beside each page's own.
  // And the number a moment goes out on, its standing and its opt-in: the channels read, which the composers are made of.
  outbound: ["reach_outs", "channels"],
  // Campaigns is Sequences' list (decision 0060): its own address, a group's (`in:<group>`) and a campaign's (`moment:<id>`)
  // land there, and draw what Sequences draws beside its list, the settings read. The sheets it opens over the list draw
  // theirs at their own addresses (below), so a landing reads none of them (the Sequences phone review's Reads on landing).
  campaigns: ["settings"],
  // A message in its drawer over Sequences (`campaigns/message:<name>`): the playbooks surface the sheets wait for, whose
  // library names the call's text, the settings read's templates its pane is drawn from, and the channels read's numbers.
  "campaigns/message": ["playbooks", "settings", "channels"],
  // Sequences (0060) draws its own list, read as the view comes on screen (onDemand), and the settings read: its preview's
  // switch, and the messages a step may send (offered-templates.ts).
  "campaigns/sequences": ["sequences", "settings"],
  // Messages says which playbooks send each message, and its number notice and a message's drawer are the channels read's.
  messages: ["reach_outs", "playbooks", "channels"],
  "campaigns/messages": ["reach_outs", "playbooks", "channels"],
  // Sent's sheets stand beside Sequences' list (decision 0060, D3), and a run's names its playbook. Send it again on a run that
  // went offers its list where it can still be sent to: who each audience reaches, last, since it is every page of People, and
  // never waited for (the sheet draws from Sent's runs alone, and the button joins it once that is in).
  broadcasts: ["sequences", "playbooks", "channels", "audiences"],
  // Live's line, its number and its switch: the channels read, which Live is made of beside its calls.
  live: ["channels"],
  // The Reviews, Receptionist, People and Campaigns lenses draw their own reads beside Reports' (surfaces/reports/reviews-surface.ts,
  // receptionist-surface.ts, people-surface.ts, campaigns-surface.ts): no other lens of Reports does, and the Pipeline's row says so
  // (an empty one), or it would fall to the page's.
  "reports/reviews": ["reports_reviews"],
  "reports/receptionist": ["reports_receptionist"],
  "reports/people": ["reports_people"],
  "reports/campaigns": ["reports_campaigns"],
  "reports/pipeline": [],
  // The Ads lens (a demo session's, from the Ads sample) reads nothing of its own: an empty row, or it would fall to the Overview's
  // read of the Campaigns lens.
  "reports/ads": [],
  // The Overview draws the Campaigns lens's reads for one fact, which campaign drew the most replies (the page makes it from
  // `campaigns.sources`): the page's own row, which the Overview and a lens with no row of its own fall to. It is read as the
  // Overview comes on screen and again when it has aged, never for each burst of messages (campaigns-surface.ts heardOnTheLens).
  reports: ["reports_campaigns"],
  // Settings' Connections pane draws Google's listing and its connection beside the settings read, as Today's card draws its
  // review line (`google` is read where one of the two is on screen, legacy-bridge/google.ts): no other pane of Settings does.
  // Its WhatsApp and phone rows are the channels read's (surfaces/channels/surface.ts).
  "admin/integrations": ["google", "channels"],
  // Settings' Notifications pane draws what reaches the member's own phones beside the settings read (decision 0040).
  "admin/notifications": ["alerts"],
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
  // The Inbox's rows of the runs waiting for your word stand above its threads: landing after them, four pushed them 330px down
  // on a phone (18 Oct 2026). Sent's runs read nothing of People and leave from the document's head with the threads.
  inbox: ["broadcasts"],
  // Reports' strip of lenses is decided from the workspace list (the role of who is looking: a lens is shown from its
  // rung up) and draws above the page's body, so a list that landed after it would add a tab to a strip already drawn.
  reports: ["workspace"],
};
export const ROUTE_WAIT_MS = 3000;

/**
 * The pane a param names. Settings' may name a Business row after its pane (`workspace/calendar`, a door from another
 * page that opens that row: settings/frame/tabs.ts settingsRowOf), and the pane is what is classified, fed, waited for
 * and moved: asked about the whole of it, each lookup below found nothing and answered for the bare page, so the gate
 * would not have waited for the settings read at all.
 */
function paneOf(page: string, param?: string | null): string | null | undefined {
  // Reports' param may say the days a member picked, alone or after its lens (`reviews:2026-09-01~2026-09-20`, contracts
  // lensRoute): the lens is what is classified and fed, and days alone are the Overview, which is the bare page.
  if (page === "reports" && param) {
    const at = reportsParamParts(param);
    if (at) return at.lens === "overview" ? null : at.lens;
  }
  // Campaigns' first word is what is fed: its Sequences view (`campaigns/sequences/<id>/people`), a message
  // (`campaigns/message:<name>`), a campaign that lands on its sequence (`moment:<id>`).
  // Sequences' own addresses (a record, a run at its home, New) are its view's, `sequences`, as the shell parses a route: their
  // screens ask for what they are made of beyond its list as they are drawn (use-surface.ts useReadsHere).
  if (page === "campaigns" && param) return param.split(/[/:]/)[0] || param;
  // A Settings pane's: the first word is what is fed.
  return page === "admin" && param && param.includes("/") ? param.slice(0, param.indexOf("/")) : param;
}

/**
 * What a route draws beside its own surface: a person's page is one route of its own, whatever its id, and a lens or a pane
 * that names its draws (`reports/reviews`, `reports/receptionist`, `reports/people`, `reports/campaigns`, `reports/pipeline`,
 * `admin/integrations`) is asked about before its page, as routeSurfaceFor asks it.
 */
export function routeDrawsFor(page: string, at?: string | null): readonly string[] {
  const param = paneOf(page, at);
  // Leads is `clients/leads…`, the scope asked about as routeSurfaceFor asks it, never as People. It draws nothing beside
  // its own surface: the reach-out sheet that wrote from Setup's mailboxes and checked Settings' link went with the
  // composer (the lead-to-sequence canvas, 18 Oct 2026), and a sequence to leads is written on Sequences.
  if (page === "clients" && param && /^leads(:|$)/.test(param)) return [];
  const specific = param ? ROUTE_DRAWS[`${page}/${param}`] : undefined;
  if (specific) return specific;
  return ROUTE_DRAWS[personRouteId(page, param) ? PERSON_ROUTE : page] ?? [];
}

/**
 * Every surface the route on screen is drawn from: who is looking (the workspace, which carries the role every gate
 * reads), the route's own surface, and what it draws beside it. The shell is drawn again when one of these moves
 * (surface-status.ts), and by no other surface's read.
 */
export function routeSurfaces(page: string, param?: string | null): string[] {
  const own = routeSurfaceFor(page, param);
  return [...new Set(["workspace", ...(own ? [own] : []), ...routeDrawsFor(page, param)])];
}

// What each page hears, by family of addresses (decision 0058): a table of its own (hearing/page-hears.ts), read here.
export { PAGE_HEARS, type PageCell };

/* ------------------------- what a message re-reads ------------------------- */

/** The page and its param a route names, as the shell parses it (app-shell.jsx parseRoute). */
function pageOfRoute(route: string): { page: string; param: string | null } {
  const [page, param] = route.split("/");
  return { page: page || "today", param: param || null };
}

/** The scope of People that Leads is (`clients/leads…`), as PAGE_HEARS names it. */
const LEADS_SCOPE = "clients/leads";

/**
 * The family an address is of, for what its pages hear (PAGE_HEARS): a person's page on any tab is one family
 * (PERSON_ROUTE), Leads' scope under any view is one, a Reports lens over any days is its lens, a Settings pane with any row after
 * it is its pane, and Settings with none is the pane it opens (SURFACE_DEFAULT_PARAM). Anything else is its page: a Campaigns
 * moment is Campaigns, a thread is the Inbox. A pane or a word with no row of its own is its page's, as the shell draws it.
 */
export function routeFamilyOf(route: string): string {
  const { page, param } = pageOfRoute(route);
  const pane = paneOf(page, param);
  if (page === "clients" && pane && /^leads(:|$)/.test(pane)) return LEADS_SCOPE;
  if (personRouteId(page, pane)) return PERSON_ROUTE;
  const at = pane || SURFACE_DEFAULT_PARAM[page];
  const named = at ? `${page}/${at}` : null;
  // A person's family is a person's id, never the word: `clients/person` typed by hand is People's, as the shell draws it.
  return named && named !== PERSON_ROUTE && Object.hasOwn(PAGE_HEARS, named) ? named : page;
}

/** This surface's cell on the family of the address: what it hears there of what it hears only on its page; undefined for none. */
function cellOf(key: string, route: string): PageCell | undefined {
  const family = routeFamilyOf(route);
  const row = Object.hasOwn(PAGE_HEARS, family) ? PAGE_HEARS[family] : undefined;
  return row && Object.hasOwn(row, key) ? row[key] : undefined;
}

/**
 * Whether this surface is the one the page on screen is of: one its family names in PAGE_HEARS, its own surface
 * and those it hears the way its own are, whole or for some kinds. An address of no family is no surface's.
 */
export function ownsTheScreen(key: string, route: string): boolean {
  return cellOf(key, route) !== undefined;
}

/** Each table's kind (contracts RECORD_KINDS), for a cell that names kinds. */
const KIND_OF: ReadonlyMap<string, RecordKind> = new Map(
  (Object.entries(RECORD_KINDS) as [RecordKind, readonly string[]][]).flatMap(([kind, tables]) =>
    tables.map((table) => [table, kind] as const),
  ),
);

/**
 * Whether a change to this table is this surface's to hear on the page on screen: its cell is every kind, or names the table's.
 * Sent's runs on Campaigns' home hear a person's answer and leave a message to Sent.
 */
export function ownsTable(key: string, table: string, route: string): boolean {
  const cell = cellOf(key, route);
  if (cell === true) return true;
  const kind = KIND_OF.get(table);
  return !!cell && !!kind && cell.includes(kind);
}

/**
 * Surfaces that let a live event pass while their page was elsewhere, with the tables they let pass, and ones a pass left for
 * their page whole (keepForItsPage, `"all"`): read once when a page that owns what they missed comes on screen. A message that
 * Sent's runs let pass on Campaigns waits for Sent; a person's answer they let pass on Today is read as Campaigns comes back.
 */
const missedWhileAway = new Map<string, Set<string> | "all">();

/**
 * When each surface was last let pass or kept for its pages: a read of it that began after that holds what it missed, and its
 * note goes as the read lands (readLanded), so its page does not read it a second time (the wiring's second audit, S2-7).
 */
const missedAt = new Map<string, number>();

/** Note a table a surface let pass. */
function missed(key: string, table: string): void {
  missedAt.set(key, Date.now());
  const was = missedWhileAway.get(key);
  if (was === "all") return;
  if (was) was.add(table);
  else missedWhileAway.set(key, new Set([table]));
}

/** Whether the page on screen owns what this surface missed: the surface, where it was kept whole, else one of the tables it let pass. */
function owesTheScreen(key: string, route: string): boolean {
  const was = missedWhileAway.get(key);
  if (!was) return false;
  return was === "all" ? ownsTheScreen(key, route) : [...was].some((table) => ownsTable(key, table, route));
}

/**
 * A surface read only where it is drawn (`onDemand`), left out of a pass that read the others while its page was elsewhere (a
 * return to the tab, the network back, a rejoin of the live feed, Retry-all): kept, so its page reads it once as it comes on
 * screen (readWhatWasMissed) rather than show what the pass would have read again.
 */
export function keepForItsPage(key: string): void {
  missedAt.set(key, Date.now());
  missedWhileAway.set(key, "all");
}

/**
 * What a change made somewhere else owes the pages that draw it: of these surfaces, the ones whose page is on screen, which the caller
 * reads now, and the rest kept for their own page (keepForItsPage), read once as it comes on screen. People's rows after a mode saved
 * reach their pages this way (refresh-map.ts peopleIfOwned): the feed's notice of the rules reaches People by table there too. A
 * surface drawn on pages that do not own it is left by drawnHere, below.
 */
export function whereDrawn<T extends { key: string }>(overrides: readonly T[], route: string = routeOnScreen()): T[] {
  const here = overrides.filter((o) => ownsTheScreen(o.key, route));
  for (const o of overrides) if (!here.includes(o)) keepForItsPage(o.key);
  return here;
}

/**
 * Whether the page on screen draws this surface: one its family owns (PAGE_HEARS), or one its route draws beside its own
 * (routeSurfaces: ROUTE_DRAWS, and who is looking). Today draws Sent's runs and the playbooks' counts and owns neither; Connections
 * owns some of Setup's kinds and draws Setup's calendar row.
 */
export function drawsTheScreen(key: string, route: string): boolean {
  if (ownsTheScreen(key, route)) return true;
  const { page, param } = pageOfRoute(route);
  return routeSurfaces(page, param).includes(key);
}

/** Surfaces a write left for the pages that draw them (drawnHere): read once as one of those comes on screen, or is reached for. */
const leftUntilDrawn = new Set<string>();

/**
 * Leave a surface for whichever page next draws it, read once as one comes on screen (readWhatWasMissed): what a pass over the
 * surfaces does with one heard only on its page while no page that draws it is on screen (the runner's readHere; S10-7).
 */
export function keepUntilDrawn(key: string): void {
  missedAt.set(key, Date.now());
  leftUntilDrawn.add(key);
}

/**
 * A read of this surface landed, begun at `startedAt` (the runner's readFrom): what it was kept for, let pass or left for its pages
 * before then, it now holds, and no page owes it a read for that. A read that began before the last miss leaves the note.
 */
export function readLanded(key: string, startedAt: number): void {
  const at = missedAt.get(key);
  if (at === undefined || !(startedAt > at)) return;
  missedAt.delete(key);
  missedWhileAway.delete(key);
  leftUntilDrawn.delete(key);
}

/**
 * What a write owes the pages that draw what it changed (the wiring's second audit, S10-6): of these surfaces, the ones the page on
 * screen draws (drawsTheScreen), which the caller reads now, and the rest left for whichever page next draws them, read once as it
 * comes on screen (readWhatWasMissed) or is reached for (warmWhatItDraws). Not whereDrawn, whose keep waits for a surface's own page:
 * a visit marked on the Calendar must not leave Today's day strip, which draws the playbooks' counts and owns none of them, on the old
 * count. The writer's tab alone: the feed tells every other tab, each surface by its own rule.
 */
export function drawnHere<T extends { key: string }>(overrides: readonly T[], route: string = routeOnScreen()): T[] {
  const here = overrides.filter((o) => drawsTheScreen(o.key, route));
  // One read here now is what an earlier write left it for, too.
  for (const o of overrides) {
    if (here.includes(o)) leftUntilDrawn.delete(o.key);
    else keepUntilDrawn(o.key);
  }
  return here;
}

/**
 * A surface that counts messages but is not where they are read -- People's rows, Reports' numbers, a campaign's
 * replies -- hears these tables only while its own page is on screen; an event it lets pass is kept, and the surface
 * is read once as its page comes on screen (readWhatWasMissed). One message used to re-read seven surfaces, four of
 * them on no page anyone was looking at, People among them, every page of it; now the Inbox, Conversations and Today,
 * which draw messages, and the page on screen. A table the rule does not name is the surface's own, heard always.
 */
export function onlyOnItsPage(
  key: string,
  tables: readonly string[],
  route: () => string = () => routeOnScreen(),
): (change: { table: string }) => boolean {
  return (change) => {
    if (!tables.includes(change.table) || ownsTable(key, change.table, route())) return true;
    missed(key, change.table);
    return false;
  };
}

/**
 * A surface's declaration as the runner reads it (decision 0047): the kinds of record it draws and how fresh it must stay, and
 * from them the tables it hears (`refreshOnTables`) and the rule that judges an event (`refreshWhen`: its own `when`, then the
 * page rule `onlyOnItsPage` for the tables it hears only on its page). `key` is the surface's own. Spread into its override,
 * which never writes `refreshOnTables` itself: `...declareReads("people", { reads, fresh: "its-page", always, omit })`.
 */
export function declareReads(key: string, d: ReadsDeclaration): DeclaredReads {
  const tables = heardTables(d);
  const standard: ((c: RealtimeChange) => boolean) | null =
    d.fresh === "its-page" ? onlyOnItsPage(key, heardOnItsPage(d)) : null;
  const onPage = standard && d.page ? d.page(standard) : standard;
  const { when } = d;
  const refreshWhen = when && onPage ? (c: RealtimeChange) => when(c) && onPage(c) : (when ?? onPage ?? undefined);
  return {
    reads: d.reads,
    fresh: d.fresh,
    ...(d.omit?.length ? { omit: d.omit } : {}),
    ...(tables.length ? { refreshOnTables: tables } : {}),
    ...(refreshWhen ? { refreshWhen } : {}),
  };
}

/**
 * Each move of the address: what its page draws and has not read is read once, through the runner (`read`, the running
 * runner's refresh). Three kinds of surface are due. One that let a live event pass while its page was elsewhere, when its page
 * owns the screen. One marked `onDemand` (surface-data.ts), when a page that draws it (its own surface, or one the route
 * names) is on screen and it has never been read this session, a pass left it for its page (keepForItsPage), or it says it has
 * aged: one list, so a surface that missed an event and was never read is read once. And one a write left for the pages that
 * draw it (drawnHere), when one of them is on screen. When each is read: hearing/after-the-move.ts. Answers the stop.
 */
export function readWhatWasMissed(
  overrides: readonly { key: string; onDemand?: boolean; isStale?: () => boolean }[],
  read: (keys: string[]) => void,
  win: Window = window,
): () => void {
  const dueAtMove = () => {
    const route = routeOnScreen(win);
    const { page, param } = pageOfRoute(route);
    const drawn = routeSurfaces(page, param);
    const readBefore = (key: string) => getSurfaceStatuses().get(key) === "live";
    const due = overrides.filter(
      (o) =>
        (leftUntilDrawn.has(o.key) && drawsTheScreen(o.key, route)) ||
        (o.onDemand
          ? drawn.includes(o.key) && (missedWhileAway.has(o.key) || !readBefore(o.key) || !!o.isStale?.())
          : owesTheScreen(o.key, route)),
    );
    for (const o of due) {
      missedWhileAway.delete(o.key);
      leftUntilDrawn.delete(o.key);
    }
    return due.map((o) => o.key);
  };
  return hearMoves(dueAtMove, read, win);
}

/**
 * A page somebody is reaching for (a pointer over its row in the sidebar, a thumb on it, the phone's drawer opening over
 * the pages only it leads to): what that page draws and reads only where it is drawn (`onDemand`), and has not read this
 * session, is read now through the runner, so the move that follows finds it in or on its way. Reports is read on no
 * other page's boot (6 Oct 2026: three reads Today never drew), so its first press in a session read all three behind
 * "Reading…": 470 to 700 ms on a desk, where every page read at boot answered in under 60 (9 Oct 2026, production).
 * One never read is asked for once a session: a warm that failed leaves it unread, and its page reads it as it comes
 * on screen (readWhatWasMissed), as it always did. One a pass left for its page (keepForItsPage) is read as its page
 * is reached for, and is no longer owed when the page arrives, or the press would read it twice; so is one a write left
 * for the pages that draw it (drawnHere), whatever kind it is. Answers the function a reach calls with the route reached for.
 */
export function warmWhatItDraws(
  overrides: readonly { key: string; onDemand?: boolean }[],
  read: (keys: string[]) => void,
): (route: string) => void {
  const asked = new Set<string>();
  return (route) => {
    const { page, param } = pageOfRoute(route);
    const drawn = routeSurfaces(page, param);
    const due = overrides.filter((o) => {
      if (leftUntilDrawn.has(o.key) && drawsTheScreen(o.key, route)) return true;
      if (!o.onDemand || !drawn.includes(o.key)) return false;
      if (missedWhileAway.has(o.key)) return true;
      return !asked.has(o.key) && getSurfaceStatuses().get(o.key) !== "live";
    });
    for (const o of due) {
      asked.add(o.key);
      missedWhileAway.delete(o.key);
      leftUntilDrawn.delete(o.key);
    }
    if (due.length) read(due.map((o) => o.key));
  };
}

/**
 * Published for the mockup shell (a classic script that cannot import).
 * Absent — the standalone mockup opened without the bridge — everything
 * renders, which is correct there: the whole artifact is a demo.
 */
/**
 * The state of one route, most specific first.
 *
 * Settings is one page with panes behind it, and they were not all at the
 * same stage: the workspace pane could be fed by real APIs while billing and
 * integrations were still drawn from seeds. Classifying only the PAGE forced a
 * choice between hiding a finished pane and shipping five invented ones — so
 * the table accepts `admin/workspace` as well as `admin`, and falls back
 * to the page when no sub-route is listed.
 *
 * Every pane Settings draws is real now, and so is the page: an address that
 * names no pane of it is not a pane nobody classified but Profile, which
 * Settings opens (settings/frame/tabs.ts SET_TAB). A new pane is classified in
 * the same change that draws it.
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
  const pane = paneOf(page, param) || SURFACE_DEFAULT_PARAM[page];
  // An address that moves on (ROUTES_MOVED: admin/setup is the first run) draws nothing, so there is nothing to wait for.
  if (pane && ROUTES_MOVED[`${page}/${pane}`]) return undefined;
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
  const pane = paneOf(page, param) || SURFACE_DEFAULT_PARAM[page];
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
export function surfaceRetiredTo(page: string, at?: string | null, demo = false): string | undefined {
  const param = paneOf(page, at);
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
 * Whether the gate is open on a route: its own surface holds real rows, and (unless `own`) what its first draw waits
 * for beside it is in or has failed (ROUTE_WAITS). The PANE decides, not the page: asked with the bare page name,
 * Settings resolved to nothing and the gate waved a cold load straight through onto the mockup's fabricated business.
 * The shell's gate (installRouteGate) and the page's measures (client/page-speed.ts) ask this one rule.
 */
export function routeGateOpen(page: string, param?: string | null, own = false): boolean {
  const key = routeSurfaceFor(page, param);
  if (key && !isSurfaceReady(key)) return false;
  if (own) return true;
  return (ROUTE_WAITS[page] ?? []).every((k) => isSurfaceReady(k) || isSurfaceFailed(k));
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
  // `own`: the route's own surface alone, without what its first draw waits for beside it (ROUTE_WAITS).
  w.__surfaceGate = routeGateOpen;
  w.__surfaceFailed = (page, param) => {
    const key = routeSurfaceFor(page, param);
    return key ? isSurfaceFailed(key) : false;
  };
  w.__onSurfaceReady = onSurfaceStatusChange;
}

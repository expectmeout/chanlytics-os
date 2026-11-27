/**
 * The surface classification must be EXHAUSTIVE and must agree with the wiring.
 *
 * The previous honesty mechanism was per-route: one route (Settings) was gated
 * by hand and fifteen fabricated branches stayed reachable in production —
 * Broadcasts animating a delivery that never happened, Calendar claiming a
 * customer was notified, Reports showing revenue the schema has no column for.
 * A rule applied per-route is a rule someone forgets per-route.
 *
 * The registry inverts that: the shell derives the gate from one table, and
 * this test makes the table load-bearing —
 *   1. every route the shell declares is classified (a NEW route cannot ship
 *      unclassified: this test fails instead), and
 *   2. "real" agrees exactly with the SurfaceData wiring (a surface cannot be
 *      declared real without an override feeding it, or wired without being
 *      declared).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DASH = path.join(here, "../../../apps/dashboard/src");
const registry = await import(pathToFileURL(path.join(DASH, "bridge/surface-registry.ts")).href);
// The routes that have left the shell: each has an App Router page of its own (decision 0015).
const { SURFACE_ROUTES, routeHasPage } = await import(pathToFileURL(path.join(DASH, "surfaces/routes.ts")).href);
const { setSurfaceValue } = await import(pathToFileURL(path.join(DASH, "surfaces/surface-values.ts")).href);
const WORKSPACE_APP = path.join(DASH, "../app/(os)/w/[workspace]");
// The product's word for a route the shell names otherwise (contracts shell/address.ts): the page's folder says the word.
const { ROUTE_WORDS } = await import("@chanlytics/contracts");
const wordOf = (route) => (Object.hasOwn(ROUTE_WORDS, route) ? ROUTE_WORDS[route] : route);
// Rows a moved route keeps in route-table.tsx: each for an address its page does not take, or (address null) for a session
// its page is not drawn for. The mockup's seeded Lists page is drawn where there is no workspace to read (a demo session),
// a real workspace's Lists being the App Router page. A person's page, the Pipeline and Leads are People's page's own since
// they moved (Leads: decision 0015, step 9).
const ROWS_LEFT = {
  segments: [{ word: "realWorkspace", address: null }],
};
const { SURFACE_STATES, ROUTE_SURFACE, surfaceStateFor, routeSurfaceFor, routeSurfaces, surfaceRetiredTo } =
  await import(pathToFileURL(path.join(DASH, "bridge/surface-registry.ts")).href);

// The shell's router is the route table (surfaces/frame/route-table.tsx SHELL_ROUTES): a row per route, by its page.
const { SHELL_ROUTES } = await import(pathToFileURL(path.join(DASH, "surfaces/frame/route-table.tsx")).href);

/** A route's App Router page: `<word>/page.tsx`, or under an optional catch-all (`<word>/[[...thread]]/page.tsx`) where the route takes an address under it. */
function pageFileOf(route) {
  const dir = path.join(WORKSPACE_APP, wordOf(route));
  if (fs.existsSync(path.join(dir, "page.tsx"))) return true;
  if (!fs.existsSync(dir)) return false;
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .some(
      (e) =>
        e.isDirectory() && /^\[\[\.\.\.[a-z]+\]\]$/.test(e.name) && fs.existsSync(path.join(dir, e.name, "page.tsx")),
    );
}

// Every page the frame can route is classified, nothing is classified that nothing routes, no route grows a demo
// conditional of its own and the shared viewer is gated: a rule of the frame's code, tests/repo/rules/
// the-frame-routes-only-what-the-registry-classifies.test.mjs; the gate itself is run in
// shell/boot/the-frame-draws-what-it-holds.test.mjs. Pinned here as the frame's text until 27 Nov 2026.

test("a route with an App Router page has no row in route-table.tsx, and a page has its route", () => {
  // A route is drawn once. A surface that moved took its row with it (decision 0015, step 3); a row left behind would be
  // drawn by the frame's table while the layout drew the page too, and a page with no entry here is a route the frame
  // draws no chrome around.
  for (const [route, page] of Object.entries(SURFACE_ROUTES)) {
    // A page that takes addresses under its route is an optional catch-all, and draws the route alone as well.
    assert.ok(
      pageFileOf(route),
      `${route} is in SURFACE_ROUTES and has no app/(os)/w/[workspace]/${wordOf(route)}/page.tsx (or, for a route that takes an address under it, ${wordOf(route)}/[[...x]]/page.tsx)`,
    );
    const rows = SHELL_ROUTES.filter((r) => r.page === route);
    const allowed = ROWS_LEFT[route] ?? [];
    assert.ok(
      rows.length <= allowed.length,
      `${route} has an App Router page and still a row in route-table.tsx for an address the page takes`,
    );
    assert.ok(
      routeHasPage(route) && routeHasPage(`${route}/x`) === (page.params === true || !!page.takes?.("x")),
      "the route alone is the page, and an address under it only where the route takes one (for every address, or for the ones it names)",
    );
    for (const { address } of allowed) {
      if (address === null) continue;
      setSurfaceValue("people", {});
      try {
        assert.ok(!routeHasPage(`${route}/${address}`), `${route}/${address} is a row's, not the page's`);
      } finally {
        setSurfaceValue("people", undefined);
      }
    }
  }
  const pages = fs
    .readdirSync(WORKSPACE_APP, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("["))
    .map((e) => e.name)
    .filter((name) => pageFileOf(name))
    .sort();
  assert.deepEqual(
    pages,
    Object.keys(SURFACE_ROUTES).map(wordOf).sort(),
    "every page beside the catch-all has its route in SURFACE_ROUTES",
  );
});

test("an Ads address waits for the read that says whether it is drawn, never for Sequences' list it does not draw", () => {
  for (const param of ["ads", "ads:new", "ads:results", "ads:ad:some-ad"]) {
    assert.equal(routeSurfaceFor("campaigns", param), "settings", param);
    assert.ok(!routeSurfaces("campaigns", param).includes("sequences"), param);
    assert.equal(surfaceStateFor("campaigns", param), "real", "it stands under Campaigns, with no state of its own");
  }
  assert.equal(routeSurfaceFor("campaigns", null), "sequences", "and Campaigns' own address still does");
  assert.equal(routeSurfaceFor("campaigns", "sequences"), "sequences");
  assert.equal(
    SURFACE_STATES["campaigns/ads"],
    undefined,
    "no row: a real page is a jump for every workspace, and only some have this",
  );
});

test("'real' and the SurfaceData wiring agree exactly", () => {
  const real = Object.entries(SURFACE_STATES)
    .filter(([, v]) => v === "real")
    .map(([k]) => k)
    .sort();
  const wired = Object.keys(ROUTE_SURFACE).sort();
  assert.deepEqual(
    real,
    wired,
    "a surface declared real without an override paints seeds through an open gate; one wired without being declared real is gated off while fetching",
  );
});

test("the real set is exactly the converted surfaces", () => {
  // Pinned by value, deliberately: flipping a surface to real is a decision
  // that should show up in THIS diff, not slide in via a helper.
  const real = Object.entries(SURFACE_STATES)
    .filter(([, v]) => v === "real")
    .map(([k]) => k)
    .sort();
  assert.deepEqual(real, [
    "admin",
    "admin/activity",
    "admin/autonomy",
    "admin/billing",
    "admin/content",
    "admin/files",
    "admin/hours",
    "admin/integrations",
    "admin/memory",
    "admin/notifications",
    "admin/outreach",
    "admin/partner",
    "admin/platform",
    "admin/profile",
    "admin/receptionist",
    "admin/team",
    "admin/workspace",
    "broadcasts",
    "calendar",
    "campaigns",
    "campaigns/messages",
    "campaigns/sequences",
    "clients",
    "conversations",
    "inbox",
    "leads",
    "live",
    "messages",
    "outbound",
    "reports",
    "segments",
    "start",
    "today",
  ]);
  // The back office tab, asked the way the shell asks: by page and pane. It
  // was never listed, fell through to the page's "demo", and a platform admin
  // who clicked Back office got the Not-in-this-release card.
  assert.equal(surfaceStateFor("admin", "platform"), "real");
  // The Console's door draws nothing of the settings read, so its gate waits for who is looking (the Settings load review).
  assert.equal(routeSurfaceFor("admin", "platform"), "workspace", "and the gate waits for who is looking");
});

// The frame consults the registry through one interception, not per-route conditionals, and the shared viewer is gated
// too: the rule above, and the gate run in shell/boot/.

/* ------------------------- sub-surface classification --------------------- */

test("a sub-route is checked BEFORE its page", () => {
  // Settings is one page with six panes behind it, and they are not at the same
  // stage. Classifying only the page forced a choice between hiding a finished
  // pane and shipping five invented ones.
  const { surfaceStateFor } = registry;
  assert.equal(surfaceStateFor("admin", "workspace"), "real");
  assert.equal(
    surfaceStateFor("admin", "nonsense"),
    "real",
    "an unlisted pane is Settings' too, and Settings opens it on Profile (A3c)",
  );
  // No pane named resolves to the one the shell will actually render —
  // see the default-pane test below.
  assert.equal(surfaceStateFor("admin", null), "real");
});

test("an address under Settings that nobody listed opens Profile, never the card that says Not in this release (A3c)", () => {
  // The frame replaces a demo address with that card (routeGated), and the page `admin` was classified demo, so every
  // pane nobody had listed inherited it: a typed or invented address (settings/hours) showed the card, where Settings' own
  // rule (settings/frame/tabs.ts SET_TAB) opens Profile. Every pane Settings draws is classified, and the page is Settings:
  // the pane that renders is real or is Profile, and the gate waits for the read that feeds it.
  for (const pane of ["nonsense", "seats", "hours", "workspace/calendar"]) {
    assert.equal(registry.surfaceStateFor("admin", pane), "real", pane);
  }
  for (const pane of ["nonsense", "seats", "hours"])
    assert.equal(registry.routeSurfaceFor("admin", pane), "settings", `${pane}: Profile is fed by the settings read`);
});

test("a moved address (admin/setup, kept 30 days on bell rows) is nothing for a frame: classified as the page it was in, waiting for nothing, and moved (A3c)", () => {
  assert.equal(surfaceRetiredTo("admin", "setup"), "start");
  assert.equal(
    surfaceStateFor("admin", "setup"),
    "real",
    "not demo: the frame drew the Settings card for it until the effect that moves it had run",
  );
  assert.equal(
    routeSurfaceFor("admin", "setup"),
    undefined,
    "there is nothing to wait for on an address that moves on",
  );
  assert.equal(routeSurfaceFor("admin", "workspace"), "settings", "the rest of Settings waits for its read as before");
});

test("every real sub-route names an existing page", () => {
  // "conversation/x" with no "conversation" page would be a rule that can never
  // fire — and would look like coverage while providing none.
  for (const key of Object.keys(SURFACE_STATES)) {
    if (!key.includes("/")) continue;
    const [page] = key.split("/");
    assert.ok(
      SURFACE_STATES[page] !== undefined,
      `${key} classifies a pane of "${page}", which is not itself a surface`,
    );
  }
});

// The frame asks with the param, or sub-routes are decoration: the gate run with a pane in shell/boot/
// the-frame-draws-what-it-holds.test.mjs ("the route gate asks with the pane it is about to draw").

/* ------------------------- no fabricated colleagues ----------------------- */

// REGRESSION: an unconfigured workspace is not shown somebody else's business. Migration 00017 provisions a tenant with
// an EMPTY tenant_config row, and the pane fell to its mockup branch (Serenity Spa, invented hours) on a surface classified
// real. Drawn: workspace/settings-owner-panes/every-address-of-the-business-lands-on-its-pane.test.mjs ("a workspace with
// no receptionist set up is told so"), and the card itself in receptionist/business-tab/business-tab-create.test.mjs.

// The Team card reads the real roster, never the mockup's seeded one; "You" is decided by the signed-in email; a real
// workspace is counted in people, never in seats of a plan it does not have. The card is TSX now (surfaces/settings/team,
// decision 0015 step 11) and has no seeded roster at all: drawn in settings-honest.test.mjs ("a real roster is counted in
// people") and workspace/settings-owner-panes/ ("a team read that failed ...").

test("REGRESSION: a page opens on the pane it actually renders", () => {
  // The shell renders Settings as tab={param || "workspace"}, so /admin with no
  // pane DOES render the workspace pane — while the gate, asked about "admin",
  // answered demo and replaced it with the Coming Soon card. The sidebar's
  // Settings link is exactly that route, so the finished pane was unreachable
  // by normal navigation: only a hand-typed #/admin/workspace could find it.
  assert.equal(registry.surfaceStateFor("admin", null), "real");
  assert.equal(registry.surfaceStateFor("admin"), "real");
  // A named pane still wins over the default, and an unlisted one is Settings' (Profile).
  assert.equal(registry.surfaceStateFor("admin", "nonsense"), "real");
});

test("every default pane is one the registry classifies", () => {
  // A default naming a pane with no entry would silently fall back to the
  // page's state, which is the bug this map exists to fix.
  for (const [page, pane] of Object.entries(registry.SURFACE_DEFAULT_PARAM)) {
    assert.ok(
      SURFACE_STATES[`${page}/${pane}`] !== undefined,
      `${page} defaults to "${pane}", which is not classified`,
    );
  }
});

// The empty profile leads with a button, not a footnote. Every workspace starts here, and a faint Edit link in a
// card header is findable only by someone who already knows the form exists. Since Task 3.7 the form is gone and
// the page says it at the top instead: the gap line names the one gap most worth closing and IS the door to
// the row that closes it (the spec's 4.1). Drawn and pressed, not read -- receptionist/business-tab/page/, "a missing
// voice is named in the gap line, and the link opens its row".

/* ------------------ the gate must resolve the same way ------------------- */

test("REGRESSION: the route gate resolves the PANE, not just the page", () => {
  // The registry was right and the LOOKUP was wrong. ROUTE_SURFACE has
  // carried "admin/workspace" since Settings was flipped, but the gate asked
  // ROUTE_SURFACE["admin"], found nothing, and answered "ready" before any
  // settings data existed — so a cold load painted the mockup's business, its
  // invented staff and its invented phone number to a real owner, for as long
  // as the fetch took. Reproduced in the browser before it was fixed.
  assert.equal(registry.routeSurfaceFor("admin", "workspace"), "settings");
  assert.equal(registry.routeSurfaceFor("admin", null), "settings", "the default pane is what renders");
  assert.equal(registry.routeSurfaceFor("admin"), "settings");
});

test("a pane nobody listed waits for the read that feeds the pane it opens, Profile", () => {
  assert.equal(registry.routeSurfaceFor("admin", "nonsense"), "settings");
});

test("the Leads SCOPE of People waits for its own surface, not for People's", () => {
  // People has two scopes fed by two surfaces. Asked about the page, the gate
  // waits for People's rows and opens — so the Leads scope would paint with no
  // searches, no rows and no counts for as long as its own read took, which is
  // the frame of invented-looking emptiness this gate exists to prevent.
  assert.equal(registry.routeSurfaceFor("clients", "leads"), "leads");
  assert.equal(registry.routeSurfaceFor("clients", "leads:s-3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c:l-ready"), "leads");
  assert.equal(registry.routeSurfaceFor("clients"), "people", "the list of clients is still People's");
  // The bare route redirects (SURFACE_RETIRED), and is classified because the
  // registry's two halves must agree: real means an override feeds it.
  assert.equal(registry.routeSurfaceFor("leads"), "leads");
  assert.equal(registry.surfaceRetiredTo("leads"), "clients/leads");
  // The Deal board retired into People (pinned as surface-registry.ts's text in calendar/people/ until 25 Nov 2026).
  assert.equal(registry.surfaceRetiredTo("pipeline"), "clients");
});

test("People resolves to its override for the list; a profile deep link waits only for who is looking", () => {
  // The profile route is clients/<contact id>. The pane is NOT fed by the list's fetch: it reads its own person
  // (people-detail.ts), so waiting for the list only put People's whole read in front of it (0.87 s on a new tab,
  // measured on production 23 Sep 2026). It waits for the workspace, which carries the role its acts depend on.
  assert.equal(registry.routeSurfaceFor("clients"), "people");
  assert.equal(registry.routeSurfaceFor("clients", "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c"), "workspace");
});

test("a lens that names its draws is asked before its page, as the gate asks for a pane: Reviews, Receptionist, People and Campaigns draw their own reads, the Overview draws the Campaigns one for a fact, and the Pipeline lens draws none", () => {
  const ID = "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c";
  assert.deepEqual(registry.routeDrawsFor("reports", "reviews"), ["reports_reviews"]);
  assert.deepEqual(registry.ROUTE_DRAWS["reports/reviews"], ["reports_reviews"], "the one row that says it");
  assert.deepEqual(registry.routeDrawsFor("reports", "receptionist"), ["reports_receptionist"]);
  assert.deepEqual(registry.ROUTE_DRAWS["reports/receptionist"], ["reports_receptionist"], "the one row that says it");
  assert.deepEqual(registry.routeDrawsFor("reports", "people"), ["reports_people"]);
  assert.deepEqual(registry.ROUTE_DRAWS["reports/people"], ["reports_people"], "the one row that says it");
  assert.deepEqual(registry.routeDrawsFor("reports", "campaigns"), ["reports_campaigns"]);
  assert.deepEqual(registry.ROUTE_DRAWS["reports/campaigns"], ["reports_campaigns"], "the one row that says it");
  // The Overview draws the Campaigns lens's read for one fact ("drew the most replies", R6), so the page's own row names it: read as
  // the Overview comes on screen and when it has aged, never for each burst of messages (reports/campaigns-surface.ts).
  for (const lens of [undefined, null])
    assert.deepEqual(registry.routeDrawsFor("reports", lens), ["reports_campaigns"], `the Overview: ${lens}`);
  assert.deepEqual(registry.ROUTE_DRAWS.reports, ["reports_campaigns"], "the one row that says it");
  // The Pipeline lens draws nothing beside the page's own read: its row says so, or it would fall to the page's and read the Overview's.
  assert.deepEqual(registry.routeDrawsFor("reports", "pipeline"), []);
  assert.deepEqual(registry.ROUTE_DRAWS["reports/pipeline"], [], "the one row that says it");
  assert.equal(registry.routeSurfaceFor("reports", "reviews"), "reports");
  assert.equal(registry.routeSurfaceFor("reports", "receptionist"), "reports");
  assert.equal(registry.routeSurfaceFor("reports", "people"), "reports");
  assert.equal(registry.routeSurfaceFor("reports", "campaigns"), "reports");
  assert.deepEqual(registry.routeSurfaces("reports", "reviews"), ["workspace", "reports", "reports_reviews"]);
  assert.deepEqual(registry.routeSurfaces("reports", "receptionist"), ["workspace", "reports", "reports_receptionist"]);
  assert.deepEqual(registry.routeSurfaces("reports", "people"), ["workspace", "reports", "reports_people"]);
  assert.deepEqual(registry.routeSurfaces("reports", "campaigns"), ["workspace", "reports", "reports_campaigns"]);
  assert.deepEqual(registry.routeSurfaces("reports", "pipeline"), ["workspace", "reports"]);
  assert.deepEqual(registry.routeSurfaces("reports"), ["workspace", "reports", "reports_campaigns"]);
  // The days a member picked ride in the param (contracts lensRoute): the lens is what is classified and fed, whatever
  // days it is over, and days alone are the Overview's.
  const DAYS = "2026-09-01~2026-09-20";
  assert.deepEqual(registry.routeDrawsFor("reports", `reviews:${DAYS}`), ["reports_reviews"]);
  assert.deepEqual(registry.routeSurfaces("reports", `reviews:${DAYS}`), ["workspace", "reports", "reports_reviews"]);
  assert.deepEqual(registry.routeDrawsFor("reports", `receptionist:${DAYS}`), ["reports_receptionist"]);
  assert.deepEqual(registry.routeSurfaces("reports", `receptionist:${DAYS}`), [
    "workspace",
    "reports",
    "reports_receptionist",
  ]);
  assert.deepEqual(registry.routeDrawsFor("reports", `people:${DAYS}`), ["reports_people"]);
  assert.deepEqual(registry.routeSurfaces("reports", `people:${DAYS}`), ["workspace", "reports", "reports_people"]);
  assert.deepEqual(registry.routeDrawsFor("reports", `campaigns:${DAYS}`), ["reports_campaigns"]);
  assert.deepEqual(registry.routeSurfaces("reports", `campaigns:${DAYS}`), [
    "workspace",
    "reports",
    "reports_campaigns",
  ]);
  // Days alone are the Overview over them, which draws the Campaigns read for its fact; the Pipeline over days draws none.
  assert.equal(registry.routeSurfaceFor("reports", DAYS), "reports");
  assert.deepEqual(registry.routeDrawsFor("reports", DAYS), ["reports_campaigns"]);
  assert.deepEqual(registry.routeSurfaces("reports", DAYS), ["workspace", "reports", "reports_campaigns"]);
  assert.equal(registry.routeSurfaceFor("reports", `pipeline:${DAYS}`), "reports");
  assert.deepEqual(registry.routeDrawsFor("reports", `pipeline:${DAYS}`), []);
  assert.deepEqual(registry.routeSurfaces("reports", `pipeline:${DAYS}`), ["workspace", "reports"]);
  // What was asked of the page alone is asked as it was: a param that names no row of its own falls to the page's.
  assert.deepEqual(registry.routeDrawsFor("today"), registry.ROUTE_DRAWS.today);
  assert.deepEqual(registry.routeDrawsFor("today", "anything"), registry.ROUTE_DRAWS.today);
  assert.deepEqual(
    registry.routeDrawsFor("clients", ID),
    ["person", "people"],
    "a person's page: its own read, which names them, then People for where they stand in the list",
  );
  // Leads' scope is never a person's page, and draws nothing beside its own surface (the reach-out sheet that read Setup
  // and Settings went with the composer, 18 Oct 2026).
  assert.deepEqual(registry.routeDrawsFor("clients", "leads:s-1:l-1"), [], "and Leads' scope");
  assert.deepEqual(registry.routeDrawsFor("clients"), []);
});

test("a pane that names its draws is asked before its page too: each pane of Settings draws the partner account, and what else it stands on", async () => {
  const { routeOfPath } = await import("@chanlytics/contracts");
  // The pane's own address, the one a person opens, is the route the table names.
  assert.equal(routeOfPath("/w/acme/settings/integrations"), "admin/integrations");
  // Connections: its WhatsApp and phone rows are the channels read's (surfaces/channels/surface.ts; the wiring's second audit,
  // R6), Google's listing its own read, its Email card Setup's mailboxes; it draws none of the settings read, so its own
  // surface is who is looking (the Settings load review, 28 Oct 2026).
  const integrations = ["partner", "channels", "google", "setup"];
  assert.deepEqual(registry.ROUTE_DRAWS["admin/integrations"], integrations, "the row that says it");
  assert.deepEqual(registry.routeDrawsFor("admin", "integrations"), integrations);
  assert.equal(registry.routeSurfaceFor("admin", "integrations"), "workspace", "its own surface is who is looking");
  assert.deepEqual(registry.routeSurfaces("admin", "integrations"), ["workspace", ...integrations]);
  // What reaches the member's own phones (decision 0040), read where the Notifications pane is drawn and nowhere else.
  assert.deepEqual(registry.routeDrawsFor("admin", "notifications"), ["partner", "alerts"]);
  assert.deepEqual(registry.routeSurfaces("admin", "notifications"), ["workspace", "settings", "partner", "alerts"]);
  // A pane drawn from the settings read, and drawing nothing else, draws the partner account beside it (the rail's Partner).
  for (const pane of [undefined, null, "workspace", "profile", "team", "autonomy"])
    assert.deepEqual(registry.routeDrawsFor("admin", pane), ["partner"], String(pane));
  assert.deepEqual(registry.routeSurfaces("admin", "team"), ["workspace", "settings", "partner"]);
  // And a pane drawn from none of it stands on who is looking, with its own read beside it.
  assert.deepEqual(registry.routeSurfaces("admin", "billing"), ["workspace", "partner", "billing"]);
  assert.deepEqual(registry.routeSurfaces("admin", "memory"), ["workspace", "partner", "ask_memory"]);
  assert.deepEqual(registry.routeSurfaces("admin", "files"), ["workspace", "partner", "files"]);
});

test("the flipped pages still resolve exactly as before", () => {
  for (const page of ["today", "inbox", "conversations"]) {
    assert.equal(registry.routeSurfaceFor(page), page);
  }
});

// The frame asks the gate with the pane it is about to render: run in shell/boot/the-frame-draws-what-it-holds.test.mjs.

// A team we could not READ is not a team of four strangers, and a failed team read still uses the real role: drawn in
// empty-failed.test.mjs ("a team that could not be read draws the one FailedRead") and workspace/settings-owner-panes/ ("a
// team read that failed ...").

// The strip offers what the registry says is real, and only that, and a group of one draws none: drawn and pressed in
// shell/boot/the-frame-draws-what-it-holds.test.mjs ("the strip offers what the registry says is real").

test("Setup's old address lands on the first run -- the bell rows the edge wrote still carry it -- and a pane moves alone", () => {
  assert.equal(surfaceRetiredTo("admin", "setup"), "start");
  assert.equal(surfaceRetiredTo("admin", "workspace"), undefined, "the rest of Settings stays where it is");
  assert.equal(surfaceRetiredTo("pipeline", null), "clients", "a retired page still moves as a page");
  assert.equal(
    surfaceRetiredTo("leads", null),
    "clients/leads",
    "for everyone: the demo that kept the Deal board went",
  );
  assert.equal(surfaceStateFor("start", null), "real");
  assert.equal(routeSurfaceFor("start", null), "setup", "the first run waits for Setup's read");
});

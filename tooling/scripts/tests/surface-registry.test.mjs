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
const registry = await import(pathToFileURL(path.join(DASH, "legacy-bridge/surface-registry.ts")).href);
const { SURFACE_STATES, ROUTE_SURFACE, surfaceStateFor, routeSurfaceFor, surfaceRetiredTo } = await import(
  pathToFileURL(path.join(DASH, "legacy-bridge/surface-registry.ts")).href
);

const shell = fs.readFileSync(path.join(DASH, "legacy/pages/app-shell.jsx"), "utf8");

/** Every page key the shell's router matches on. */
function routedPages() {
  const pages = new Set();
  for (const m of shell.matchAll(/page === "([a-z-]+)"/g)) pages.add(m[1]);
  return pages;
}

// Handled by their own honest mechanisms, not the registry:
//   soon      IS the ComingSoon pane
//   (NotFound is the else branch and has no page literal)
const SELF_HONEST = new Set(["soon"]);

test("every route the shell declares is classified", () => {
  const missing = [...routedPages()].filter((p) => !SELF_HONEST.has(p) && !(p in SURFACE_STATES));
  assert.deepEqual(missing, [], "unclassified routes — each would render whatever it renders, gated by nothing");
});

test("the registry classifies nothing the shell does not route", () => {
  // A stale entry misleads the next person about what exists.
  const routed = routedPages();
  // A sub-route is legitimate when its PAGE is routed — the shell reaches
  // admin/workspace through the admin branch, not a literal of its own.
  const stale = Object.keys(SURFACE_STATES).filter((p) => !routed.has(p) && !routed.has(p.split("/")[0]));
  assert.deepEqual(stale, [], "classified but not routed");
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
    "admin/activity",
    "admin/autonomy",
    "admin/billing",
    "admin/integrations",
    "admin/memory",
    "admin/notifications",
    "admin/platform",
    "admin/profile",
    "admin/team",
    "admin/workspace",
    "broadcasts",
    "calendar",
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
  assert.equal(
    routeSurfaceFor("admin", "platform"),
    "settings",
    "and the gate waits for the settings surface, like every pane",
  );
});

test("the shell consults the registry through one interception, not per-route conditionals", () => {
  // The design property: ONE gate derived from the table. Per-route
  // __DEMO_MODE checks are how fifteen branches got missed the first time.
  assert.ok(shell.includes('window.__surfaceState(page, param) === "demo"'), "the interception is gone");
  const adHoc = [...shell.matchAll(/page === "[a-z-]+"[^\n]*__DEMO_MODE/g)];
  assert.deepEqual(
    adHoc.map((m) => m[0]),
    [],
    "a route re-grew its own demo conditional instead of using the registry",
  );
});

test("the shared viewer is gated too", () => {
  // It rendered another company's name over invented numbers, ungated, at a
  // URL anyone could type.
  assert.match(shell, /page === "shared" && !demoGated/, "the shared early return lost its gate");
});

/* ------------------------- sub-surface classification --------------------- */

test("a sub-route is checked BEFORE its page", () => {
  // Settings is one page with six panes behind it, and they are not at the same
  // stage. Classifying only the page forced a choice between hiding a finished
  // pane and shipping five invented ones.
  const { surfaceStateFor } = registry;
  assert.equal(surfaceStateFor("admin", "workspace"), "real");
  assert.equal(surfaceStateFor("admin", "nonsense"), "demo", "an unlisted pane inherits its page");
  // No pane named resolves to the one the shell will actually render —
  // see the default-pane test below.
  assert.equal(surfaceStateFor("admin", null), "real");
});

test("an unclassified pane inherits DEMO, never real", () => {
  // The fallback is what keeps this safe: a pane nobody has classified must not
  // become visible because someone forgot a line.
  // Every pane Settings draws is classified now (billing and memory as honest
  // "not built" panes); a pane nobody has listed still inherits the page.
  for (const pane of ["nonsense", "seats"]) {
    assert.equal(registry.surfaceStateFor("admin", pane), "demo", pane);
  }
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

test("the shell asks with the param, or sub-routes are decoration", () => {
  assert.match(shell, /__surfaceState\(page, param\)/);
});

/* ------------------------- no fabricated colleagues ----------------------- */

test("REGRESSION: an unconfigured workspace is not shown somebody else's business", () => {
  // The same bug as the team card, one row ABOVE it, and reachable by every
  // new customer: migration 00017 provisions a tenant with an EMPTY
  // tenant_config row, so `config.brain` is undefined and the card fell to
  // its mockup branch — Serenity Spa, +1 (415) 555-0100, Lena Park and Jay
  // Rivera, open Mon-Sun 9 to 6. Presented to a real owner as their own
  // business, on a surface classified real, under a live pill.
  //
  // A config the parser refuses lands in the same branch: GET collapses it
  // to {} and the owner sees an invented salon instead of a broken one.
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(
    settings.includes("const unconfigured = connected && !real;"),
    "'no configuration' and 'this is the demo' must not be the same branch",
  );
  assert.ok(
    settings.includes("if (unconfigured) return window.BtCreateCard ? <window.BtCreateCard"),
    "and the card must take the honest one",
  );
  // Task 3.7: the empty state, and the fold that sets a receptionist up from it, are the page's own card. Drawn,
  // not read: business-tab-create.test.mjs, "a workspace with no receptionist is told so, and offered the one act
  // that changes it", reads "This workspace has no receptionist yet" off the drawn card, and "with nothing read to
  // save onto, the act is not offered at all" reads it again where there is no config behind the fold.
});

test("REGRESSION: the team card reads real members, not the seed store", () => {
  // Shipped once and caught by LOOKING at the deployed page: the business card
  // was real while the card beneath it listed four invented colleagues — and
  // put "You" beside one of them, on a real owner's own settings page.
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(settings.includes("const realTeam = window.__TEAM;"), "the card must read the fetched members");
  assert.ok(
    settings.includes("Array.isArray(realTeam)"),
    "and must distinguish 'fetched' from 'could not fetch' — null is not an empty team",
  );
});

test("'You' is decided by the signed-in email, not the mockup's operator", () => {
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(settings.includes("m.isMe !== undefined ? m.isMe : m.id === S.meId"));
});

test("a real workspace is not given an invented seat plan", () => {
  // Seats are a billing concept and billing is not wired. "4 of 5 seats" over
  // real members would be a number nobody chose.
  //
  // Counted over realTeam, not over `team`: the list now also carries the
  // invitations nobody has accepted, and an invitation is not a person. "3
  // people" has to mean three people.
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(settings.includes("Array.isArray(realTeam) ? realTeam.length : S.seatsUsed()"));
  assert.ok(
    !settings.includes("seatsIncluded - seatsUsed") ||
      settings.includes("Array.isArray(realTeam) ? 1 : S.seatsIncluded - seatsUsed"),
    "a real workspace must not be told how many seats a plan it does not have includes",
  );
});

test("REGRESSION: a page opens on the pane it actually renders", () => {
  // The shell renders Settings as tab={param || "workspace"}, so /admin with no
  // pane DOES render the workspace pane — while the gate, asked about "admin",
  // answered demo and replaced it with the Coming Soon card. The sidebar's
  // Settings link is exactly that route, so the finished pane was unreachable
  // by normal navigation: only a hand-typed #/admin/workspace could find it.
  assert.equal(registry.surfaceStateFor("admin", null), "real");
  assert.equal(registry.surfaceStateFor("admin"), "real");
  // A named pane still wins over the default.
  assert.equal(registry.surfaceStateFor("admin", "nonsense"), "demo");
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
// the page says it at the top instead: the standing line names the one gap most worth closing and IS the door to
// the row that closes it (the spec's 4.1). Drawn and pressed, not read -- business-tab-page.test.mjs, "a missing
// voice is named in the band, and the link opens its row".

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

test("a seeded pane is not made to wait for a surface that does not feed it", () => {
  assert.equal(registry.routeSurfaceFor("admin", "nonsense"), undefined);
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
});

test("People resolves to its override for the list; a profile deep link waits only for who is looking", () => {
  // The profile route is clients/<contact id>. The pane is NOT fed by the list's fetch: it reads its own person
  // (people-detail.ts), so waiting for the list only put People's whole read in front of it (0.87 s on a new tab,
  // measured on production 23 Sep 2026). It waits for the workspace, which carries the role its acts depend on.
  assert.equal(registry.routeSurfaceFor("clients"), "people");
  assert.equal(registry.routeSurfaceFor("clients", "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c"), "workspace");
});

test("the flipped pages still resolve exactly as before", () => {
  for (const page of ["today", "inbox", "conversations"]) {
    assert.equal(registry.routeSurfaceFor(page), page);
  }
});

test("the shell asks the gate with the pane it is about to render", () => {
  // A registry that resolves panes is useless if the caller drops the pane.
  assert.ok(shell.includes("const surfaceReady = routeReady(page, param);"));
  assert.ok(shell.includes("routeFailed(page, param)"));
  assert.ok(!shell.includes("routeReady(page)"), "the bare-page call IS the bug");
});

test("REGRESSION: a team we could not READ is not a team of four strangers", () => {
  // window.__TEAM has three states and the card treated two of them as one.
  // undefined = the bridge is not running (standalone mockup, seeds correct).
  // null = the bridge ran and /api/v1/team FAILED — and that fell through to
  // the same seeds, so a network blip put Sarah Chen, Marcus Webb, Lena Park
  // and Jay Rivera on a real owner's settings page as their colleagues.
  // The identical fabrication was caught and fixed once; it survived here.
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(settings.includes("const teamUnavailable = realTeam === null;"), "null is its own state");
  assert.ok(settings.includes("{!teamUnavailable && team.map("), "the seeded roster must not render");
  assert.ok(settings.includes('what="your team"'), "and it must say what happened, through the one FailedRead");
  assert.ok(settings.includes("{!teamUnavailable && (!seatsFull"), "no Invite button over a roster we could not read");
});

test("a failed team read still uses the REAL role, not the seed's opinion", () => {
  // Only the team fetch failed; the settings read gave us the caller's role.
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(settings.includes("teamUnavailable ? (serverRole || S.myRole())"));
  assert.ok(settings.includes("Array.isArray(realTeam) || teamUnavailable"), "owner-ness comes from the server");
});

test("the tab bar offers what the registry says is real, and only that", () => {
  // These two files drifted apart in both directions at once. Lists went real
  // in #123 and kept demoOnly, and because it was the only OTHER People tab the
  // bar fell under its two-tab minimum and disappeared -- a shipped surface
  // reachable in production only from a "New segment" button in a rail. The
  // four Agents tabs went the other way: none flagged, all four "demo", so
  // production offered four routes to the same Coming Soon pane.
  //
  // The registry is the source of truth for both, so this is the rule rather
  // than two more corrections.
  const tabsSrc = fs.readFileSync(path.join(DASH, "legacy/components/surface-tabs.jsx"), "utf8");
  const rows = [...tabsSrc.matchAll(/\{ id: "([a-z-]+)", label: "[^"]+", to: "([a-z-]+)"([^}]*)\}/g)].map(
    ([, id, to, rest]) => ({ id, to, demoOnly: /demoOnly: true/.test(rest) }),
  );
  assert.ok(rows.length >= 12, `parsed ${rows.length} tabs — the shape of the file changed`);

  for (const t of rows) {
    const state = SURFACE_STATES[t.to];
    assert.ok(state, `the ${t.id} tab points at ${t.to}, which the registry does not classify`);
    if (state === "demo") {
      assert.ok(t.demoOnly, `${t.id} → ${t.to} is a demo surface but the tab is offered in production`);
    } else {
      assert.ok(!t.demoOnly, `${t.id} → ${t.to} is real but the tab is hidden outside a demo`);
      // And a real surface reached by another address is not a tab either:
      // leads is the Leads SCOPE of People at clients/leads, and its switch is
      // the rail's own People | Leads. A tab pointing at the retired route
      // would bounce through the redirect to reach a scope the page already
      // draws. Asked of the tabs production offers, which is where that costs
      // something: the Deal board is demo-only AND retired, and the redirect is
      // off in a demo, so that tab still reaches the seeded page it names. A
      // real surface that moved has no page left at the old address at all --
      // and a demo-only tab pointing at one is caught a line above, because a
      // real surface may not be hidden outside a demo.
      assert.ok(
        !registry.SURFACE_RETIRED[t.to],
        `${t.id} → ${t.to} is retired; the bar offers where it went, not where it was`,
      );
    }
  }

  // And the bar's own floor: a group whose real tabs number fewer than two
  // renders nothing, so a group with exactly one real tab is a bar nobody sees.
  assert.ok(tabsSrc.includes("if (tabs.length < 2) return null;"), "the two-tab minimum still holds");
});

test("Setup's old address lands on the first run -- the bell rows the edge wrote still carry it -- and a pane moves alone", () => {
  assert.equal(surfaceRetiredTo("admin", "setup"), "start");
  assert.equal(surfaceRetiredTo("admin", "workspace"), undefined, "the rest of Settings stays where it is");
  assert.equal(surfaceRetiredTo("pipeline", null), "clients", "a retired page still moves as a page");
  assert.equal(surfaceStateFor("start", null), "real");
  assert.equal(routeSurfaceFor("start", null), "setup", "the first run waits for Setup's read");
});

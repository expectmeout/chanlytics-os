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
const registry = await import(
  pathToFileURL(path.join(DASH, "legacy-bridge/surface-registry.ts")).href
);
const { SURFACE_STATES, ROUTE_SURFACE } = await import(
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
  const missing = [...routedPages()].filter(
    (p) => !SELF_HONEST.has(p) && !(p in SURFACE_STATES),
  );
  assert.deepEqual(
    missing,
    [],
    "unclassified routes — each would render whatever it renders, gated by nothing",
  );
});

test("the registry classifies nothing the shell does not route", () => {
  // A stale entry misleads the next person about what exists.
  const routed = routedPages();
  // A sub-route is legitimate when its PAGE is routed — the shell reaches
  // admin/workspace through the admin branch, not a literal of its own.
  const stale = Object.keys(SURFACE_STATES).filter(
    (p) => !routed.has(p) && !routed.has(p.split("/")[0]),
  );
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
  assert.deepEqual(real, ["admin/autonomy", "admin/integrations", "admin/notifications", "admin/workspace", "clients", "conversations", "inbox", "today"]);
});

test("the shell consults the registry through one interception, not per-route conditionals", () => {
  // The design property: ONE gate derived from the table. Per-route
  // __DEMO_MODE checks are how fifteen branches got missed the first time.
  assert.ok(shell.includes("window.__surfaceState(page, param) === \"demo\""), "the interception is gone");
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
  assert.equal(surfaceStateFor("admin", "billing"), "demo", "an unlisted pane inherits its page");
  // No pane named resolves to the one the shell will actually render —
  // see the default-pane test below.
  assert.equal(surfaceStateFor("admin", null), "real");
});

test("an unclassified pane inherits DEMO, never real", () => {
  // The fallback is what keeps this safe: a pane nobody has classified must not
  // become visible because someone forgot a line.
  // notifications and autonomy have since been classified real; billing,
  // integrations and memory are still seeds.
  for (const pane of ["memory", "billing", "nonsense"]) {
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
  assert.ok(settings.includes("{unconfigured ? ("), "and the card must take the honest one");
  assert.ok(
    settings.includes("This workspace has no receptionist yet"),
    "an empty workspace says so",
  );
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
  assert.ok(settings.includes('Array.isArray(realTeam) ? realTeam.length : S.seatsUsed()'));
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
  assert.equal(registry.surfaceStateFor("admin", "billing"), "demo");
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

test("the empty profile leads with a button, not a footnote", () => {
  // Every workspace starts here. A faint Edit link in a card header is findable
  // by someone who already knows the form exists.
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(settings.includes("Add your business details"));
  assert.ok(settings.includes("set-empty"));
});


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
  assert.equal(registry.routeSurfaceFor("admin", "billing"), undefined);
  assert.equal(registry.routeSurfaceFor("leads"), undefined);
});

test("People resolves to its override for the list AND for a profile deep link", () => {
  // The profile route is clients/<contact id>; the pane is fed by the same
  // fetch as the list, so the gate waits on the same surface for both.
  assert.equal(registry.routeSurfaceFor("clients"), "people");
  assert.equal(registry.routeSurfaceFor("clients", "3f8b2c1a-4d5e-4f6a-8b9c-0d1e2f3a4b5c"), "people");
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
  assert.ok(settings.includes("Your team couldn"), "and it must say what happened");
  assert.ok(
    settings.includes("!teamUnavailable && canManage"),
    "no Invite button over a roster we could not read",
  );
});

test("a failed team read still uses the REAL role, not the seed's opinion", () => {
  // Only the team fetch failed; the settings read gave us the caller's role.
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(settings.includes("teamUnavailable ? (serverRole || S.myRole())"));
  assert.ok(settings.includes("Array.isArray(realTeam) || teamUnavailable"), "owner-ness comes from the server");
});

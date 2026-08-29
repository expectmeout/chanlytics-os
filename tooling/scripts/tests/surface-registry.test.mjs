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

test("the real set is exactly the three converted surfaces", () => {
  // Pinned by value, deliberately: flipping a surface to real is a decision
  // that should show up in THIS diff, not slide in via a helper.
  const real = Object.entries(SURFACE_STATES)
    .filter(([, v]) => v === "real")
    .map(([k]) => k)
    .sort();
  assert.deepEqual(real, ["admin/workspace", "conversations", "inbox", "today"]);
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
  assert.equal(surfaceStateFor("admin", null), "demo");
  assert.equal(surfaceStateFor("admin"), "demo");
});

test("an unclassified pane inherits DEMO, never real", () => {
  // The fallback is what keeps this safe: a pane nobody has classified must not
  // become visible because someone forgot a line.
  for (const pane of ["integrations", "memory", "notifications", "nonsense"]) {
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
  const settings = fs.readFileSync(path.join(DASH, "legacy/pages/settings.jsx"), "utf8");
  assert.ok(settings.includes('Array.isArray(realTeam) ? team.length : S.seatsUsed()'));
});

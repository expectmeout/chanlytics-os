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
  const stale = Object.keys(SURFACE_STATES).filter((p) => !routed.has(p));
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
  assert.deepEqual(real, ["conversations", "inbox", "today"]);
});

test("the shell consults the registry through one interception, not per-route conditionals", () => {
  // The design property: ONE gate derived from the table. Per-route
  // __DEMO_MODE checks are how fifteen branches got missed the first time.
  assert.match(shell, /window\.__surfaceState\(page\) === "demo"/, "the interception is gone");
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

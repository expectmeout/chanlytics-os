/**
 * The four seam invariants that have each already shipped broken once. Nothing
 * guarded them, so each was found by looking at the running app rather than by
 * CI — which is the entire argument for this file.
 *
 * They split into two kinds, and the second kind is worth being explicit about.
 *
 * BEHAVIOURAL (1) drives the real state machine, so it fails for the right
 * reason: revert surface-status.ts and the assertion breaks.
 *
 * STRUCTURAL (2-4) are ORDERING properties — "this runs before React renders",
 * "this is derived during render, not set by an effect". Their failure mode is
 * one wrong frame on a cold boot, which is invisible to a unit test and needs
 * jsdom + a React renderer to reproduce honestly. Rather than pull in that
 * dependency surface to half-simulate it, they assert on source structure, the
 * way control-plane.integration.test.mjs already reads a literal out of a .ts
 * file. That is a weaker guarantee and the tradeoff is deliberate: these tests
 * catch the regression that actually happened (someone moves the call back
 * into a useEffect, or reintroduces effect-set loading state) and would miss a
 * novel way of breaking the same ordering. A structural test that names its
 * limits beats an absent one; it does not beat a real one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getSurfaceStatuses,
  isSurfaceFailed,
  isSurfaceReady,
  markHydrated,
  setStatus,
} from "../../../apps/dashboard/src/legacy-bridge/surface-status.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.join(here, "../../../apps/dashboard/src/legacy-bridge");
const src = (p) => fs.readFileSync(path.join(BRIDGE, p), "utf8");

/* ------------------------- 1. ready is not settled ------------------------ */
// Module state is shared across tests in one file, so each uses its own key
// rather than a reset hatch that would exist only for tests.

test("a failed boot leaves the surface NOT ready", () => {
  setStatus("t-failed", "seeded");
  assert.equal(
    isSurfaceReady("t-failed"),
    false,
    "a failed fetch opened the route gate — the surface will paint the mockup's seeds as the customer's data",
  );
  assert.equal(isSurfaceFailed("t-failed"), true, "the shell needs this to show the honest unavailable pane");
});

test("a real payload opens the gate and clears the failure", () => {
  setStatus("t-recovered", "seeded");
  setStatus("t-recovered", "live");
  assert.equal(isSurfaceReady("t-recovered"), true);
  assert.equal(isSurfaceFailed("t-recovered"), false, "a recovered surface must stop showing the failure pane");
});

test("a surface that recovered then failed again stays ready — it still holds real data", () => {
  // This is the "degraded" path: real but stale beats reverting to seeds.
  setStatus("t-stale", "live");
  setStatus("t-stale", "degraded");
  assert.equal(isSurfaceReady("t-stale"), true);
  assert.equal(isSurfaceFailed("t-stale"), false);
  assert.equal(getSurfaceStatuses().get("t-stale"), "degraded");
});

test("cache hydration opens the gate without a fetch", () => {
  // The refresh-with-no-flicker path: data from the previous visit is real
  // data, so the first frame may paint it.
  markHydrated(["t-hydrated"]);
  assert.equal(isSurfaceReady("t-hydrated"), true);
  assert.equal(isSurfaceFailed("t-hydrated"), false);
});

test("an unknown surface is neither ready nor failed", () => {
  assert.equal(isSurfaceReady("t-never-seen"), false);
  assert.equal(isSurfaceFailed("t-never-seen"), false, "never-attempted must not render as failed");
});

/* --------------- 2. the gate exists before any consumer renders -------------- */

test("the route gate is installed at module scope, not in an effect", () => {
  const s = src("LegacyApp.tsx");
  const call = s.indexOf("\ninstallRouteGate();");
  assert.notEqual(call, -1, "installRouteGate() must be called at top level");

  // app-shell.jsx computes routeLoading's INITIAL value during its first
  // render, and it is a CHILD of this component — children render before
  // parent effects run. Installing the gate in a useEffect left it undefined
  // at the only moment it mattered: routeReady() fell back to true and a cold
  // boot painted the seeded hero for a frame.
  const firstEffect = s.indexOf("useEffect(");
  assert.ok(
    firstEffect === -1 || call < firstEffect,
    "installRouteGate() moved below the effects — if it is now inside one, the first frame is ungated again",
  );
});

test("the cache is hydrated at module scope, before React renders", () => {
  const s = src("LegacyApp.tsx");
  const hydrate = s.indexOf("markHydrated(hydrateSurfaceCache())");
  assert.notEqual(hydrate, -1, "boot must restore the cache");
  assert.ok(
    hydrate < s.indexOf("export default function LegacyApp"),
    "hydration moved inside the component — a refresh will show a frame of mockup data before correcting itself",
  );
});

/* ------------- 3. loading is derived during render, not set later ------------ */

test("the shell derives route loading during render", () => {
  const shell = fs.readFileSync(
    path.join(here, "../../../apps/dashboard/src/legacy/pages/app-shell.jsx"),
    "utf8",
  );
  for (const name of ["surfaceReady", "surfaceUnavailable", "routeLoading"]) {
    assert.match(
      shell,
      new RegExp(`\\bconst ${name} =`),
      `${name} must be a const derived every render — as effect-set state it committed the PREVIOUS route's value, so a navigation painted one frame of the old page's answer`,
    );
    assert.doesNotMatch(
      shell,
      new RegExp(`useShellState\\([^)]*\\)[^\\n]*${name}|\\[${name},`),
      `${name} became state again`,
    );
  }
});

/* ---------------- 4. one seam owner: no bypassing the runner --------------- */

test("nothing outside the runner calls activateOverride directly", () => {
  // The verb courier used to, which skipped persist and setStatus and
  // swallowed the 401 — so after a snooze the cache kept the pre-verb
  // snapshot and the next reload painted the thread back into "Needs you",
  // under a pill still claiming "live".
  const offenders = fs
    .readdirSync(BRIDGE)
    .filter((f) => /\.tsx?$/.test(f) && f !== "surface-data.ts" && f !== "surface-runner.ts")
    .filter((f) => src(f).includes("activateOverride("));
  assert.deepEqual(offenders, [], "these must go through refreshSurfaces() so status and cache stay truthful");
});

/* ------- three states the operator's screen could show falsely ----------- */
{
  const { readCode } = await import("./_source.mjs");
  const runner = readCode("apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const seam = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  const verbs = readCode("apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  const wrapper = readCode("apps/dashboard/src/server/with-route.ts");

  test("a failed boot over CACHED real data is degraded, not seeded", () => {
    // The cache restores real rows before React mounts. If both boot attempts
    // then fail, recording "seeded" is the one thing that is not true:
    // yesterday's real conversations are on screen under a status meaning "no
    // real data", so the pill shows neither live nor stale. refresh() has
    // always used this rule; boot did not.
    const fn = runner.slice(runner.indexOf("const boot = async"));
    const body = fn.slice(0, fn.indexOf("\n  };"));
    assert.match(body, /isSurfaceReady\(o\.key\)/, "boot must ask whether real data is already showing");
    assert.match(body, /"degraded"/);
  });

  test("a successful write forgets every in-flight read", () => {
    // The collapser shares a pending request for two seconds. A verb commits
    // and then refreshes; that refresh joins a request issued BEFORE the
    // commit and repaints the thread exactly as it was, under a "live" pill.
    assert.match(seam, /export function invalidateInFlight/);
    // The client does this now, once, for every courier (typed-client.test.mjs
    // runs it): a courier that owns no fetch cannot forget to.
    assert.ok(!verbs.includes("fetch("), "the courier owns no fetch; the client forgets after every write");
  });

  test("an auth outage is a 503, not a sign-out", () => {
    // getUser() returns no user for BOTH a missing session and a network
    // failure. Reporting 401 for the second made the client wipe the surface
    // cache — real customer transcripts — and hard-redirect to /login, so a
    // brief Supabase blip logged every operator out mid-sentence.
    assert.match(wrapper, /upstream_auth/);
    assert.match(wrapper, /status: 503/);
    // ONE predicate, shared with the middleware — which used to answer 401
    // for API paths before the wrapper ever ran.
    assert.match(wrapper, /isRetryableAuthError\(authErr\)/);
    const predicate = readCode("apps/dashboard/src/server/auth-errors.ts");
    assert.match(predicate, /AuthRetryableFetchError|err\.status >= 500/);
    const middleware = readCode("apps/dashboard/middleware.ts");
    assert.match(middleware, /isRetryableAuthError\(authErr\)/, "the gate must not answer 401 for an outage");
    assert.match(middleware, /status: 503/);
  });
}

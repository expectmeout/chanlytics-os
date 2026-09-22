/**
 * The local harness for the signed-in specs (tooling/scripts/e2e-harness), without a browser.
 *
 * The harness exists so a spec that needs a session can be run and mutation-tested on this machine instead of only
 * in the nightly. Three things have to hold for a run of it to mean anything, and each is a test here:
 *
 *   - its `nightly` record is the SEEDED workspace's, derived from tooling/scripts/e2e-workspace.mjs rather than
 *     copied. A copy is right on the day it is written and silently wrong the day the seed changes -- and a harness
 *     that shows a record the nightly does not hold is a harness that passes specs the nightly then fails;
 *   - the page's fixture publishes the tab's globals through the CONTRACTS functions the bridge publishes, not
 *     stand-ins of its own, or the page under test is drawing someone else's sentences;
 *   - the server answers what the spec actually asks for: the two Supabase calls `signIn()` makes, and the settings
 *     read, from the record.
 *
 * No browser and no socket: the fixture is bundled and run over a stub window, and the server's answers come from
 * the function that composes them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { hoursLines, resolveFacts, MAX_CLOSURES, PROFILE_LIMITS } from "@chanlytics/contracts";
import { NAME, TIMEZONE, workspaceChannel, workspaceConfig } from "../e2e-workspace.mjs";
import { scenario, SCENARIOS, WORKSPACE } from "../e2e-harness/scenarios.mjs";
import { buildFixture } from "../e2e-harness/fixture.mjs";
import { answer } from "../e2e-harness/server.mjs";

const NOW = Date.parse("2026-09-22T09:00:00Z");

test("the nightly record is the seeded workspace's own, derived and not copied", () => {
  const seeded = workspaceConfig();
  const nightly = scenario("nightly", NOW);

  assert.deepEqual(nightly.brain, seeded.brain, "the harness shows a brain the seed does not write");
  assert.equal(nightly.zone, TIMEZONE);
  assert.deepEqual(nightly.known.workspace, { name: NAME, timezone: TIMEZONE });
  // The line the seed provisions, as resolveFacts reads a tenant_channels row.
  const line = workspaceChannel();
  assert.deepEqual(nightly.known.channels, [{ kind: line.kind, number_e164: line.number_e164, status: line.status }]);
  assert.equal(nightly.calendar, null, "the seeded workspace has no calendar for the hourly sweep to fetch");
  // What makes this the record the committed spec must pass on: no profile at all, so every list is empty.
  assert.equal(nightly.brain.profile, undefined);
});

test("the salon record reaches the branches the nightly's data cannot: a list at its cap, and one short of it", () => {
  const salon = scenario("salon", NOW);
  const p = salon.brain.profile;
  assert.equal(p.closures.length, MAX_CLOSURES, "the closures fold must open with no Add to press");
  assert.equal(p.languages.length, PROFILE_LIMITS.languages - 1, "one Add must fill the languages list");
  assert.ok(p.services.length > 1 && Object.keys(p.hours).length === 7);
  assert.deepEqual(SCENARIOS, ["nightly", "salon"]);
});

/**
 * Values that came out of the fixture's own realm, as plain data. `vm` gives the bundle its own intrinsics, so an
 * array it built is not an instance of THIS realm's Array and a strict deep comparison of the two fails on their
 * prototypes while printing two identical lists.
 */
const plain = (v) => JSON.parse(JSON.stringify(v));

/** The fixture, run over a window that is only what it touches. */
async function publishedGlobals(name) {
  const js = await buildFixture(scenario(name, NOW));
  const window = {};
  const document = {
    head: { appendChild() {} },
    documentElement: { classList: { add() {} } },
    createElement: () => ({ textContent: "" }),
    addEventListener() {},
  };
  window.window = window;
  window.document = document;
  vm.runInNewContext(js, vm.createContext({ window, document }));
  return window;
}

test("the page's fixture publishes the tab's globals through the same contracts functions the bridge does", async () => {
  const w = await publishedGlobals("salon");
  const S = scenario("salon", NOW);

  // installBusinessTab's own: the week's lines, from contracts, not a second spelling of "which days share hours".
  assert.equal(typeof w.__hoursLines, "function");
  assert.deepEqual(plain(w.__hoursLines(S.brain.profile.hours)), hoursLines(S.brain.profile.hours));
  assert.equal(w.__configLimits.maxClosures, MAX_CLOSURES);

  // The settings read's facts, resolved from the record against what the platform knows (surface-data.ts's apply).
  assert.deepEqual(plain(w.__FACTS.facts), plain(resolveFacts(S.brain, S.known)));
  assert.deepEqual(plain(w.__SETTINGS.config.brain), S.brain);
  assert.equal(w.__SETTINGS.version, S.version);
  assert.equal(w.__ACTIVE_WORKSPACE, WORKSPACE.id);

  // Nothing the fixture publishes can write: a spec that pressed a Save is refused on the page.
  assert.equal((await w.__saveSettings()).ok, false);
  assert.equal((await w.__workspace.setTimezone("America/Chicago")).ok, false);
});

test("the server answers the two auth calls signIn() makes, and the settings read from the record", () => {
  const record = scenario("nightly", NOW);
  const scoped = new URLSearchParams({ workspace: WORKSPACE.id });

  const link = answer("/auth/v1/admin/generate_link", new URLSearchParams(), record);
  assert.equal(link.status, 200);
  assert.ok(link.body.hashed_token, "generate_link answers with the token e2e/session.ts exchanges");

  const verified = answer("/auth/v1/verify", new URLSearchParams(), record);
  assert.equal(verified.status, 200);
  assert.ok(verified.body.access_token && verified.body.refresh_token);
  assert.equal(verified.body.user.email, "e2e-owner@example.com");
  assert.ok(verified.body.expires_at > Math.floor(Date.now() / 1000), "a cookie the browser would keep");

  const settings = answer("/api/v1/settings", scoped, record);
  assert.equal(settings.status, 200);
  assert.deepEqual(settings.body.data.config, { brain: record.brain });
  assert.deepEqual([settings.body.data.version, settings.body.data.role], [record.version, "owner"]);

  // A read that does not name its workspace is refused here as memberContext refuses it in production.
  assert.equal(answer("/api/v1/settings", new URLSearchParams(), record).status, 400);
  assert.equal(answer("/api/v1/nothing-here", scoped, record).status, 404);
  // Anything that is not a JSON route is the mockup's to serve.
  assert.equal(answer("/Chanlytics.html", new URLSearchParams(), record), null);
});

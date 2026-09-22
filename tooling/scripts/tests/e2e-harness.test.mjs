/**
 * The local harness for the signed-in specs (tooling/scripts/e2e-harness), without a browser.
 *
 * The harness exists so a spec that needs a session can be run and mutation-tested on this machine instead of only
 * in the nightly. Four things have to hold for a run of it to mean anything, and each is a test here:
 *
 *   - its `nightly` record is the SEEDED workspace's, derived from tooling/scripts/e2e-workspace.mjs rather than
 *     copied. A copy is right on the day it is written and silently wrong the day the seed changes -- and a harness
 *     that shows a record the nightly does not hold is a harness that passes specs the nightly then fails;
 *   - the page's fixture publishes the tab's globals through the CONTRACTS functions the bridge publishes, not
 *     stand-ins of its own, and publishes EVERY global the pages under test read -- one published under the wrong
 *     name falls through to the mockup's ported copy in data/bridge-stubs.jsx, and the spec then passes on the
 *     mockup's own words;
 *   - the server answers what the spec actually asks for -- the two Supabase calls `signIn()` makes, and the
 *     settings read -- and refuses everything else, so nothing on it can look like a write that landed;
 *   - the document it serves runs the fixture's install, not the dist-built copy that comes after it.
 *
 * No browser and no socket: the fixture and the served scripts are built and RUN over a stub window, and the
 * server's answers come from the function that composes them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { hoursLines, resolveFacts, MAX_CLOSURES, PROFILE_LIMITS } from "@chanlytics/contracts";
import { NAME, TIMEZONE, workspaceChannel, workspaceConfig } from "../e2e-workspace.mjs";
import { scenario, SCENARIOS, WORKSPACE } from "../e2e-harness/scenarios.mjs";
import { buildFixture } from "../e2e-harness/fixture.mjs";
import { answer, BUSINESS_TAB_SCRIPT, documentWithFixture } from "../e2e-harness/server.mjs";

const NOW = Date.parse("2026-09-22T09:00:00Z");
const LEGACY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/dashboard/src/legacy");

test("the nightly record is the seeded workspace's own, derived and not copied", () => {
  const seeded = workspaceConfig();
  const nightly = scenario("nightly", NOW);

  // The WHOLE config the seed writes, notifications and all: what the read hands over is what the row holds.
  assert.deepEqual(nightly.config, seeded, "the harness shows a config the seed does not write");
  assert.equal(nightly.zone, TIMEZONE);
  assert.deepEqual(nightly.known.workspace, { name: NAME, timezone: TIMEZONE });
  // The line the seed provisions, as resolveFacts reads a tenant_channels row.
  const line = workspaceChannel();
  assert.deepEqual(nightly.known.channels, [{ kind: line.kind, number_e164: line.number_e164, status: line.status }]);
  assert.equal(nightly.config.calendar, undefined, "the seeded workspace has no calendar for the hourly sweep");
  // What makes this the record the committed spec must pass on: no profile at all, so every list is empty.
  assert.equal(nightly.config.brain.profile, undefined);
});

test("the salon record reaches the branches the nightly's data cannot: a list at its cap, and one short of it", () => {
  const p = scenario("salon", NOW).config.brain.profile;
  assert.equal(p.closures.length, MAX_CLOSURES, "the closures fold must open with no Add to press");
  assert.equal(p.languages.length, PROFILE_LIMITS.languages - 1, "one Add must fill the languages list");
  assert.equal(new Set(p.languages).size, p.languages.length, "each language once, whatever the cap is");
  assert.ok(p.services.length > 1 && Object.keys(p.hours).length === 7);
  assert.deepEqual(SCENARIOS, ["nightly", "salon"]);
});

/**
 * Values that came out of the fixture's own realm, as plain data. `vm` gives the bundle its own intrinsics, so an
 * array it built is not an instance of THIS realm's Array and a strict deep comparison of the two fails on their
 * prototypes while printing two identical lists.
 */
const plain = (v) => JSON.parse(JSON.stringify(v));

/** A window that is only what the fixture touches. */
const stubWindow = () => {
  const window = {};
  window.window = window;
  window.document = {
    head: { appendChild() {} },
    documentElement: { classList: { add() {} } },
    createElement: () => ({ textContent: "" }),
    addEventListener() {},
  };
  return window;
};

/** The fixture, built for a record and run. */
async function publishedGlobals(name) {
  const js = await buildFixture(scenario(name, NOW));
  const window = stubWindow();
  vm.runInNewContext(js, vm.createContext({ window, document: window.document }));
  return window;
}

test("the page's fixture publishes the tab's globals through the same contracts functions the bridge does", async () => {
  const w = await publishedGlobals("salon");
  const brain = scenario("salon", NOW).config.brain;
  const S = scenario("salon", NOW);

  // installBusinessTab's own: the week's lines, from contracts, not a second spelling of "which days share hours".
  assert.equal(typeof w.__hoursLines, "function");
  assert.deepEqual(plain(w.__hoursLines(brain.profile.hours)), hoursLines(brain.profile.hours));
  assert.equal(w.__configLimits.maxClosures, MAX_CLOSURES);

  // The settings read's facts, resolved from the record against what the platform knows (surface-data.ts's apply).
  assert.deepEqual(plain(w.__FACTS.facts), plain(resolveFacts(brain, S.known)));
  assert.deepEqual(plain(w.__SETTINGS.config), S.config);
  assert.equal(w.__SETTINGS.version, S.version);
  assert.equal(w.__ACTIVE_WORKSPACE, WORKSPACE.id);

  // Nothing the fixture publishes can write: a spec that pressed a Save is refused on the page.
  assert.equal((await w.__saveSettings()).ok, false);
  assert.equal((await w.__workspace.setTimezone("America/Chicago")).ok, false);
});

/* ------------------------------- what the pages read ------------------------------- */

/** Every `window.__x` the pages under test read. */
function globalsRead(files) {
  const names = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(path.join(LEGACY, "pages", f), "utf8").matchAll(/window\.(__[A-Za-z0-9_]+)/g)) {
      names.add(m[1]);
    }
  }
  return names;
}

/**
 * Every `window.__x` a legacy file PUBLISHES, except data/bridge-stubs.jsx -- which is the mockup's stand-in for the
 * bridge and writes only what is missing, so a global left to it is exactly the defect this test is for.
 */
function globalsInstalledByThePages() {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(entry.name) && !p.endsWith(path.join("data", "bridge-stubs.jsx"))) {
        const text = fs.readFileSync(p, "utf8");
        for (const m of text.matchAll(/window\.(__[A-Za-z0-9_]+)\s*=[^=]/g)) names.add(m[1]);
        for (const m of text.matchAll(/Object\.assign\(\s*window\s*,\s*\{([\s\S]*?)\}\s*\)/g)) {
          for (const k of m[1].matchAll(/(__[A-Za-z0-9_]+)\s*[,:}]/g)) names.add(k[1]);
        }
      }
    }
  };
  walk(LEGACY);
  return names;
}

/**
 * What the fixture deliberately leaves alone, and why. Every one of these is read by settings.jsx for a pane the
 * Business record is not, or by the shell around it; the page guards each. Anything else a page reads has to be
 * published, or the mockup's copy answers for it.
 */
const NOT_PUBLISHED = new Map([
  ["__CHANNELS", "defining it at all flips settings.jsx to PaneIntegrationsReal, and its shape is toChannelVM's"],
  ["__CALENDAR", "the Calendar pane's surface; the Business record's calendar row reads the config"],
  ["__calendar", "the Calendar pane's verbs"],
  ["__setup", "the Setup pane's verbs"],
  ["__TEAM", "the Team card's surface"],
  ["__TEAM_INVITES", "the Team card's invitations"],
  ["__teamInvite", "the Team card's verbs"],
  ["__teamRemove", "the Team card's verbs"],
  ["__teamSetRole", "the Team card's verbs"],
  ["__inviteState", "the Team card's own state"],
  ["__activity", "the Activity log pane's surface"],
  ["__platform", "the back office, which an owner never sees"],
  ["__setPolicy", "the Autonomy pane's verb"],
  ["__composedPrompt", "the old Settings card's preview; the Business tab's comes with the settings read"],
  ["__shell", "the chrome's own, published by the app shell"],
  ["__href", "the chrome's own"],
  ["__me", "the chrome's own; the fixture publishes __ME, which the record reads"],
  ["__surfaceFailed", "the surface runner's, for a read that failed; nothing here fails a read"],
]);

test("the fixture publishes every global the Business record and Settings read, or says why not", async () => {
  // Every file of the record: its cards (business-tab-*.jsx) and What it can do, which is business-can.jsx.
  const pages = fs.readdirSync(path.join(LEGACY, "pages")).filter((f) => /^business-(tab.*|can)\.jsx$/.test(f));
  assert.ok(pages.length >= 6, `the Business pages moved: ${pages.join(", ")}`);
  assert.ok(pages.includes("business-can.jsx"), "What it can do is one of them");
  const read = globalsRead([...pages, "settings.jsx"]);
  assert.ok(read.has("__handoffE164"), "the transfer row's check is one of the globals this test is about");

  const published = new Set(Object.keys(await publishedGlobals("nightly")));
  const installed = globalsInstalledByThePages();

  const missing = [...read].filter((n) => !published.has(n) && !installed.has(n) && !NOT_PUBLISHED.has(n)).sort();
  assert.deepEqual(missing, [], `neither published nor accounted for: ${missing.join(", ")}`);

  // The list only shrinks: a name published AND excused is an excuse nobody will delete.
  const stale = [...NOT_PUBLISHED.keys()].filter((n) => published.has(n) || !read.has(n)).sort();
  assert.deepEqual(stale, [], `no longer true of: ${stale.join(", ")}`);
});

test("the document runs the fixture's install of the tab's helpers, not the dist-built copy after it", () => {
  const html = documentWithFixture();
  const at = (needle) => html.indexOf(needle);
  assert.ok(at("/_hx/fixture.js") > 0, "the fixture is in the document the harness serves");
  assert.ok(at("/_hx/fixture.js") < at("data/bridge-stubs.jsx"), "the fixture runs before the mockup's stubs");
  assert.ok(at("/_hx/fixture.js") < at("data/business-tab.js"), "and before the tab's helpers are loaded");

  // And what the harness answers for that script installs nothing, so the fixture's source-built copy stands.
  const window = { __businessTab: "from source", __hoursLines: "from source", __configLimits: "from source" };
  new vm.Script(BUSINESS_TAB_SCRIPT).runInNewContext({ window });
  assert.deepEqual(window, {
    __businessTab: "from source",
    __hoursLines: "from source",
    __configLimits: "from source",
  });
});

/* ------------------------------- what the server answers ------------------------------- */

test("the server answers the two auth calls signIn() makes, and the settings read from the record", () => {
  const record = scenario("nightly", NOW);
  const scoped = new URLSearchParams({ workspace: WORKSPACE.id });

  const link = answer("POST", "/auth/v1/admin/generate_link", new URLSearchParams(), record);
  assert.equal(link.status, 200);
  assert.ok(link.body.hashed_token, "generate_link answers with the token e2e/session.ts exchanges");

  const verified = answer("POST", "/auth/v1/verify", new URLSearchParams(), record);
  assert.equal(verified.status, 200);
  assert.ok(verified.body.access_token && verified.body.refresh_token);
  assert.equal(verified.body.user.email, "e2e-owner@example.com");
  assert.ok(verified.body.expires_at > Math.floor(Date.now() / 1000), "a cookie the browser would keep");

  const settings = answer("GET", "/api/v1/settings", scoped, record);
  assert.equal(settings.status, 200);
  assert.equal(settings.body.ok, true, "the app's own envelope");
  assert.deepEqual(settings.body.data.config, record.config);
  assert.deepEqual([settings.body.data.version, settings.body.data.role], [record.version, "owner"]);

  // A read that does not name its workspace is refused here as memberContext refuses it in production.
  assert.equal(answer("GET", "/api/v1/settings", new URLSearchParams(), record).status, 400);
  assert.equal(answer("GET", "/api/v1/nothing-here", scoped, record).status, 404);
  // Anything that is not a JSON route is the mockup's to serve.
  assert.equal(answer("GET", "/Chanlytics.html", new URLSearchParams(), record), null);
});

test("the harness never writes: every method but a read is refused, whatever it asks for", () => {
  const record = scenario("nightly", NOW);
  const scoped = new URLSearchParams({ workspace: WORKSPACE.id });

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const route of ["/api/v1/settings", "/api/v1/workspaces", "/Chanlytics.html"]) {
      const refusal = answer(method, route, scoped, record);
      assert.equal(refusal.status, 405, `${method} ${route} was not refused`);
      assert.equal(refusal.body.ok, false);
      assert.match(refusal.body.error.message, /never writes/);
      assert.equal(refusal.body.data, undefined, "nothing that could read as a write that landed");
    }
  }
  // The two auth calls are POSTs, and are not reads.
  assert.equal(answer("GET", "/auth/v1/verify", new URLSearchParams(), record).status, 405);
  assert.equal(answer("HEAD", "/api/v1/settings", scoped, record).status, 200);
});

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
import {
  dealsAreOn,
  hoursLines,
  pipelineOf,
  resolveFacts,
  toPersonRowVM,
  toPersonVM,
  MAX_CLOSURES,
  PROFILE_LIMITS,
} from "@chanlytics/contracts";
import { NAME, TIMEZONE, workspaceChannel, workspaceConfig } from "../e2e-workspace.mjs";
import { scenario, SCENARIOS, WORKSPACE } from "../e2e-harness/scenarios.mjs";
import { buildFixture } from "../e2e-harness/fixture.mjs";
import { answer, appRules, BUSINESS_TAB_SCRIPT, documentWithFixture } from "../e2e-harness/server.mjs";

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
  assert.deepEqual(SCENARIOS, ["nightly", "salon", "pipeline"]);
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

  // What the receptionist is told, which the prompt sheet cuts: the bridge's own reading of the settings read, run over
  // the fixture's window, answers exactly what the fixture's written-out copy does, on both channels.
  const { composedPrompt } = await import("../../../apps/dashboard/src/legacy-bridge/inbox-verbs.ts");
  const was = globalThis.window;
  globalThis.window = w;
  try {
    for (const channel of ["whatsapp", "voice"]) {
      assert.deepEqual(plain(w.__composedPrompt(channel)), plain(composedPrompt(channel)), channel);
      assert.ok(w.__composedPrompt(channel).text.length > 0, `${channel}: there is a prompt to read`);
    }
  } finally {
    globalThis.window = was;
  }

  // Nothing the fixture publishes can write: a spec that pressed a Save is refused on the page.
  assert.equal((await w.__saveSettings()).ok, false);
  assert.equal((await w.__workspace.setTimezone("America/Chicago")).ok, false);
});

test("the messages the fixture publishes are the scenario's own, and the nightly has none", async () => {
  // The fixture published one approved booking_link template and templates.approved = 1 for EVERY scenario,
  // hand-written beside the payload it derives everything else in. Neither the seed (e2e-workspace.mjs) nor the
  // scenarios write a template row, so the nightly workspace was shown an approved message it does not have -- and
  // an approved booking-link template is exactly what decides whether a call can send the link at all
  // (contracts bookingTemplate, and the openings row's ", then the link" clause).
  for (const [name, approved] of [
    ["nightly", []],
    ["salon", ["booking_link"]],
  ]) {
    const w = await publishedGlobals(name);
    assert.deepEqual(
      plain(w.__TEMPLATES_ALL)
        .filter((t) => t.meta_status === "approved")
        .map((t) => t.name),
      approved,
      `${name}: the approved messages`,
    );
    assert.deepEqual(
      plain(w.__TEMPLATES_ALL),
      plain(scenario(name, NOW).templates),
      `${name}: the scenario's own list, not a copy`,
    );
    // And the count Setup states is that list counted, never a number typed beside it.
    assert.equal(
      w.__SETUP.dto.templates.approved,
      approved.length,
      `${name}: Setup counts the messages the workspace has`,
    );
    assert.equal(w.__SETUP.dto.templates.startersApproved, approved.length, name);
  }
});

/* ------------------------------- what the pages read ------------------------------- */

/** Every `window.__x` the pages under test read: files in legacy/pages, or legacy/<dir>. */
function globalsRead(files, dir = "pages") {
  const names = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(path.join(LEGACY, dir, f), "utf8").matchAll(/window\.(__[A-Za-z0-9_]+)/g)) {
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

test("the document carries the app's own rules after the mockup's stylesheets, the touch floor among them", () => {
  // The app imports legacy-bridge/legacy.css, which is the mockup's stylesheets in their order and then the app's own
  // rules: the 44px floor under a coarse pointer among them. The mockup's document never had those rules, so a spec on
  // a touch phone measured a Save 26px tall on the harness that the app draws at 44.
  const html = documentWithFixture();
  const at = (needle) => html.indexOf(needle);
  assert.ok(at("/_hx/app.css") > 0, "the app's rules are in the document");
  assert.ok(at("/_hx/app.css") > at("styles/ask.css"), "after the last of the mockup's stylesheets, as in the app");
  assert.ok(at("/_hx/app.css") < at("</head>"));
  const rules = appRules();
  assert.equal(/@import/.test(rules), false, "and not the stylesheets again: the document already has them");
  assert.ok(rules.trim().length > 0);
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

test("the pipeline record is People as the app is handed them: every group of the Pipeline, and a read of each person", () => {
  const record = scenario("pipeline", NOW);
  assert.equal(record.sellsBy, "proposal", "a studio that sends proposals");
  assert.equal(dealsAreOn(record.sellsBy), true, "so deals are on");
  // People's rows through the People surface's own mapping, then the Pipeline's: every group has someone in it.
  const rows = record.people.map((r) => toPersonRowVM(r, TIMEZONE, new Date(NOW)));
  assert.deepEqual(
    pipelineOf(rows, NOW, TIMEZONE, null).groups.map((g) => [g.key, g.count]),
    [
      ["consultations", 2],
      ["proposals", 3],
      ["clients", 2],
      ["closed", 1],
    ],
  );
  // The real shape, not a subset of it: every column on every row, a deal's null where there is none; and under a
  // calendar that reads, everyone's visits -- none is still an answer, never a workspace with no calendar.
  const columns = Object.keys(record.people[0]).join();
  assert.ok(
    record.people.every((r) => Object.keys(r).join() === columns),
    "one shape for every row",
  );
  assert.ok(["message_channels", "came_from", "deal_lost_reason"].every((k) => k in record.people[0]));
  assert.ok(record.people.every((r) => r.visits?.state === "ok"));
  assert.ok(
    rows.every((r) => r.calendar !== "none"),
    "nobody reads as a workspace with no calendar",
  );
  // Ids are the app's own shape: a person's route is a UUID (surface-registry.ts personRouteId); and every number is
  // from the block kept for fiction, 555-0100 to 0199.
  assert.ok(record.people.every((r) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(r.id)));
  assert.ok(record.people.every((r) => /^\+1\d{3}55501\d{2}$/.test(r.phone_e164)));
  // Each person's page agrees with their row, read through the profile's own mapping: the row's last message is their
  // thread's newest, the page offers the link the list does, and a proposal out says it went out.
  for (const r of record.people) {
    const d = record.details[r.id];
    const newest = d.conversations[0].messages.at(-1);
    assert.deepEqual([r.last_message_at, r.last_message_direction], [newest.created_at, newest.direction]);
    const person = toPersonVM(d, TIMEZONE, new Date(NOW));
    assert.equal(person.bookingLink, record.config.brain.booking_link, r.display_name);
    if (r.deal_stage === "proposed") assert.ok(person.proposal?.sent, `${r.display_name}: the page says it went`);
  }
});

test("the server answers People's reads where the record has people, by the workspace's id or slug, and nowhere else", () => {
  const record = scenario("pipeline", NOW);
  const byId = new URLSearchParams({ workspace: WORKSPACE.id });
  const bySlug = new URLSearchParams({ workspace: WORKSPACE.slug });
  const list = answer("GET", "/api/v1/contacts", byId, record);
  assert.equal(list.status, 200);
  const { people, page, ...rest } = list.body.data;
  assert.equal(people.length, record.people.length);
  assert.equal(page.has_more, false);
  // The route's own envelope (app/api/v1/contacts/route.ts): consult_first a flag, the names left on the server.
  assert.deepEqual(rest, {
    calendar: { state: "ok", source: "your calendar", timezone: TIMEZONE },
    booking_link: record.config.brain.booking_link,
    consult_first: true,
    deals_on: true,
  });
  // A page's own read names the workspace by the slug in its address, as the app's does.
  assert.equal(answer("GET", "/api/v1/contacts", bySlug, record).status, 200);
  // The next page is empty: the surface reads pages until has_more is false.
  const next = new URLSearchParams({ workspace: WORKSPACE.id, offset: "1000" });
  assert.deepEqual(answer("GET", "/api/v1/contacts", next, record).body.data.people, []);
  assert.deepEqual(answer("GET", "/api/v1/segments", byId, record).body.data, { lists: [] });
  assert.deepEqual(answer("GET", "/api/v1/views", byId, record).body.data, { views: {} });
  // The workspace list says how its customers buy, as the app's does; the records without an answer say nothing.
  assert.equal(answer("GET", "/api/v1/workspaces", byId, record).body.data.workspaces[0].sells_by, "proposal");
  assert.equal(
    "sells_by" in answer("GET", "/api/v1/workspaces", byId, scenario("salon", NOW)).body.data.workspaces[0],
    false,
  );
  const id = record.people[0].id;
  const person = answer("GET", `/api/v1/contacts/${id}`, byId, record).body.data.person;
  assert.deepEqual([person.row.id, person.deals_on], [id, true]);
  assert.equal(answer("GET", "/api/v1/contacts/00000000-0000-4000-8000-000000000000", byId, record).status, 404);
  // A record with no people answers none of them: People stays the seeded page there, as it always has.
  for (const name of ["nightly", "salon"]) {
    assert.equal(answer("GET", "/api/v1/contacts", byId, scenario(name, NOW)).status, 404, name);
  }
  // And no read of them writes.
  assert.equal(answer("PUT", "/api/v1/views/pipeline", byId, record).status, 405);
});

test("the pipeline fixture builds, and outside a browser it installs no People: nothing to read them by", async () => {
  const w = await publishedGlobals("pipeline");
  // Each is set as the block runs, before anything is read: none is here, so none of it ran.
  assert.equal(w.__pipeline, undefined);
  assert.equal(w.__surfaceGate, undefined);
  assert.equal(w.__proposalMessage, undefined);
  // The Settings half of the record is published as every scenario's is.
  assert.equal(w.__ACTIVE_WORKSPACE, WORKSPACE.id);
});

/* ------------------------------------------- the pipeline record, in a browser ------------------------------------------- */

/**
 * A browser as far as the fixture's People block reaches: an address and a history, storage, events, and a fetch that
 * is the harness's own answer(), so the People boot runs as it does on the page, with no socket. The timers the page
 * starts are unreferenced: a read the runner schedules for later never holds the suite open.
 */
function browserWindow(record, hash) {
  const asked = [];
  const store = () => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  };
  const unref = (h) => {
    h?.unref?.();
    return h;
  };
  const listeners = {};
  const w = {
    console,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    setTimeout: (f, ms, ...a) => unref(setTimeout(f, ms, ...a)),
    clearTimeout,
    setInterval: (f, ms, ...a) => unref(setInterval(f, ms, ...a)),
    clearInterval,
    CustomEvent: class {
      constructor(type, o) {
        this.type = type;
        this.detail = o?.detail;
      }
    },
    navigator: { onLine: true },
    location: { pathname: "/", search: "", hash },
    history: {
      state: null,
      replaceState(_state, _title, url) {
        const to = new URL(url, `http://localhost${w.location.pathname}`);
        Object.assign(w.location, { pathname: to.pathname, search: to.search, hash: to.hash });
      },
    },
    sessionStorage: store(),
    localStorage: store(),
    document: { ...stubWindow().document, removeEventListener() {}, visibilityState: "visible" },
    addEventListener: (type, f) => (listeners[type] ||= []).push(f),
    removeEventListener() {},
    dispatchEvent: (e) => {
      for (const f of listeners[e.type] ?? []) f(e);
      return true;
    },
    fetch: async (url, init) => {
      const u = new URL(url, "http://localhost");
      const method = init?.method ?? "GET";
      asked.push({ method, path: u.pathname, workspace: u.searchParams.get("workspace") });
      const got = answer(method, u.pathname, u.searchParams, record);
      return {
        ok: !!got && got.status < 300,
        status: got ? got.status : 404,
        json: async () => (got ? got.body : null),
        headers: { get: () => null },
      };
    },
  };
  w.window = w;
  w.self = w;
  return { w, asked };
}

/** Resolves once `ok()` holds, polling on this realm's timers; fails after two seconds. */
async function until(ok, ms = 2000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** The pipeline record's page in a browser, once People has landed. */
async function pipelinePage(hash = "#/clients/pipeline") {
  const record = scenario("pipeline", NOW);
  const { w, asked } = browserWindow(record, hash);
  vm.runInNewContext(await buildFixture(record), vm.createContext(w));
  const at = { pathname: w.location.pathname, hash: w.location.hash };
  await until(() => w.__PEOPLE);
  return { record, w, asked, at };
}

test("in a browser, the pipeline record's page stands at its workspace's address and reads People through the app's own surface", async () => {
  const { record, w, asked, at } = await pipelinePage();
  // At the workspace's address before anything is read, with the route kept (the server serves that address).
  assert.deepEqual(at, { pathname: `/w/${WORKSPACE.slug}/`, hash: "#/clients/pipeline" });
  assert.equal(w.__PEOPLE.rows.length, record.people.length);
  assert.equal(w.__PEOPLE.dealsOn, true);
  // Every read named the workspace as the app's do from that address, by its slug; not one of them was a write.
  assert.ok(asked.length > 0);
  assert.deepEqual([...new Set(asked.map((a) => `${a.method} ${a.workspace}`))], [`GET ${WORKSPACE.slug}`]);
  // The route gate is the app's own: the Pipeline and a person's page open once People and who is looking have
  // landed, and so do Settings and Setup, which the fixture publishes.
  for (const [page, param] of [
    ["clients", "pipeline"],
    ["clients", record.people[0].id],
    ["admin", "workspace"],
    ["admin", "setup"],
  ]) {
    assert.equal(w.__surfaceGate(page, param), true, `${page}/${param}`);
  }
  // What the harness does not serve waits, as the app waits for a read: never the mockup's seeded page.
  assert.equal(w.__surfaceGate("today", null), false);
  // A person is read through the app's own courier, from the harness's own answer.
  const person = await w.__personDetail(record.people[3].id);
  assert.equal(person.name, record.people[3].display_name);
  assert.equal(person.proposal.sent !== null, true, "the proposal went out, and the page says so");
});

/**
 * What the People pages read that the pipeline record's page leaves alone, and why. The Leads scope's own is excused
 * whole (LEADS_SCOPE): clients-a.jsx draws it beside People, and this record has no searches.
 */
const PEOPLE_NOT_PUBLISHED = new Map([
  [
    "__href",
    "the api's addresses (inbox-verbs.ts): without it the page offers no export, and the harness serves no file",
  ],
  ["__lists", "a saved list's verbs (people-lists.ts), every one a write: the page offers none without them"],
]);
const LEADS_SCOPE = /^__(LEADS|LEAD_VM|leads?[A-Z]\w*)$/;

test("in a browser, the pipeline record's page has every global the People pages read, or says why not", async () => {
  const read = new Set([
    ...globalsRead([
      "clients-a.jsx",
      "clients-bits.jsx",
      "people-table.jsx",
      "people-import.jsx",
      "pipeline-scope.jsx",
      "pipeline-row.jsx",
      "pipeline-peek.jsx",
      "pipeline-board.jsx",
      "pipeline-new.jsx",
      "client-profile.jsx",
      "person-deal.jsx",
    ]),
    ...globalsRead(["deal-sheet.jsx"], "components"),
  ]);
  assert.ok(read.has("__proposalMessage"), "the one-step send's words are one of the globals this test is about");
  const { w } = await pipelinePage();
  const published = new Set(Object.keys(w));
  const installed = globalsInstalledByThePages();
  const missing = [...read]
    .filter((n) => !published.has(n) && !installed.has(n) && !PEOPLE_NOT_PUBLISHED.has(n) && !LEADS_SCOPE.test(n))
    .sort();
  assert.deepEqual(missing, [], `neither published nor accounted for: ${missing.join(", ")}`);
  // The list only shrinks: a name published AND excused is an excuse nobody will delete.
  const stale = [...PEOPLE_NOT_PUBLISHED.keys()].filter((n) => published.has(n) || !read.has(n)).sort();
  assert.deepEqual(stale, [], `no longer true of: ${stale.join(", ")}`);
});

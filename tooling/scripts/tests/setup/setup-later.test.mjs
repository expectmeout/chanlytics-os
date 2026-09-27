/**
 * A row put off is the member's, on every device: the Setup surface reads their saved view beside the workspace's
 * facts (GET views), and Later or Skip saves the whole list through the door People's own view goes through
 * (PUT views/setup), one save at a time. Run here: the bridge's own installSetup and setupOverride, over a fetch
 * that answers as the routes do -- with the landing on the first run, and the helpers the bridge publishes for the
 * pages that draw it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_RUN_HELPERS, FIRST_RUN_LANDED_KEY, SETUP_LATER_REFUSED } from "@chanlytics/contracts";

/* ------------------------------- the window ------------------------------ */

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const listeners = {};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init && init.detail;
  }
};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
// Already landed this session, so the landing listener leaves the address alone while these tests read.
globalThis.sessionStorage.setItem(FIRST_RUN_LANDED_KEY, "1");

const SETUP = {
  business: {
    name: "Harbor Moving",
    hours: true,
    services: 2,
    bookingLink: true,
    address: true,
    handoff: null,
    broken: false,
  },
  channels: {
    whatsapp: { present: false, active: false, number: null, quality: null, lastInboundAt: null },
    voice: { present: true, active: true, number: "+13055550123", lastInboundAt: null },
  },
  templates: { approved: 0, pending: 0, startersApproved: 0 },
  calendar: { state: "none" },
  team: { members: 1, invitesOpen: 0, alertEmails: 1 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
};
const asked = [];
const wire = {
  setup: SETUP,
  views: { views: { setup: { later: ["calendar"] } } },
  viewsFail: false,
  putOk: true,
  /** When set, each save waits on it before it is answered: a save still out. */
  gate: null,
  /** What the first receptionist's route answers, when a test says; made, otherwise. */
  receptionist: null,
};
// The routes' own envelope: `{ ok: true, data }`, or `{ ok: false, error }` for a refusal.
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ok = (data) => json(200, { ok: true, data });
const refused = (status, code, message) => json(status, { ok: false, error: { code, message } });

globalThis.window = {
  location: { pathname: "/w/harbor", hash: "#/today", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  __WORKSPACES: [{ id: "ws-harbor", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "ws-harbor",
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => {
    (listeners[type] ||= new Set()).add(fn);
  },
  removeEventListener: (type, fn) => {
    listeners[type]?.delete(fn);
  },
  dispatchEvent: (ev) => {
    for (const fn of [...(listeners[ev.type] || [])]) fn(ev);
    return true;
  },
  fetch: async (url, init = {}) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    asked.push([init.method ?? "GET", u.pathname, init.body ? JSON.parse(String(init.body)) : null]);
    if (u.pathname === "/api/v1/setup") return ok({ setup: wire.setup, role: "owner" });
    if (u.pathname === "/api/v1/views") {
      return wire.viewsFail ? refused(500, "internal", "no") : ok(wire.views);
    }
    if (u.pathname === "/api/v1/settings/receptionist") return wire.receptionist ?? ok({ wrote: true });
    if (u.pathname === "/api/v1/views/setup") {
      if (wire.gate) await wire.gate();
      return wire.putOk ? ok({ views: {} }) : refused(429, "rate_limited", "Too many changes — try again in a minute.");
    }
    return refused(404, "not_found", "no");
  },
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const { installSetup, setupOverride } = await import("../../../../apps/dashboard/src/legacy-bridge/setup.ts");
installSetup(globalThis.window);
const w = globalThis.window;

const saves = () => asked.filter(([m, p]) => m === "PUT" && p === "/api/v1/views/setup");
/** Lets the fetches under way reach the wire: a Response is read over more than one turn. */
const settle = async (until = () => false) => {
  for (let i = 0; i < 50 && !until(); i++) await new Promise((r) => setTimeout(r, 0));
};

test("the surface reads the member's put-off rows with the workspace's facts, and the rows say so", async () => {
  await setupOverride.apply();
  assert.deepEqual(w.__SETUP.later, ["calendar"]);
  assert.equal(w.__SETUP.vm.rows.find((r) => r.id === "calendar").later, true);
  assert.ok(
    asked.some(([m, p]) => m === "GET" && p === "/api/v1/views"),
    "read through the views door",
  );
});

test("Later saves the member's whole list through the views door; taking one back saves the rest", async () => {
  const r = await w.__setup.later("team", true);
  assert.equal(r.ok, true);
  assert.deepEqual(asked.at(-1), ["PUT", "/api/v1/views/setup", { view: { later: ["calendar", "team"] } }]);
  assert.deepEqual(w.__SETUP.later, ["calendar", "team"]);
  await w.__setup.later(["calendar"], false);
  assert.deepEqual(asked.at(-1)[2], { view: { later: ["team"] } });
  assert.deepEqual(w.__SETUP.later, ["team"]);
});

test("a save the server refuses puts the rows back as they were, and says why", async () => {
  wire.putOk = false;
  try {
    const before = [...w.__SETUP.later];
    const r = await w.__setup.later("keep", true);
    assert.equal(r.ok, false);
    assert.match(r.message, /try again/);
    assert.deepEqual(w.__SETUP.later, before, "not put off, since it was not kept");
  } finally {
    wire.putOk = true;
  }
});

test("two presses save one at a time, each with the list as it stands, and a refusal takes back only its own row", async () => {
  const gates = [];
  wire.gate = () => new Promise((r) => gates.push(r));
  try {
    const sent = saves().length;
    const first = w.__setup.later("keep", true);
    const second = w.__setup.later("google", true);
    assert.deepEqual(w.__SETUP.later, ["team", "keep", "google"], "both rows go at once");
    await settle(() => gates.length > 0);
    await settle();
    assert.equal(saves().length, sent + 1, "the second waits while the first is out");
    assert.deepEqual(saves().at(-1)[2], { view: { later: ["team", "keep", "google"] } });

    // A re-read while a save is out keeps the list on screen: the read cannot know what is on its way.
    await setupOverride.apply();
    assert.deepEqual(w.__SETUP.later, ["team", "keep", "google"]);

    wire.putOk = false;
    gates[0]();
    assert.equal((await first).ok, false);
    assert.deepEqual(w.__SETUP.later, ["team", "google"], "the refused press alone comes back");
    wire.putOk = true;
    await settle(() => gates.length > 1);
    assert.deepEqual(saves().at(-1)[2], { view: { later: ["team", "google"] } }, "the next save sends what stands");
    gates[1]();
    assert.equal((await second).ok, true);
    assert.deepEqual(w.__SETUP.later, ["team", "google"]);
  } finally {
    wire.gate = null;
    wire.putOk = true;
  }
});

test("a re-read whose views read fails keeps the rows the member put off", async () => {
  const before = [...w.__SETUP.later];
  wire.viewsFail = true;
  try {
    await setupOverride.apply();
    assert.deepEqual(w.__SETUP.later, before);
    assert.equal((await w.__setup.later("team", false)).ok, true, "and a press still saves, the list being known");
  } finally {
    wire.viewsFail = false;
  }
});

test("a first read without the member's view puts nothing off, and refuses to save over what it could not read", async () => {
  w.__SETUP = undefined;
  wire.viewsFail = true;
  try {
    await setupOverride.apply();
    assert.deepEqual(w.__SETUP.later, []);
    assert.ok(w.__SETUP.vm.rows.length > 0, "the rows are Setup's all the same");
    const sent = saves().length;
    const r = await w.__setup.later("keep", true);
    assert.deepEqual(r, { ok: false, message: SETUP_LATER_REFUSED.unread });
    assert.equal(saves().length, sent, "nothing saved: the save would have replaced the member's list with less");
    assert.deepEqual(w.__SETUP.later, []);
  } finally {
    wire.viewsFail = false;
  }
  await setupOverride.apply();
  assert.equal((await w.__setup.later("keep", true)).ok, true, "read again, the list is known");
});

test("an owner whose receptionist answers nowhere lands on the first run, once a session", async () => {
  const navs = [];
  w.appNavigate = (to) => navs.push(to);
  wire.setup = {
    ...SETUP,
    channels: { ...SETUP.channels, voice: { present: false, active: false, number: null, lastInboundAt: null } },
  };
  globalThis.sessionStorage.removeItem(FIRST_RUN_LANDED_KEY);
  try {
    await setupOverride.apply();
    w.dispatchEvent(new CustomEvent("surface:setup"));
    assert.deepEqual(navs, ["start"]);
    assert.equal(globalThis.sessionStorage.getItem(FIRST_RUN_LANDED_KEY), "1");
    w.dispatchEvent(new CustomEvent("surface:setup"));
    assert.deepEqual(navs, ["start"], "once a session");
  } finally {
    delete w.appNavigate;
    wire.setup = SETUP;
    globalThis.sessionStorage.setItem(FIRST_RUN_LANDED_KEY, "1");
  }
});

test("the first run's helpers are published for the pages that draw it", () => {
  assert.deepEqual(
    Object.keys(w.__firstRun).sort(),
    Object.keys(FIRST_RUN_HELPERS).sort(),
    "contracts' helpers, all of them",
  );
  assert.equal(w.__firstRun.words.title, "Setting up");
});

test("the first run asks for the receptionist through its route: written, nothing to add, or refused in the route's words; and what a settings save reads again is read again", async () => {
  assert.deepEqual(await w.__setup.receptionist(), { ok: true, wrote: true, message: "" });
  assert.deepEqual(
    asked.find(([, p]) => p === "/api/v1/settings/receptionist"),
    ["POST", "/api/v1/settings/receptionist", {}],
  );
  wire.receptionist = ok({ wrote: false });
  assert.deepEqual(await w.__setup.receptionist(), { ok: true, wrote: false, message: "" });
  wire.receptionist = refused(403, "forbidden", "Only an owner can do this.");
  assert.deepEqual(await w.__setup.receptionist(), { ok: false, wrote: false, message: "Only an owner can do this." });
  wire.receptionist = null;
  const { AFTER } = await import("../../../../apps/dashboard/src/legacy-bridge/refresh-map.ts");
  assert.deepEqual(
    AFTER["POST settings/receptionist"]().map((o) => o.key),
    AFTER["PUT settings"]().map((o) => o.key),
  );
});

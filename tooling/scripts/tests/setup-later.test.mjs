/**
 * A row put off is the member's, on every device: the Setup surface reads their saved view beside the workspace's
 * facts (GET views), and Later or Skip saves the whole list through the door People's own view goes through
 * (PUT views/setup). Run here: the bridge's own installSetup and setupOverride, over a fetch that answers as the
 * routes do -- and the first run's helpers the bridge publishes for the pages.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

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
globalThis.sessionStorage.setItem("chanlytics.setup.landed", "1");

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
const wire = { views: { views: { setup: { later: ["calendar"] } } }, viewsFail: false, putOk: true };
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
    if (u.pathname === "/api/v1/setup") return ok({ setup: SETUP, role: "owner" });
    if (u.pathname === "/api/v1/views") {
      return wire.viewsFail ? refused(500, "internal", "no") : ok(wire.views);
    }
    if (u.pathname === "/api/v1/views/setup") {
      return wire.putOk ? ok({ views: {} }) : refused(429, "rate_limited", "Too many changes — try again in a minute.");
    }
    return refused(404, "not_found", "no");
  },
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };

const { installSetup, setupOverride } = await import("../../../apps/dashboard/src/legacy-bridge/setup.ts");
installSetup(globalThis.window);
const w = globalThis.window;

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

test("a views read that fails puts nothing off, and Setup still reads", async () => {
  wire.viewsFail = true;
  try {
    await setupOverride.apply();
    assert.deepEqual(w.__SETUP.later, []);
    assert.ok(w.__SETUP.vm.rows.length > 0, "the rows are Setup's all the same");
  } finally {
    wire.viewsFail = false;
  }
});

test("the first run's helpers are published for the pages that draw it", () => {
  for (const k of ["of", "card", "today", "words"]) assert.ok(w.__firstRun && w.__firstRun[k], k);
  assert.equal(w.__firstRun.words.title, "Setting up");
});

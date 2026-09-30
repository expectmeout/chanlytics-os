/**
 * A person's page opens as quickly as the tab can make it: the person is read first, kept in the tab like a surface,
 * and still painted after a write.
 *
 * Measured on production (23 Sep 2026, the salon, 29 people): Today and Leads paint whole from the tab on a reload; a
 * person's page painted their name and waited 1.4 s for the rest, because the answer it had read a moment before went
 * with the reload, and their read went out beside eight of the boot's. A new tab waited for People's whole list
 * (0.87 s) before it asked for the person at all. Its own file, so the courier's cache starts empty.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const ID = "ed2244f3-9f88-49c5-863e-fbdea4b60e12";
const WROTE = "2026-09-06T16:30:00Z";
const ZONE = "America/Chicago";
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.window = {
  location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", assign() {}, replace() {} },
  __WORKSPACES: [{ id: "ws-harbor", slug: "harbor", name: "Harbor", status: "active", timezone: ZONE }],
  __ACTIVE_WORKSPACE: "ws-harbor",
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
};

// The row the list reads and the detail the page reads, in the shape the route answers (one-clock.test.mjs's).
const row = (over = {}) => ({
  id: ID,
  display_name: "Zoe Martin",
  wa_profile_name: null,
  phone_e164: "+19175550114",
  consent: "opted_in",
  consent_source: "in_person",
  consent_updated_at: WROTE,
  dnc: false,
  channels: ["whatsapp"],
  conversation_count: 1,
  escalation_count: 0,
  needs_human: false,
  open_escalation_reason: null,
  open_escalation_since: null,
  latest_conversation_id: "c1",
  latest_state: "open",
  latest_paused_until: null,
  latest_assignee_user_id: null,
  latest_snooze_until: null,
  latest_wa_inbound_at: WROTE,
  last_message_at: WROTE,
  last_message_direction: "inbound",
  last_message_sender: "customer",
  last_inbound_text: "Can I come at eleven?",
  last_inbound_at: WROTE,
  last_call_at: null,
  call_count: 0,
  call_seconds: 0,
  first_contact_at: WROTE,
  earliest_row_at: WROTE,
  has_backfill: false,
  has_chat: true,
  queued_reply_at: null,
  ...over,
});
const detail = () => ({
  row: row(),
  identities: [],
  conversations: [
    {
      id: "c1",
      state: "open",
      paused_until: null,
      last_wa_inbound_at: WROTE,
      last_message_at: WROTE,
      contact: { id: ID, display_name: "Zoe Martin", wa_profile_name: null, phone_e164: "+19175550114" },
      messages: [
        {
          id: "m1",
          direction: "inbound",
          sender: "customer",
          type: "text",
          body: "Can I come at eleven?",
          media: null,
          meta: null,
          status: "received",
          created_at: WROTE,
        },
      ],
    },
  ],
  calls: [],
  escalations: [],
  decisions: [],
  receptionist_mode: null,
  workspace_reply_mode: "auto",
});

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The wire: the person's read answers `answer()`, a DELETE of them is accepted, anything else is a 404. Every request kept. */
let seen = [];
let held = null;
let answer = () => json(200, { ok: true, data: { person: detail() } });
globalThis.window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const method = init.method ?? "GET";
  seen.push({ method, path: u.pathname, workspace: u.searchParams.get("workspace") });
  if (method === "GET" && u.pathname === `/api/v1/contacts/${ID}`) return answer();
  // Anyone else a list shows: answered when the test lets them go (`held`), else at once.
  if (method === "GET" && /^[/]api[/]v1[/]contacts[/][0-9a-f-]{36}$/.test(u.pathname)) {
    if (!held) return json(200, { ok: true, data: { person: detail() } });
    return new Promise((r) => held.push(() => r(json(200, { ok: true, data: { person: detail() } }))));
  }
  if (method === "DELETE" && u.pathname === `/api/v1/contacts/${ID}`) return json(200, { ok: true, data: {} });
  if (method === "PUT" && u.pathname === `/api/v1/contacts/${ID}/details`) return json(200, { ok: true, data: {} });
  return json(404, { ok: false, error: { code: "not_found", message: `no ${method} ${u.pathname}` } });
};
const reads = () => seen.filter((q) => q.method === "GET" && q.path === `/api/v1/contacts/${ID}`).length;
const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
};

const bridge = await import("../../../../apps/dashboard/src/surfaces/people/people-detail.ts");
// What the person's page reads them with (surfaces/people/person/read.ts): the courier's, the tab's copy first.
const { heldPerson, readPerson } = await import("../../../../apps/dashboard/src/surfaces/people/person/read.ts");
const { startSurfaces } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
const { readCache, clearReadCaches } = await import("../../../../apps/dashboard/src/legacy-bridge/read-cache.ts");
const { clearSurfaceCache } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-cache.ts");
/**
 * What a reload finds: the person cache made again the way people-detail.ts makes it, over the same tab's storage and
 * with nothing in memory. (A module imported again under a query is the same instance here, so it cannot stand in.)
 */
const reloaded = () => {
  const c = readCache("person", (vm) => vm !== null, { tab: true });
  return { peekPerson: (id) => c.peek(id), warmPerson: (id) => c.warm(id, () => bridge.personDetail(id)) };
};
const SLOT = "chanlytics.reads.v1.person";

beforeEach(() => {
  clearReadCaches();
  seen = [];
  held = null;
  answer = () => json(200, { ok: true, data: { person: detail() } });
  globalThis.window.location.pathname = "/w/harbor";
  globalThis.window.location.hash = "";
});

test("a tab opened on a person's page asks for them before anything else, and the page's own read is that one", async () => {
  globalThis.window.location.hash = `#/clients/${ID}`;
  bridge.warmPersonOnScreen(globalThis.window);
  const page = readPerson(ID);
  assert.equal(reads(), 1, "one request: the page shares the read the boot started");
  assert.equal(seen[0].workspace, "harbor", "named for the workspace in the address");
  const vm = await page;
  assert.equal(vm.name, "Zoe Martin");
  await settle();
  assert.equal(heldPerson(ID).name, "Zoe Martin", "and the next first paint has them");
});

test("the surfaces nobody is looking at wait for the person the page opens on (25 Sep 2026)", async () => {
  globalThis.window.location.hash = `#/clients/${ID}`;
  let release = () => {};
  answer = () =>
    new Promise((r) => {
      release = () => r(json(200, { ok: true, data: { person: detail() } }));
    });
  bridge.warmPersonOnScreen(globalThis.window);
  const order = [];
  const stop = startSurfaces([
    {
      key: "settings",
      apply: async () => {
        order.push("settings");
      },
    },
  ]);
  await settle();
  await settle();
  assert.deepEqual(order, [], "a stranger's read waits for the person's");
  release();
  await settle();
  await settle();
  await settle();
  stop();
  assert.deepEqual(order, ["settings"], "and goes once it has landed");
  assert.equal(reads(), 1);
});

test("nothing is asked off a person's page: a list, a lead, a seeded id, or a page that names no workspace", async () => {
  for (const hash of ["#/clients", "#/clients/leads", "#/clients/pipeline", "#/clients/c-ana", "#/today", ""]) {
    globalThis.window.location.hash = hash;
    bridge.warmPersonOnScreen(globalThis.window);
  }
  globalThis.window.location.pathname = "/";
  globalThis.window.location.hash = `#/clients/${ID}`;
  bridge.warmPersonOnScreen(globalThis.window);
  await settle();
  assert.equal(seen.length, 0, `asked: ${JSON.stringify(seen)}`);
});

test("a reload paints the person whole: the tab keeps them, as it keeps Today and Leads", async () => {
  await bridge.personDetail(ID);
  assert.ok(globalThis.sessionStorage.getItem(SLOT), "REGRESSION: the courier's cache lived in memory only");
  const after = reloaded();
  const held = after.peekPerson(ID);
  assert.ok(held, "REGRESSION: the person went with the reload, and the page waited on the wire for them");
  assert.equal(held.name, "Zoe Martin");
  // The tab keeps words: a Date or a function in the view model would come back as a string or not at all, and the
  // page would draw from a copy that is not the page's. Every leaf is one JSON keeps as it was.
  const live = bridge.peekPerson(ID);
  const odd = [];
  const walk = (v, at) => {
    if (v === null || ["string", "number", "boolean", "undefined"].includes(typeof v)) return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${at}[${i}]`));
    if (Object.getPrototypeOf(v) !== Object.prototype) return odd.push(at);
    for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`);
  };
  walk(live, "vm");
  assert.deepEqual(odd, [], "every part of the view model survives the tab");
  assert.deepEqual(held, JSON.parse(JSON.stringify(live)), "the whole page, not the head");

  // Warming what a reload found reads it again: it describes the world as it was when this tab last asked.
  after.warmPerson(ID);
  await settle();
  assert.equal(reads(), 2, "the copy from before the reload is painted and read again");
  after.warmPerson(ID);
  await settle();
  assert.equal(reads(), 2, "and once read, resting on the row again spends nothing");
});

test("after an act they are still painted, and read again before a warm-up counts them as held", async () => {
  await bridge.personDetail(ID);
  bridge.warmPerson(ID);
  await settle();
  assert.equal(reads(), 1, "held and current: nothing to read");

  // A write through the tab's one client (their name, here): what every act does to what the tab holds (api.ts).
  const wrote = await bridge.setPersonDetails(ID, { notes: "Prefers mornings" });
  assert.equal(wrote.ok, true);
  assert.equal(bridge.peekPerson(ID)?.name, "Zoe Martin", "REGRESSION: every act anywhere emptied the tab of people");
  bridge.warmPerson(ID);
  await settle();
  assert.equal(reads(), 2, "the pointer reaching their row reads them as they now are");
});

test("a person the server no longer has is let go of, here and in the tab", async () => {
  await bridge.personDetail(ID);
  answer = () =>
    json(404, { ok: false, error: { code: "not_found", message: "This person is not in your workspace." } });
  assert.equal(await bridge.personDetail(ID), null);
  assert.equal(bridge.peekPerson(ID), null, "the page would paint someone who is not there");
  assert.equal(reloaded().peekPerson(ID), null, "and a reload would too");
});

test("deleting a person here lets go of the copy the tab kept", async () => {
  await bridge.personDetail(ID);
  const r = await bridge.deletePerson(ID);
  assert.equal(r.ok, true);
  assert.equal(bridge.peekPerson(ID), null);
  assert.equal(reloaded().peekPerson(ID), null);
});

test("signing out takes them with the surfaces: nothing of a customer outlives the session", async () => {
  await bridge.personDetail(ID);
  clearSurfaceCache();
  assert.equal(bridge.peekPerson(ID), null);
  assert.equal(reloaded().peekPerson(ID), null);
  const left = [];
  for (let i = 0; i < globalThis.sessionStorage.length; i++) left.push(globalThis.sessionStorage.key(i));
  assert.deepEqual(
    left.filter((k) => k.startsWith("chanlytics.reads")),
    [],
    "no person's slot left in the tab",
  );
});

test("the sign-in page clears every kept slot, though it made none of the caches: the last session's person is never the next one's first draw", async () => {
  // The sign-in, sign-up and reset pages clear the tab (clearSurfaceCache) without loading the people courier, so a
  // clear that reached only the caches the page had made left the person's slot behind for whoever signed in next.
  globalThis.sessionStorage.setItem("chanlytics.reads.v1.person-from-before", '{"build":"dev","entries":[]}');
  globalThis.sessionStorage.setItem("chanlytics.place.v1-not-ours", "kept");
  clearSurfaceCache();
  assert.equal(globalThis.sessionStorage.getItem("chanlytics.reads.v1.person-from-before"), null);
  assert.equal(
    globalThis.sessionStorage.getItem("chanlytics.place.v1-not-ours"),
    "kept",
    "and nothing else of the tab's",
  );
  globalThis.sessionStorage.removeItem("chanlytics.place.v1-not-ours");
});

test("a read still out when the tab is cleared is not kept when it lands: a sign-out never writes the person back", async () => {
  let land = null;
  answer = () =>
    new Promise((r) => {
      land = () => r(json(200, { ok: true, data: { person: detail() } }));
    });
  const out = bridge.personDetail(ID);
  await settle();
  assert.ok(land, "the read went out");
  clearSurfaceCache();
  land();
  await out;
  assert.equal(bridge.peekPerson(ID), null, "REGRESSION: the read that landed after the sign-out kept them");
  assert.equal(globalThis.sessionStorage.getItem(SLOT), null, "and wrote them back into the tab");
});

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asked = () =>
  seen.filter((q) => q.method === "GET" && q.path.startsWith("/api/v1/contacts/")).map((q) => q.path.split("/").pop());

test("a list's people are read ahead once the boot is in: the first twelve, two at a time, never one the tab holds", async () => {
  // A person the tab does not hold opens on nothing of theirs until their page is whole (person/person-real.tsx): the way
  // it opens at once is to have read them before the press.
  const rows = Array.from({ length: 14 }, (_, i) => uuid(i + 1));
  held = null;
  await bridge.personDetail(rows[2]);
  seen = [];
  held = [];
  bridge.warmPeople(rows);
  await settle();
  assert.deepEqual(asked(), [rows[0], rows[1]], "two at a time, in the list's order");
  for (let i = 0; i < 20 && held.length; i++) {
    held.shift()();
    await settle();
  }
  const read = asked();
  assert.equal(read.length, 11, `the first twelve but the one already held: ${read.length}`);
  assert.ok(!read.includes(rows[2]), "the one the tab holds is not read again");
  assert.ok(!read.includes(rows[12]) && !read.includes(rows[13]), "and nobody past the twelfth");
  assert.ok(bridge.peekPerson(rows[11]), "held now: their page opens whole");
});

test("a later list replaces what an earlier one was still waiting to read; off a workspace page nothing is read", async () => {
  held = [];
  bridge.warmPeople([uuid(21), uuid(22), uuid(23), uuid(24)]);
  await settle();
  bridge.warmPeople([uuid(31)]);
  for (let i = 0; i < 10 && held.length; i++) {
    held.shift()();
    await settle();
  }
  assert.deepEqual(asked(), [uuid(21), uuid(22), uuid(31)], "the two out finish; the list on screen goes next");
  seen = [];
  globalThis.window.location.pathname = "/";
  bridge.warmPeople([uuid(41)]);
  await settle();
  assert.deepEqual(asked(), [], "a read that names no workspace is refused, so none goes");
});

test("a list drawn from the tab before the boot starts waits for that boot: its reads never stand in the boot's lanes", async () => {
  // On a reload People draws from the tab in the first render, and its effect runs before the shell's starts the boot
  // (a child's effects run before its parent's). Asked at once, afterBoot answered for no boot at all.
  let bootIn = () => {};
  const slow = {
    key: "slow",
    apply: () =>
      new Promise((r) => {
        bootIn = r;
      }),
  };
  bridge.warmPeople([uuid(51)]);
  const stop = startSurfaces([slow]);
  try {
    await settle();
    assert.deepEqual(asked(), [], "REGRESSION: the read went out beside the boot's own");
    bootIn();
    await settle();
    await settle();
    assert.deepEqual(asked(), [uuid(51)], "and once the boot is in, it goes");
  } finally {
    stop();
  }
});

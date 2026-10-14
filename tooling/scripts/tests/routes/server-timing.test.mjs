/**
 * Every /api/v1 answer says how long its session check and its handler took (server/server-timing.ts, with-route.ts;
 * 25 Sep 2026): a Server-Timing header the browser's timing panel and field data read. Measured on production, a
 * person's read took 773 ms alone and 3,236 among the boot's, and nothing on the wire said where the time went.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { serverTimingHeader } = await importSrc("apps/dashboard/src/server/server-timing.ts");

test("one part per name, in the order given, whole milliseconds, never below zero", () => {
  assert.equal(serverTimingHeader({ auth: 12.4, app: 310.6 }), "auth;dur=12, app;dur=311");
  assert.equal(serverTimingHeader({ app: -3 }), "app;dur=0", "a clock that went backwards says nothing false");
  assert.equal(serverTimingHeader({ app: Number.NaN }), "app;dur=0");
  assert.equal(serverTimingHeader({}), "");
});

/* -------------------- where the handler's time went (decision 0053) -------------------- */

const path = await import("node:path");
const { fileURLToPath, pathToFileURL } = await import("node:url");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { withRequestId, noteTiming, requestTimings } = await import("@chanlytics/channels");
const { namedFetch, observeDb } = await import("@chanlytics/db");
const { readerContext, load } = await import(at("apps/dashboard/src/server/readers/index.ts"));

test("the handler's shares follow its two parts: the longest first, each with how many, at most eight, as tokens", () => {
  const shares = new Map([
    ["db", { ms: 95.6, n: 7 }],
    ["read.conversations", { ms: 80.2, n: 1 }],
    ["read.calls", { ms: 12, n: 1 }],
  ]);
  assert.equal(
    serverTimingHeader({ auth: 1, app: 120 }, shares),
    'auth;dur=1, app;dur=120, db;dur=96;desc="7", read.conversations;dur=80;desc="1", read.calls;dur=12;desc="1"',
  );
  const many = new Map(Array.from({ length: 12 }, (_, i) => [`read.r${i}`, { ms: i, n: 1 }]));
  const said = serverTimingHeader({}, many).split(", ");
  assert.equal(said.length, 8, "the eight longest, so the header stays a line");
  assert.equal(said[0], 'read.r11;dur=11;desc="1"');
  assert.equal(
    serverTimingHeader({}, new Map([["read.a b/c", { ms: 3, n: 1 }]])),
    'read.a-b-c;dur=3;desc="1"',
    "a name is written as a header token, whatever it was written with",
  );
});

test("a request keeps the time of each name it spent it on, added up and counted; outside one nothing is kept", async () => {
  noteTiming("db", 50);
  assert.equal(requestTimings().size, 0, "no request, no ledger");
  const timings = await withRequestId("rq-1", async () => {
    noteTiming("db", 5);
    noteTiming("db", 7.5);
    noteTiming("read.metrics", 3);
    noteTiming("db", Number.NaN);
    noteTiming("db", -1);
    return requestTimings();
  });
  assert.deepEqual(Object.fromEntries(timings), { db: { ms: 12.5, n: 2 }, "read.metrics": { ms: 3, n: 1 } });
  assert.equal(await withRequestId("rq-2", async () => requestTimings().size), 0, "each request its own");
});

test("the database client times each call it makes inside a request, and none outside one (packages/db namedFetch)", async () => {
  const slot = Symbol.for("chanlytics.db.observer");
  const was = globalThis[slot];
  const heard = [];
  try {
    observeDb({
      log: { info() {}, warn() {}, error() {} },
      requestId: () => "rq-db",
      timed: (ms) => heard.push(ms),
    });
    const send = namedFetch(async () => new Response("{}"));
    await send("http://db.test/rest/v1/x");
    await send("http://db.test/rest/v1/y").catch(() => {});
    await new Promise((r) => setImmediate(r));
    assert.equal(heard.length, 2);
    assert.ok(heard.every((ms) => ms >= 0));
    observeDb({ log: { info() {}, warn() {}, error() {} }, requestId: () => null, timed: (ms) => heard.push(ms) });
    await namedFetch(async () => new Response("{}"))("http://db.test/rest/v1/z");
    await new Promise((r) => setImmediate(r));
    assert.equal(heard.length, 2, "a call outside a request goes as it came");
  } finally {
    globalThis[slot] = was;
  }
});

test("each reader a request reads through is timed under its name, once for the read the turn shares", async () => {
  const reader = {
    name: "slow",
    read: async () => {
      await new Promise((r) => setTimeout(r, 15));
      return { data: 1, rows: [], stamp: 0 };
    },
  };
  const timings = await withRequestId("rq-read", async () => {
    const rc = readerContext({ supabase: {}, userId: "u1" }, { tenantId: "t1", role: "owner" });
    await Promise.all([load(rc, reader, { a: 1 }), load(rc, reader, { a: 1 })]);
    await new Promise((r) => setImmediate(r));
    return requestTimings();
  });
  const slow = timings.get("read.slow");
  assert.equal(slow?.n, 1, "the second ask shares the first's read");
  assert.ok(slow.ms >= 10, `took ${slow.ms} ms`);
});

/* -------------------- what its database calls touched (decision 0058, lane R7) -------------------- */

const { noteTouch, requestTouches } = await import("@chanlytics/channels");
const { touchOfCall } = await import("@chanlytics/db");
const { touchedLine } = await importSrc("apps/dashboard/src/server/server-timing.ts");

test("a call of the database client is the table it touches and how, or the function it calls; nothing else is a touch", () => {
  const rest = "https://db.test/rest/v1";
  assert.deepEqual(touchOfCall(`${rest}/contacts?select=id,name`), { table: "contacts", how: "read" });
  assert.deepEqual(touchOfCall(`${rest}/contacts`, { method: "HEAD" }), { table: "contacts", how: "read" });
  assert.deepEqual(touchOfCall(`${rest}/messages`, { method: "POST" }), { table: "messages", how: "INSERT" });
  assert.deepEqual(
    touchOfCall(`${rest}/policies`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    }),
    { table: "policies", how: "INSERT UPDATE" },
    "an insert that merges on a conflict is an update too",
  );
  assert.deepEqual(touchOfCall(`${rest}/tenants?id=eq.1`, { method: "PATCH" }), { table: "tenants", how: "UPDATE" });
  assert.deepEqual(touchOfCall(`${rest}/segments?id=eq.1`, { method: "DELETE" }), { table: "segments", how: "DELETE" });
  assert.deepEqual(touchOfCall(`${rest}/rpc/merge_contacts`, { method: "POST" }), {
    table: "rpc:merge_contacts",
    how: "call",
  });
  assert.deepEqual(touchOfCall(new URL(`${rest}/calls`)), { table: "calls", how: "read" });
  assert.deepEqual(touchOfCall(new Request(`${rest}/calls`, { method: "PATCH" })), { table: "calls", how: "UPDATE" });
  assert.equal(touchOfCall("https://db.test/auth/v1/user"), null, "the auth server is no table");
  assert.equal(touchOfCall("https://db.test/storage/v1/object/logos/a.png"), null, "nor is storage");
  assert.equal(touchOfCall("not a url at all"), null);
});

test("a request keeps what its calls touched, each table once with every way it was touched; outside one nothing is kept", async () => {
  noteTouch("contacts", "read");
  assert.equal(requestTouches().size, 0, "no request, no record");
  const touched = await withRequestId("rq-touch", async () => {
    noteTouch("contacts", "read");
    noteTouch("contacts", "UPDATE");
    noteTouch("contacts", "read");
    noteTouch("rpc:merge_contacts", "call");
    noteTouch("", "read");
    return requestTouches();
  });
  assert.deepEqual(Object.fromEntries([...touched].map(([t, hows]) => [t, [...hows]])), {
    contacts: ["read", "UPDATE"],
    "rpc:merge_contacts": ["call"],
  });
  assert.equal(await withRequestId("rq-touch-2", async () => requestTouches().size), 0, "each request its own");
});

test("the database client tells what each call inside a request touched, and nothing outside one (packages/db namedFetch)", async () => {
  const slot = Symbol.for("chanlytics.db.observer");
  const was = globalThis[slot];
  const heard = [];
  try {
    observeDb({
      log: { info() {}, warn() {}, error() {} },
      requestId: () => "rq-db",
      touched: (table, how) => heard.push(`${table} ${how}`),
    });
    const send = namedFetch(async () => new Response("{}"));
    await send("http://db.test/rest/v1/contacts?select=id");
    await send("http://db.test/rest/v1/rpc/merge_contacts", { method: "POST" });
    await send("http://db.test/auth/v1/user");
    assert.deepEqual(heard, ["contacts read", "rpc:merge_contacts call"]);
    observeDb({ log: { info() {}, warn() {}, error() {} }, requestId: () => null, touched: (t) => heard.push(t) });
    await namedFetch(async () => new Response("{}"))("http://db.test/rest/v1/z");
    assert.equal(heard.length, 2, "a call outside a request goes as it came");
  } finally {
    globalThis[slot] = was;
  }
});

test("a sample of answers says what it touched, as one line of names, and the page it was asked from without the workspace", () => {
  const touches = new Map([
    ["messages", new Set(["INSERT"])],
    ["contacts", new Set(["read", "INSERT UPDATE"])],
    ["rpc:merge_contacts", new Set(["call"])],
  ]);
  const ids = Array.from({ length: 400 }, (_, i) => `rq-${i}`);
  const said = ids.map((id) => touchedLine(id, touches, "https://app.chanlytics.com/w/studio/inbox"));
  const sampled = said.filter(Boolean);
  assert.ok(sampled.length > 5 && sampled.length < 45, `about one in twenty: ${sampled.length} of 400`);
  assert.deepEqual(
    ids.map((id) => touchedLine(id, touches, null) !== null),
    said.map((s) => s !== null),
    "a request is in the sample or not by its name alone",
  );
  const id = ids[said.findIndex(Boolean)];
  assert.deepEqual(touchedLine(id, touches, "https://app.chanlytics.com/w/studio/inbox"), {
    tables: "contacts:INSERT+UPDATE+read messages:INSERT rpc:merge_contacts:call",
    page: "inbox",
  });
  const pageOf = (referer) => touchedLine(id, touches, referer).page;
  assert.equal(
    pageOf("https://app.chanlytics.com/w/studio/clients/0b9c4f6e-1d2a-4c3b-9e8f-7a6b5c4d3e2f/history"),
    "clients/:id",
  );
  assert.equal(pageOf("https://app.chanlytics.com/w/studio/reports/reviews:2026-09-01~2026-09-20"), "reports/reviews");
  assert.equal(pageOf("https://app.chanlytics.com/w/studio/admin/workspace/calendar"), "admin/workspace");
  assert.equal(pageOf("https://app.chanlytics.com/w/studio/clients/leads:s-1:l-2"), "clients/leads");
  assert.equal(pageOf("https://app.chanlytics.com/w/studio"), "today", "a workspace's own address is Today");
  assert.equal(pageOf("https://app.chanlytics.com/login"), null, "not a page of a workspace");
  assert.equal(pageOf("nonsense"), null);
});

test("the shadow script reads back what a sampled line says: its tables, the line inside a log export, and the route it was", async () => {
  const { lineOf, touchesOf, routeKeyOf } = await importSrc("tooling/scripts/ops/write-shadow.mjs");
  const { ROUTES } = await importSrc("apps/dashboard/src/client/routes.generated.ts");
  const touches = new Map([
    ["contacts", new Set(["read", "INSERT UPDATE"])],
    ["rpc:merge_contacts", new Set(["call"])],
  ]);
  const id = Array.from({ length: 400 }, (_, i) => `rq-${i}`).find((x) => touchedLine(x, touches, null));
  const said = touchedLine(id, touches, null);
  assert.deepEqual(
    Object.fromEntries([...touchesOf(said.tables)].map(([t, hows]) => [t, [...hows].sort()])),
    { contacts: ["INSERT", "UPDATE", "read"], "rpc:merge_contacts": ["call"] },
    "the line's tables, each with how it was touched",
  );
  const line = { event: "route_answered", route: "/api/v1/contacts/c-1/consent", method: "PUT", ...said };
  assert.deepEqual(lineOf(JSON.stringify(line)), line, "the logger's own line");
  assert.deepEqual(lineOf(JSON.stringify({ message: JSON.stringify(line) })), line, "and one a log export carries");
  assert.equal(lineOf("not json"), null);
  assert.equal(routeKeyOf(ROUTES, "PUT", "/api/v1/contacts/c-1/consent"), "PUT contacts/[id]/consent");
  assert.equal(routeKeyOf(ROUTES, "POST", "/api/v1/contacts/import"), "POST contacts/import", "a word before an id");
  assert.equal(routeKeyOf(ROUTES, "PATCH", "/api/v1/workspaces"), "PATCH workspaces");
  assert.equal(routeKeyOf(ROUTES, "GET", "/api/v1/nowhere/at/all"), null);
});

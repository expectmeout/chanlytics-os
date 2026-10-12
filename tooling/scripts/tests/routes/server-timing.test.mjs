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

/**
 * A member's database client shares what an opening asks twice, and gives up on a call the database never answers
 * (apps/dashboard/src/lib/supabase/server.ts; 25 Nov 2026).
 *
 * The two were at odds for an hour: a bound put around the transport hands every call a signal, and a request that
 * answers several reads as one shares a read only where the call carries no signal of its own (packages/db read-once.ts).
 * With the bound around the naming, an opening asked the database every question again: seventeen more calls a load on the
 * nightly's own stack. The bound is beneath the naming, on each call as it is sent.
 *
 * Run through the real client a bearer's request is given, over a transport of the test's own: nothing leaves this process.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { observeDb } from "@chanlytics/db/shared";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { createBearerClient } = await import(at("apps/dashboard/src/lib/supabase/server.ts"));

const realFetch = globalThis.fetch;
const observerSlot = Symbol.for("chanlytics.db.observer");
const realObserver = globalThis[observerSlot];
after(() => {
  globalThis.fetch = realFetch;
  globalThis[observerSlot] = realObserver;
});

/** What this process has seen fail lives on globalThis (packages/db read-again.ts): a test begins with none. */
const forgetDatabaseFailures = () => void (globalThis[Symbol.for("chanlytics.db.failed-at")] = []);

/** A request that shares its reads, as the dashboard's GET open says it does, or one that shares none. */
function serving(shared) {
  observeDb({
    log: { info: () => {}, warn: () => {}, error: () => {} },
    requestId: () => "req-1",
    sharedReads: () => shared,
  });
}

const part = (v) => Buffer.from(v).toString("base64url");
const JWT = [part('{"alg":"ES256"}'), part('{"sub":"u-1"}'), part("signature-signature")].join(".");

test("inside an opening, the same read asked twice reaches the database once, through the client itself", async () => {
  forgetDatabaseFailures();
  serving({});
  const sent = [];
  globalThis.fetch = async (input) => {
    sent.push(String(typeof input === "string" ? input : input.url));
    return new Response('[{"id":"l1"}]', { status: 200, headers: { "content-range": "0-0/*" } });
  };
  const db = createBearerClient(JWT);
  const [one, two] = await Promise.all([db.from("lines").select("id"), db.from("lines").select("id")]);
  assert.deepEqual([one.data, two.data], [[{ id: "l1" }], [{ id: "l1" }]]);
  assert.equal(sent.length, 1, "one call for the two: the bound is on the call sent, not on the question asked");
  // And a request that answers one read asks every time, as it always did.
  serving(null);
  await Promise.all([db.from("lines").select("id"), db.from("lines").select("id")]);
  assert.equal(sent.length, 3);
});

test("the call that is sent carries the bound: the database is given up on, never waited for until the function dies", async () => {
  forgetDatabaseFailures();
  serving({});
  const signals = [];
  globalThis.fetch = async (_input, init) => {
    signals.push(init?.signal ?? null);
    return new Response("[]", { status: 200 });
  };
  const db = createBearerClient(JWT);
  await db.from("lines").select("id");
  assert.equal(signals.length, 1);
  assert.ok(signals[0] instanceof AbortSignal, "a signal of the bound's on what leaves");
  assert.equal(signals[0].aborted, false);
});

test("the client's own three more asks are off: a read the database refuses reaches it twice at most", async () => {
  forgetDatabaseFailures();
  serving(null);
  let sent = 0;
  globalThis.fetch = async () => {
    sent += 1;
    return new Response(JSON.stringify({ message: "upstream" }), { status: 520 });
  };
  const db = createBearerClient(JWT);
  const { error } = await db.from("lines").select("id");
  assert.ok(error, "the caller hears the failure");
  assert.equal(sent, 2, "the read and one more ask, where the client's own retries made it four");
});

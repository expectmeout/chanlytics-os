/**
 * A refusal a core verb throws reaches the owner in the verb's own words and status, through the real route
 * wrapper and the packages as they are built.
 *
 * It did not. Each package's build inlines contracts, so the dashboard holds one AppError in contracts' dist and
 * another inside core's; `withRoute` asked `instanceof` of the first and every core refusal failed it, so an owner
 * snoozing without a date, or replying to someone who had opted out, read "Something went wrong." with a 500
 * (the scorecard of 26 September 2026). Nothing caught it because no test ran a core verb through `withRoute` on
 * the built dists: the tests of the verbs import the source, where there is one class.
 *
 * So this one imports what production loads: core's built dist, and the wrapper over the contracts the dashboard
 * resolves. The session is a stand-in bearer verifier, as auth/bearer.test.mjs does it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setBearerVerifier } = await import(at("apps/dashboard/src/server/bearer.ts"));
const { withRoute } = await import(at("apps/dashboard/src/server/with-route.ts"));
const core = await import(at("packages/core/dist/index.js"));
const contracts = await import(at("packages/contracts/dist/index.js"));
const { AppError } = await import("@chanlytics/contracts");

const part = (v) => Buffer.from(v).toString("base64url");
const JWT = [part('{"alg":"ES256"}'), part('{"sub":"u-1"}'), part("signature-signature")].join(".");
const req = () => new Request("http://localhost/api/v1/x", { headers: { authorization: `Bearer ${JWT}` } });
const signedIn = () => setBearerVerifier(async () => ({ supabase: {}, claims: { sub: "u-1" }, error: null }));

const conv = { id: "c-1", tenant_id: "t-1", paused_until: null, phone_e164: "+15550100001" };
const ports = {
  snooze: async () => ({ ok: true }),
  record: async () => {},
  now: () => Date.parse("2026-09-27T12:00:00Z"),
};

/** The refusal core's built snooze gives for a date in the past: what a route's handler would let escape. */
async function coreRefusal() {
  try {
    await core.snooze(ports, { conv, until: "2026-09-01T00:00:00Z" });
  } catch (e) {
    return e;
  }
  assert.fail("snooze took a date in the past");
}

test("a refusal from core's built dist is an AppError to every copy of the class", async () => {
  const e = await coreRefusal();
  assert.equal(e.code, "validation");
  assert.ok(e instanceof AppError, "to the contracts the dashboard resolves");
  assert.ok(e instanceof contracts.AppError, "to contracts' built dist");
  assert.ok(new contracts.AppError("conflict", "x") instanceof AppError, "and the other way round");
});

test("what is not an AppError is not one: a plain error, or anything shaped like one", () => {
  assert.equal(new Error("x") instanceof AppError, false);
  assert.equal({ code: "validation", status: 400, message: "x", name: "AppError" } instanceof AppError, false);
  assert.equal(null instanceof AppError, false);
  assert.equal("AppError" instanceof AppError, false);
});

test("the mark changes nothing a refusal shows: its fields, its JSON and its keys are what they were", () => {
  const e = new AppError("conflict", "Could not snooze this thread.", 409, { at: 1 });
  // As the class always built: its fields first, then the name its constructor sets.
  assert.deepEqual(Object.keys(e), ["code", "status", "details", "name"]);
  assert.equal(JSON.stringify(e), '{"code":"conflict","status":409,"details":{"at":1},"name":"AppError"}');
  assert.equal(e.name, "AppError");
  assert.ok(e instanceof Error);
});

test("a core verb's refusal, thrown inside the real route wrapper, answers in its own words and status", async () => {
  const prev = signedIn();
  try {
    const handler = withRoute(async () => core.snooze(ports, { conv, until: "2026-09-01T00:00:00Z" }));
    const res = await handler(req(), { params: Promise.resolve({}) });
    const body = await res.json();
    assert.equal(res.status, 400, "the verb's status, not a 500");
    assert.deepEqual(body.error, { code: "validation", message: core.NEEDS_UNTIL });
    assert.equal(res.headers.get("cache-control"), "private, no-store");
  } finally {
    setBearerVerifier(prev);
  }
});

test("an error that is not a refusal is still a 500 that says nothing of its insides", async () => {
  const prev = signedIn();
  try {
    const handler = withRoute(async () => {
      throw new Error("the database said something private");
    });
    const res = await handler(req(), { params: Promise.resolve({}) });
    assert.equal(res.status, 500);
    assert.deepEqual((await res.json()).error, { code: "internal", message: "Something went wrong." });
  } finally {
    setBearerVerifier(prev);
  }
});

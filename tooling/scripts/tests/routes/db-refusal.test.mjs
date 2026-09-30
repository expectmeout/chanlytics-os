/**
 * A database failure reaches the browser as the door's own words or as a try-again, never as Postgres's text (the
 * scorecard's defect 24). Fifteen routes answered any error of the database a 400 "validation" carrying its raw text:
 * a statement timeout, a lost connection or a constraint no door named read to an owner as if they had typed something
 * wrong. `dbRefusal` (with-route.ts) keeps a definer door's refusal, by its SQLSTATE, at the status that says it, and
 * answers anything else `internal` 503 with the text only in the log.
 *
 * Run through the real route wrapper, one class of error at a time, and through one of the fifteen routes whole.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setBearerVerifier } = await import(at("apps/dashboard/src/server/bearer.ts"));
const { withRoute, dbRefusal } = await import(at("apps/dashboard/src/server/with-route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const notifications = await import(at("apps/dashboard/app/api/v1/notifications/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const part = (v) => Buffer.from(v).toString("base64url");
const USER = "u-1";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JWT = [part('{"alg":"ES256"}'), part(`{"sub":"${USER}"}`), part("signature-signature")].join(".");
const RAW = 'canceling statement due to statement timeout on relation "notifications"';

/** A request under the real wrapper, signed in as a stand-in bearer over `supabase`; its status, body and log lines. */
async function answer(handler, { supabase = {}, request } = {}) {
  const prev = setBearerVerifier(async () => ({ supabase, claims: { sub: USER }, error: null }));
  const lines = [];
  const real = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = (text) => lines.push(JSON.parse(text));
  try {
    const res = await handler(
      request ?? new Request("http://localhost/api/v1/x", { headers: { authorization: `Bearer ${JWT}` } }),
      { params: Promise.resolve({}) },
    );
    return { status: res.status, body: await res.json(), lines };
  } finally {
    Object.assign(console, real);
    setBearerVerifier(prev);
  }
}
const throwing = (e, raised) =>
  withRoute(async () => {
    throw dbRefusal(e, raised);
  });

test("a definer door's refusal keeps its words, at the status its SQLSTATE says", async () => {
  for (const [code, want] of [
    ["P0002", { status: 404, code: "not_found" }],
    ["23505", { status: 409, code: "conflict" }],
    ["42501", { status: 403, code: "forbidden" }],
    ["22023", { status: 400, code: "validation" }],
    ["P0001", { status: 400, code: "validation" }],
  ]) {
    const words = `The door's own sentence for ${code}.`;
    const a = await answer(throwing({ code, message: words }));
    assert.equal(a.status, want.status, code);
    assert.deepEqual(a.body.error, { code: want.code, message: words }, code);
    assert.equal(
      a.lines.some((l) => l.event === "db_failed"),
      false,
      `${code} is the door speaking, not a failure`,
    );
  }
});

test("a bare raise (P0001) is answered as the route says, and only it", async () => {
  const conflict = { code: "conflict", status: 409 };
  const raised = await answer(throwing({ code: "P0001", message: "Already asked." }, conflict));
  assert.equal(raised.status, 409);
  assert.deepEqual(raised.body.error, { code: "conflict", message: "Already asked." });
  const unique = await answer(throwing({ code: "23505", message: "That address is taken." }, conflict));
  assert.equal(unique.status, 409, "a unique violation is a conflict whatever the route says");
  const denied = await answer(throwing({ code: "42501", message: "Only an owner can." }, conflict));
  assert.equal(denied.status, 403, "and who may not is forbidden");
});

test("anything else is a try-again: internal 503, the database's text in the log and never in the answer", async () => {
  for (const e of [
    { code: "57014", message: RAW },
    { code: "23514", message: 'new row for relation "contacts" violates check constraint "contacts_email_check"' },
    { code: "08006", message: "connection to server was lost" },
    { message: "TypeError: fetch failed" },
  ]) {
    const a = await answer(throwing(e));
    assert.equal(a.status, 503, e.message);
    assert.deepEqual(a.body.error, { code: "internal", message: "Something went wrong." }, e.message);
    assert.equal(JSON.stringify(a.body).includes(e.message), false, "the raw text never reaches the browser");
    const logged = a.lines.find((l) => l.event === "db_failed");
    assert.ok(logged, `no db_failed line for ${e.message}`);
    assert.equal(logged.error, e.message);
    assert.equal(logged.code, e.code ?? null);
  }
});

test("REGRESSION: one of the fifteen, whole: marking notifications seen through a statement timeout is a 503, not a 400 with Postgres's words", async () => {
  const tables = {
    memberships: [
      { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
    ],
  };
  const timeout = () => {
    throw Object.assign(new Error(RAW), { code: "57014" });
  };
  const supabase = fakeDb(tables, {}, { notifications_seen: timeout });
  setServiceClient(fakeDb(tables));
  const seen = () =>
    new Request(`http://localhost/api/v1/notifications?workspace=${A}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${JWT}`, "content-type": "application/json" },
      body: JSON.stringify({ seen: true }),
    });
  const a = await answer(notifications.PUT, { supabase, request: seen() });
  assert.equal(a.status, 503, JSON.stringify(a.body));
  assert.deepEqual(a.body.error, { code: "internal", message: "Something went wrong." });
  assert.equal(a.lines.find((l) => l.event === "db_failed")?.error, RAW);

  const gone = fakeDb(
    tables,
    {},
    {
      notifications_seen: () => {
        throw Object.assign(new Error("That workspace is not yours."), { code: "42501" });
      },
    },
  );
  const refused = await answer(notifications.PUT, { supabase: gone, request: seen() });
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.body.error, { code: "forbidden", message: "That workspace is not yours." });
});

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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setBearerVerifier } = await import(at("apps/dashboard/src/server/shared/auth/bearer.ts"));
const { withRoute, dbRefusal } = await import(at("apps/dashboard/src/server/shared/with-route.ts"));
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));
const notifications = await import(at("apps/dashboard/app/api/v1/notifications/route.ts"));
const { DbFailure } = await import("@chanlytics/contracts");

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
    // A door's own code (00263, 00331): this person asked to be forgotten. A conflict in the door's words.
    ["PE001", { status: 409, code: "conflict" }],
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

/** A handler whose repository raised the reply it got, labelled for the log (decision 0114). */
const failing = (reply, label) =>
  withRoute(async () => {
    throw new DbFailure(reply, label);
  });

test("a database failure nothing read is answered by its code, in the door's words without the log's label", async () => {
  for (const [code, want] of [
    ["P0002", { status: 404, code: "not_found" }],
    ["23505", { status: 409, code: "conflict" }],
    ["42501", { status: 403, code: "forbidden" }],
    ["22023", { status: 400, code: "validation" }],
    ["PE001", { status: 409, code: "conflict" }],
  ]) {
    const words = `The door's own sentence for ${code}.`;
    const a = await answer(failing({ code, message: words }, "erase_contact"));
    assert.equal(a.status, want.status, code);
    assert.deepEqual(a.body.error, { code: want.code, message: words }, code);
    const line = a.lines.find((l) => l.event === "route_refused");
    assert.equal(line?.code, want.code, `${code}: the refusal is logged as one`);
    assert.equal(line?.db_code, code, "with the database's code");
    assert.equal(line?.error, `erase_contact: ${words}`, "and what was being done");
    assert.equal(
      a.lines.some((l) => l.event === "route_failed"),
      false,
      `${code} is the door speaking, not a fault`,
    );
  }
});

test("Postgres's own sentence is never a person's to read: the code's plain words, and the sentence in the log", async () => {
  for (const [code, raw, words] of [
    ["23505", 'duplicate key value violates unique constraint "contacts_phone_key"', "That already exists."],
    [
      "42501",
      'new row violates row-level security policy for table "contacts"',
      "You do not have permission to do that.",
    ],
    ["42501", "permission denied for table contacts", "You do not have permission to do that."],
    ["P0002", "query returned no rows", "That could not be found."],
  ]) {
    for (const a of [
      await answer(failing({ code, message: raw }, "saving")),
      await answer(throwing({ code, message: raw })),
    ]) {
      assert.equal(a.body.error.message, words, raw);
      assert.equal(JSON.stringify(a.body).includes(raw), false, "the raw text never reaches the browser");
    }
    const line = (await answer(failing({ code, message: raw }, "saving"))).lines.find(
      (l) => l.event === "route_refused",
    );
    assert.equal(line?.error, `saving: ${raw}`);
  }
});

test("any other database failure stays the fault it is: 500, the words every fault gets, its text and stack in the log", async () => {
  for (const reply of [
    { code: "57014", message: RAW },
    { code: "23514", message: 'new row for relation "contacts" violates check constraint "contacts_email_check"' },
    // A bare raise says nothing of what the rule means here, and only a route that knows can say (dbRefusal's `raised`).
    { code: "P0001", message: "scrub_ask_for_contact: owner role required" },
    { message: "TypeError: fetch failed" },
  ]) {
    const a = await answer(failing(reply, "reading"));
    assert.equal(a.status, 500, reply.message);
    assert.deepEqual(a.body.error, { code: "internal", message: "Something went wrong." }, reply.message);
    assert.equal(JSON.stringify(a.body).includes(reply.message), false, "the raw text never reaches the browser");
    const line = a.lines.find((l) => l.event === "route_failed");
    assert.equal(line?.error, `DbFailure: reading: ${reply.message}`);
    assert.match(line?.error_stack ?? "", /^at /, "the line says where it was raised");
  }
});

test("dbRefusal reads a DbFailure's own sentence, never the label a repository wrote ahead of it", async () => {
  const refused = dbRefusal(new DbFailure({ code: "P0002", message: "Contact not found." }, "erase_contact"));
  assert.deepEqual([refused.code, refused.status, refused.message], ["not_found", 404, "Contact not found."]);
  const raised = dbRefusal(new DbFailure({ code: "P0001", message: "Already asked." }, "ask"), {
    code: "conflict",
    status: 409,
  });
  assert.deepEqual([raised.code, raised.status, raised.message], ["conflict", 409, "Already asked."]);
});

test("a DbFailure says what it is in the words it was raised with, and keeps the reply it came from", () => {
  const reply = { code: "P0002", message: "Contact not found.", details: null, hint: null };
  const plain = new DbFailure(reply);
  assert.equal(plain.message, "Contact not found.", "the same sentence a bare re-raise said");
  const labelled = new DbFailure(reply, "erase_contact");
  assert.equal(labelled.message, "erase_contact: Contact not found.", "the same sentence a labelled re-raise said");
  assert.equal(labelled.dbMessage, "Contact not found.");
  assert.equal(labelled.code, "P0002");
  assert.equal(labelled.cause, reply);
  assert.equal(labelled.name, "DbFailure");
  assert.ok(labelled instanceof Error);
  assert.equal(new DbFailure({ message: "no row" }).code, null, "a reply with no code has none");
  assert.equal(JSON.stringify(Object.keys(labelled)).includes("Symbol"), false, "the mark is no field a log writes");
  assert.equal(new Error("x") instanceof DbFailure, false);
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

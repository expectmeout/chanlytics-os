/**
 * A database's refusal reaches a person in the door's words (decision 0114). The rest of this is proved over fakes
 * (routes/db-refusal.test.mjs); this is the one place the real thing is asked, since only a real database can say what a
 * reply carries: a real door's refusal, through a real repository, to the answer a route gives, and Postgres's own
 * sentences against the words that replace them. Local stack only, and it leaves nothing behind.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DbFailure } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY || !ANON
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes a workspace"
      : false;

process.env.NEXT_PUBLIC_SUPABASE_URL ??= URL_ ?? "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const { answerOfThrow, dbRefusal } = await importSrc("apps/dashboard/src/server/shared/with-route.ts");
const { eraseContactRows } = await importSrc("packages/db/src/repositories/erasure/legs.ts");

const service = () => createClient(URL_, KEY, { auth: { persistSession: false } });
const signedOut = () => createClient(URL_, ANON, { auth: { persistSession: false } });
const answered = (thrown) => answerOfThrow(thrown, { route: "/api/v1/probe", started: Date.now() });
const failureOf = (promise) =>
  promise.then(
    () => assert.fail("the database took it"),
    (e) => e,
  );

test("a door's refusal, through its repository, is answered in the door's words at its status", { skip }, async () => {
  const failure = await failureOf(eraseContactRows(service(), randomUUID(), {}));
  assert.ok(failure instanceof DbFailure, String(failure));
  assert.equal(failure.code, "P0002");
  assert.equal(failure.dbMessage, "Contact not found.");
  assert.equal(failure.message, "erase_contact: Contact not found.", "the sentence it always said");
  const { status, body } = answered(failure);
  assert.equal(status, 404);
  assert.deepEqual(body.error, { code: "not_found", message: "Contact not found." });
});

test("a failure no door raises on purpose stays a fault, and its text stays out of the answer", { skip }, async () => {
  const failure = await failureOf(eraseContactRows(service(), "not-a-uuid", {}));
  assert.ok(failure instanceof DbFailure, String(failure));
  assert.equal(failure.code, "22P02", "invalid_text_representation: Postgres's own");
  const { status, body } = answered(failure);
  assert.equal(status, 500);
  assert.deepEqual(body.error, { code: "internal", message: "Something went wrong." });
  assert.equal(JSON.stringify(body).includes("not-a-uuid"), false);
});

test("Postgres's own unique violation names a constraint, so a person reads plain words", { skip }, async () => {
  const db = service();
  const slug = `door-words-${randomUUID()}`;
  const first = await db.from("tenants").insert({ slug, name: "Door words" }).select("id").single();
  assert.equal(first.error, null, first.error?.message);
  try {
    const { error } = await db.from("tenants").insert({ slug, name: "Door words" });
    assert.equal(error?.code, "23505");
    assert.match(
      error.message,
      /^duplicate key value violates unique constraint/,
      "the sentence the words are held to",
    );
    for (const refusal of [answered(new DbFailure(error, "saving")), answered(dbRefusal(error))]) {
      assert.equal(refusal.status, 409);
      assert.deepEqual(refusal.body.error, { code: "conflict", message: "That already exists." });
    }
  } finally {
    await db.from("tenants").delete().eq("id", first.data.id);
  }
});

test("a grant's refusal names a function or a table, so a person reads plain words", { skip }, async () => {
  const anon = signedOut();
  const fn = await anon.rpc("erase_contact", { p_contact_id: randomUUID(), p_legs: {} });
  const table = await anon.from("tenants").insert({ slug: `door-words-${randomUUID()}`, name: "Door words" });
  for (const { error } of [fn, table]) {
    assert.equal(error?.code, "42501", JSON.stringify(error));
    assert.match(
      error.message,
      /^(permission denied for|new row violates row-level security)/,
      "the sentence the words are held to",
    );
    const { status, body } = answered(new DbFailure(error, "acting"));
    assert.equal(status, 403);
    assert.deepEqual(body.error, { code: "forbidden", message: "You do not have permission to do that." });
  }
});

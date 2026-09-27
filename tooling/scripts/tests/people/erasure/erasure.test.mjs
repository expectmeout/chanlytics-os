/**
 * "Delete my data" has to actually delete the data.
 *
 * privacy.html promises deletion on a verified request within 30 days. Three
 * stores hold the customer — Postgres rows, the private media bucket, and the
 * scheduled jobs that would still speak to them — and only the first is
 * reachable by a cascade.
 *
 * There was a fourth, a Vercel Blob object holding the verbatim conversation
 * outside the database, erased by a `blob_thread_erase` job queued before
 * anything was destroyed. The store is gone, the job kind with it (00151), and
 * the assertions that pinned that leg go with them rather than being loosened.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw } from "../../_source.mjs";

// readRaw, NOT readCode. stripComments does not know about SQL `--` comments
// and treats `'` as a string delimiter, so an apostrophe inside a comment
// ("the customer's phone digits") opens a phantom string literal that swallows
// real SQL up to the next apostrophe.
//
// 00151 holds the CURRENT text of erase_contact; 00027 declared it and is
// history. Reading the older file would pin a definition the database does
// not run.
const sql = readRaw("supabase/migrations/00151_jobs_drop_blob_thread_erase.sql");
const statements = sql.replace(/^\s*--.*$/gm, "");

test("the destructive order is collect, then calls, then messages, then the cascade", () => {
  // Letting the contact cascade do the work silently leaves every call row —
  // both call FKs are ON DELETE SET NULL, so the row survives holding
  // from_e164, from_raw, the verbatim transcript and the recording path.
  assert.ok(sql.includes("delete from calls"), "calls must be deleted explicitly");
  assert.ok(sql.indexOf("delete from calls") < sql.indexOf("delete from messages"), "calls before messages");
  assert.ok(
    sql.indexOf("delete from messages") < sql.indexOf("delete from conversations"),
    "messages before the conversation that cascades",
  );
});

test("everything needed to finish the job is collected BEFORE anything is destroyed", () => {
  // The Storage paths live on the rows being deleted: the caller is the only
  // party that can talk to the Storage API, and it is handed them back.
  // Collect after the deletes, and there is nowhere left to look.
  const collected = sql.indexOf("array_agg(distinct q.p)");
  assert.ok(collected > -1, "the collection CTE must exist");
  assert.ok(collected < sql.indexOf("delete from calls"), "collect before the first destructive delete");
});

test("the RPC is a definer that decides the caller for itself", () => {
  assert.match(statements, /security definer/);
  assert.match(statements, /set search_path = public/);
  assert.ok(
    statements.includes(
      "revoke execute on function public.erase_contact(uuid, jsonb) from public, anon, authenticated;",
    ),
    "revoked from every client role first",
  );
  // auth.uid() INSIDE the body — never a parameter a caller could forge.
  assert.match(statements, /v_user\s+uuid := auth\.uid\(\)/);
  assert.ok(!/p_user|p_actor|p_caller/.test(statements), "the actor must not be an argument");
});

test("only an owner of that contact's workspace may erase", () => {
  assert.match(statements, /and m\.role = 'owner'/);
  assert.match(statements, /raise exception 'Only an owner can erase/);
});

test("erasure withdraws every scheduled job that names the person, sparing no kind", () => {
  // One kind used to be spared: the route queued a blob_thread_erase job
  // before the RPC ran, and cancelling it would have cancelled the leg that
  // removed the second copy of the conversation. That store and that kind are
  // gone (00151), so nothing scheduled may still speak to an erased person.
  assert.ok(!/and kind <> /.test(statements), "no kind survives the cancellation now");
  assert.ok(
    statements.includes("set state = 'canceled', last_error = 'contact erased'"),
    "the scheduled work is withdrawn, with a reason on the row",
  );
  for (const key of ["conversation_id", "message_id", "contact_id"]) {
    assert.ok(statements.includes(`payload->>'${key}'`), `matched by ${key}`);
  }
});

test("a second erasure of the same contact is a no-op, not a second destruction", () => {
  // The guard is the tombstone the first run wrote. It answers, rather than
  // running the destructive half again -- which is what lets the route
  // re-drive the legs it runs itself without destroying anything twice.
  const guard = statements.indexOf("if v_erased is not null then");
  assert.ok(guard > -1, "the already-erased branch must exist");
  assert.ok(statements.indexOf("'already_erased', true", guard) > guard, "and it answers rather than repeating");
  assert.ok(guard < statements.indexOf("delete from calls"), "before anything destructive");
});

test("the merge-pointer cleanup is scoped to the tenant", () => {
  // Inside a SECURITY DEFINER, an unscoped predicate reaches every tenant.
  assert.ok(statements.includes("where tenant_id = v_tenant and merged_into_contact_id = p_contact_id"));
});

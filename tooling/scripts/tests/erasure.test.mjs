/**
 * "Delete my data" has to actually delete the data.
 *
 * privacy.html promises deletion on a verified request within 30 days. Four
 * stores hold the customer — Postgres rows, the private media bucket, the
 * Vercel Blob thread, and the scheduled jobs that would still speak to them —
 * and only the first is reachable by a cascade.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRaw } from "./_source.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "../../..");

// readRaw, NOT readCode. stripComments does not know about SQL `--` comments
// and treats `'` as a string delimiter, so an apostrophe inside a comment
// ("the customer's phone digits") opens a phantom string literal that swallows
// real SQL up to the next apostrophe.
const sql = readRaw("supabase/migrations/00027_erase_contact.sql");
const statements = sql.replace(/^\s*--.*$/gm, "");

test("the destructive order is collect, then calls, then messages, then the cascade", () => {
  // Letting the contact cascade do the work silently leaves every call row —
  // both call FKs are ON DELETE SET NULL, so the row survives holding
  // from_e164, from_raw, the verbatim transcript and the recording path.
  assert.ok(sql.includes("delete from calls"), "calls must be deleted explicitly");
  assert.ok(
    sql.indexOf("delete from calls") < sql.indexOf("delete from messages"),
    "calls before messages",
  );
  assert.ok(
    sql.indexOf("delete from messages") < sql.indexOf("delete from conversations"),
    "messages before the conversation that cascades",
  );
});

test("everything needed to finish the job is collected BEFORE anything is destroyed", () => {
  // The Blob key is the customer's phone digits and the Storage paths live on
  // the rows being deleted. Collect after, and there is nowhere left to look.
  const collected = Math.max(
    sql.indexOf("array_agg(distinct s.d)"),
    sql.indexOf("array_agg(distinct q.p)"),
  );
  assert.ok(collected > -1, "the collection CTEs must exist");
  assert.ok(collected < sql.indexOf("delete from"), "collect before the first delete");
});

test("the RPC is a definer that decides the caller for itself", () => {
  assert.match(statements, /security definer/);
  assert.match(statements, /set search_path = public/);
  assert.ok(
    statements.includes("revoke execute on function public.erase_contact(uuid, jsonb) from public, anon, authenticated;"),
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

test("erasure does not cancel the job that finishes it", () => {
  // The route queues blob_thread_erase BEFORE the RPC runs, because after the
  // tombstone the thread key cannot be recomputed. The RPC then cancels every
  // scheduled job naming this conversation — which matched the erase job
  // itself, so the Blob copy was never deleted. The job is due at once and
  // only a 'scheduled' job can be claimed, so whether it survived was a race.
  assert.ok(
    statements.includes("and kind <> 'blob_thread_erase'"),
    "the erase job must be excluded from the cancellation",
  );
});

test("a second erasure of the same contact is a no-op, not a second destruction", () => {
  assert.ok(statements.includes("and c.erased_at is null"));
});

test("the merge-pointer cleanup is scoped to the tenant", () => {
  // Inside a SECURITY DEFINER, an unscoped predicate reaches every tenant.
  assert.ok(
    statements.includes("where tenant_id = v_tenant and merged_into_contact_id = p_contact_id"),
  );
});

/* ------------------------- the Blob leg, for real ------------------------- */

const { saveThread, getThread, deleteThread, threadNamespace } = await import(
  pathToFileURL(path.join(ROOT, "apps/edge/lib/store.ts")).href
);

test("deleting a thread leaves an EMPTY thread, not an unknown one", () => {
  // A deleted thread that reads back as `unknown` is indistinguishable from a
  // read failure, and saveThread refuses to persist an unknown state — so the
  // erased history could be resurrected by the next save.
  const ns = threadNamespace("11111111-1111-1111-1111-111111111111");
  const id = "13475559001";
  return (async () => {
    await saveThread(ns, id, { history: [{ role: "user", content: "x" }], seen: ["wamid.1"], pausedUntil: 0, replies: [] });
    assert.equal(await deleteThread(ns, id), true);
    const after = await getThread(ns, id);
    assert.deepEqual(after.seen, []);
    assert.equal(after.pausedUntil, 0);
    assert.equal(after.unknown, undefined);
  })();
});

/* --------------------------- the handler itself --------------------------- */

const { dispatchJob } = await import(pathToFileURL(path.join(ROOT, "packages/jobs/dist/index.js")).href);

function stubDb() {
  const ops = [];
  const chain = (table, op, arg) => {
    ops.push({ table, op, arg });
    const self = {
      eq: () => self,
      then: (res) => Promise.resolve({ data: null, error: null }).then(res),
    };
    return self;
  };
  return {
    ops,
    from: (table) => ({
      update: (arg) => chain(table, "update", arg),
      insert: (arg) => chain(table, "insert", arg),
    }),
  };
}

const job = {
  id: "j1",
  tenant_id: "t1",
  kind: "blob_thread_erase",
  payload: { contact_id: "c1", namespace: "t1", thread_ids: ["13475550199", "13475550200"] },
};

test("the handler erases every thread, scrubs the digits, and writes the ledger", async () => {
  const db = stubDb();
  const erased = [];
  const ctx = {
    db,
    waCfg: {},
    alert: async () => {},
    eraseThread: async (ns, id) => { erased.push([ns, id]); return true; },
  };
  assert.equal(await dispatchJob(ctx, job), "done");
  assert.deepEqual(erased, [["t1", "13475550199"], ["t1", "13475550200"]]);

  // The payload carried the phone digits, because that IS the Blob key. Once
  // the objects are gone it is a durable copy of the identifier we were asked
  // to erase, in a table whose rows are never deleted.
  const scrub = db.ops.find((o) => o.table === "jobs" && o.op === "update");
  assert.ok(scrub, "the payload must be scrubbed");
  assert.equal(scrub.arg.payload.scrubbed, true);
  assert.equal(scrub.arg.payload.thread_ids, undefined);

  const decision = db.ops.find((o) => o.table === "decisions" && o.op === "insert");
  assert.ok(decision);
  assert.equal(decision.arg.subject_type, "contact");
  assert.equal(decision.arg.verb, "erase");
  assert.equal(decision.arg.actor_type, "system");
  const evt = db.ops.find((o) => o.table === "events" && o.op === "insert");
  assert.equal(evt.arg.kind, "contact.blob_erased");
});

test("a runner with no thread store FAILS rather than reporting success", async () => {
  // The important one. Reporting "done" without a store would leave the
  // customer's verbatim conversation in Blob while the owner has been told it
  // was erased. The type requires the store now; this is what a runner that
  // got past the type anyway must still do.
  const ctx = { db: stubDb(), waCfg: {}, alert: async () => {} };
  await assert.rejects(dispatchJob(ctx, job));
});

test("one undeleted thread fails the job and writes no ledger row", async () => {
  const db = stubDb();
  let n = 0;
  const ctx = {
    db, waCfg: {}, alert: async () => {},
    eraseThread: async () => { n += 1; return n === 1; },
  };
  await assert.rejects(dispatchJob(ctx, job), /not deleted/);
  assert.equal(db.ops.find((o) => o.table === "decisions"), undefined, "no ledger row for an unfinished leg");
});

test("an already-scrubbed payload is a no-op, so a retry writes no second ledger row", async () => {
  const db = stubDb();
  const ctx = { db, waCfg: {}, alert: async () => {}, eraseThread: async () => true };
  assert.equal(
    await dispatchJob(ctx, { ...job, payload: { contact_id: "c1", namespace: "t1", scrubbed: true } }),
    "done",
  );
  assert.equal(db.ops.length, 0);
});

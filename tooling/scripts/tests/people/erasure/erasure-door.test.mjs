/**
 * The erasure door's order, step by step (DELETE /api/v1/contacts/:id).
 *
 * The route's comment says ORDER IS THE DESIGN: the keys read, then the block, then the copies keyed on the number,
 * then Storage, then the rows in one transaction, then the best-effort legs and the late sweep. Every leg before the
 * rows fails closed, so the request is a retry with nothing to undo; every leg after them is best effort, because the
 * person IS erased by then. A re-drive of an erased person repeats the id-keyed legs and says which of them held.
 *
 * Run over one database in memory, which is both the session's client and the service client (the block and the jobs
 * scrub), with a Storage bucket that records what it was asked to remove. people-routes.test.mjs holds the refusals
 * and the key reads; this holds what comes after them.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));
const person = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "11111111-1111-4111-8111-111111111111";
const REC = `${A}/calls/c1.mp3`;
const LATE = `${A}/late/c9.mp3`;

/**
 * An owner erasing P1, who has a call recording and an address, a finished job that carried their number, two
 * scheduled ones that name them, and a policy row.
 * `faults` are the fake's; `storage` answers each remove() in turn; `rpcs` overrides erase_contact or the Ask scrub.
 */
async function erase({ erased = false, faults = {}, storage = [], rpcs = {} } = {}) {
  const tables = {
    memberships: [
      { user_id: "u1", tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
    ],
    contacts: [
      {
        id: P1,
        tenant_id: A,
        phone_e164: erased ? null : "+15550100123",
        email: erased ? null : "Ada@Example.com",
        erased_at: erased ? "2026-09-01T00:00:00.000Z" : null,
        erasing_since: null,
      },
    ],
    contact_identities: [],
    calls: [{ id: "c1", contact_id: P1, recording: { storage_path: REC } }],
    messages: [],
    jobs: [
      { id: "j1", tenant_id: A, state: "done", payload: { to_phone: "+15550100123", body: "hello" } },
      { id: "j2", tenant_id: A, state: "scheduled", payload: { contact_id: P1, body: "see you" } },
      { id: "j3", tenant_id: A, state: "scheduled", payload: { to_email: "ada@example.com", body: "by mail" } },
    ],
    policies: [{ tenant_id: A, class: "reply", subject_type: "contact", subject_id: P1, mode: "off" }],
    decisions: [],
  };
  const removed = [];
  const db = fakeDb(tables, faults, {
    scrub_ask_for_contact: () => 2,
    erase_contact: () => ({ counts: { calls: 1 }, storage_paths: [REC], jobs_canceled: 0 }),
    ...rpcs,
  });
  db.storage = {
    from: () => ({
      remove: async (paths) => {
        const answer = storage[removed.length] ?? {};
        removed.push(paths);
        return answer.error
          ? { data: null, error: { message: answer.error } }
          : { data: paths.map((name) => ({ name })), error: null };
      },
    }),
  };
  setServiceClient(db);
  const ctx = { supabase: db, userId: "u1", email: "owner@example.com", metadata: {}, params: { id: P1 } };
  try {
    const out = await person.DELETE.run(new Request("http://localhost/api/v1/x", { method: "DELETE" }), ctx).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    // Every write and call, in order: `<table>.<op>` or `rpc:<name>`, with Storage's removes where they happened.
    const steps = db.seen
      .filter((s) => s.rpc || ["insert", "update", "delete"].includes(s.op))
      .map((s) => (s.rpc ? `rpc:${s.rpc}` : `${s.table}.${s.op}`));
    return { ...out, steps, removed, tables };
  } finally {
    setServiceClient(null);
  }
}

test("an erasure runs its legs in the design's order: the block, the copies, Storage, the rows, then the rest", async () => {
  const { value, steps, removed, tables } = await erase();
  assert.deepEqual(steps, [
    "contacts.update", // the block, with the number still on the row
    "rpc:scrub_ask_for_contact", // the copies keyed on the number, before anything is destroyed
    "jobs.update", // the finished job only
    "rpc:erase_contact", // the rows, after Storage
    "policies.delete",
    "rpc:scrub_ask_for_contact",
    "jobs.update", // every state now, by the id and by every identifier: the scheduled ones
    "jobs.update",
  ]);
  assert.deepEqual(removed, [[REC]], "Storage once, before the rows; nothing late to sweep");
  assert.deepEqual(value, {
    contact_id: P1,
    erased: true,
    counts: { calls: 1 },
    jobs_canceled: 0,
    storage: { requested: 1, removed: 1, error: null },
  });
  assert.equal(tables.policies.length, 0, "the person's own receptionist setting goes with them");
  assert.deepEqual(
    tables.jobs.map((j) => [j.id, j.payload.reason ?? j.payload.body]),
    [
      ["j1", "contact erased"],
      ["j2", "contact erased"],
      ["j3", "contact erased"],
    ],
    "the finished job by its number first, then the rest by the id and the address",
  );
});

test("every leg before the rows fails closed: a 500 that says nothing was deleted, and erase_contact never runs", async () => {
  const cases = {
    "the block": [{ faults: { "contacts.update": { message: "denied" } } }, /being erased, so nothing was deleted/],
    "the Ask pre-scrub": [
      {
        rpcs: {
          scrub_ask_for_contact: () => {
            throw new Error("refused");
          },
        },
      },
      /memory of this person could not be scrubbed, so nothing was deleted/,
    ],
    "the jobs pre-scrub": [
      { faults: { "jobs.select": { message: "timeout" } } },
      /finished jobs .* could not be scrubbed, so nothing was deleted/,
    ],
    Storage: [{ storage: [{ error: "unavailable" }] }, /Nothing has been deleted, and repeating this request/],
  };
  for (const [leg, [world, words]] of Object.entries(cases)) {
    const { error, steps, tables } = await erase(world);
    assert.equal(error?.code, "internal", leg);
    assert.equal(error.status, 500, leg);
    assert.match(error.message, words, leg);
    assert.ok(!steps.includes("rpc:erase_contact"), `${leg}: the rows are untouched`);
    assert.equal(tables.policies.length, 1, `${leg}: nothing after it ran`);
  }
});

test("past the rows every leg is best effort, and a late recording is swept and written to the ledger", async () => {
  const late = await erase({
    faults: { "policies.delete": { message: "rls" } },
    rpcs: { erase_contact: () => ({ counts: {}, storage_paths: [REC, LATE], jobs_canceled: 1 }) },
  });
  assert.equal(late.value.erased, true, "a policy row that would not go does not undo an erasure");
  assert.deepEqual(late.removed, [[REC], [LATE]], "the path erase_contact saw and the route did not");
  assert.deepEqual(late.value.storage, { requested: 2, removed: 2, error: null });
  assert.equal(late.value.jobs_canceled, 1);
  assert.deepEqual(late.tables.decisions[0].payload, { leg: "storage_sweep", requested: 1, removed: 1, error: null });

  const failed = await erase({
    rpcs: { erase_contact: () => ({ storage_paths: [LATE] }) },
    storage: [{}, { error: "x" }],
  });
  assert.equal(failed.value.erased, true);
  assert.deepEqual(failed.value.counts, {});
  assert.deepEqual(failed.value.storage, { requested: 2, removed: 1, error: "x" }, "the sweep's refusal is reported");
});

test("a re-drive of an erased person repeats the id-keyed legs and says which of them held", async () => {
  const held = await erase({ erased: true });
  assert.deepEqual(held.steps, ["policies.delete", "rpc:scrub_ask_for_contact", "jobs.update"]);
  assert.deepEqual(held.value, {
    contact_id: P1,
    already_erased: true,
    erased_at: "2026-09-01T00:00:00.000Z",
    redriven: { policy: true, ask: true, jobs: 1 },
  });
  assert.deepEqual(held.removed, [], "nothing destroyed twice");

  const refused = await erase({
    erased: true,
    faults: { "policies.delete": { message: "rls" }, "jobs.select": { message: "timeout" } },
    rpcs: {
      scrub_ask_for_contact: () => {
        throw new Error("refused");
      },
    },
  });
  assert.deepEqual(refused.value.redriven, { policy: false, ask: false, jobs: 0 });
});

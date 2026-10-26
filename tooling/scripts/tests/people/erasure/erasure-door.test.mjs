/**
 * The erasure door's order, step by step (DELETE /api/v1/contacts/:id).
 *
 * The route's comment says ORDER IS THE DESIGN: the keys read, then the block, then the copies keyed on the number,
 * then Storage, then the rows in one transaction, then the best-effort legs and the late sweep. Every leg before the
 * rows fails closed, so the request is a retry with nothing to undo; every leg after them is best effort, because the
 * person IS erased by then. A leg that stops it before any copy is gone says nothing was deleted; each copy leg commits
 * on its own, so one that stops it after the Ask scrub says what stays removed. A re-drive of an erased person repeats
 * the id-keyed legs and says which of them held.
 *
 * Run over one database in memory, which is both the session's client and the service client (the block, Storage, and
 * the jobs, deliveries, notes and turns scrubs), with a Storage bucket that records what it was asked to remove.
 * people-routes.test.mjs holds the refusals and the key reads; this holds what comes after them.
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
 * `faults` are the fake's; `storage` answers each remove() in turn; `rpcs` overrides erase_contact, the Ask scrub or
 * the kept deliveries' scrub (provider_events_scrub, 00336), or the scrub of other people's notes (person_notes_scrub, 00341).
 * `tables` is a world an erasure before this one left, as the owner's second press of delete finds it.
 */
async function erase({ erased = false, faults = {}, storage = [], rpcs = {}, tables: left } = {}) {
  // Each erasure on a limiter of its own: the bucket allows five an hour, and a test here runs more than that.
  setRateStore(memoryStore());
  const tables = left ?? {
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
    provider_events_scrub: () => 1,
    person_notes_scrub: () => 1,
    model_turns_scrub: () => 1,
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
    "rpc:erasure_digests", // the digests the block keeps, the database's own (00263)
    "contacts.update", // the block, with the number still on the row
    "rpc:scrub_ask_for_contact", // the copies keyed on the number, before anything is destroyed
    "jobs.update", // the finished job only
    "rpc:provider_events_scrub", // the deliveries the intake ledger keeps a week, by the same identifiers (00336)
    "rpc:person_notes_scrub", // other people's notes, the needle overwritten in place (00341)
    "rpc:model_turns_scrub", // the receptionist's kept turns that name them, in anyone's thread (00401)
    "rpc:erase_contact", // the rows, after Storage
    "policies.delete",
    "rpc:scrub_ask_for_contact",
    "jobs.update", // every state now, by the id and by every identifier: the scheduled ones
    "jobs.update",
    "rpc:provider_events_scrub", // a delivery kept while the erasure ran
    "rpc:person_notes_scrub", // a note written while it ran
    "rpc:model_turns_scrub", // a turn the receptionist took while it ran
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

/** A scrub the database refused. */
const refused = () => {
  throw new Error("refused");
};

/** The legs that remove or overwrite a copy of the person, each committing on its own, in the order they run. */
const COPY_LEGS = [
  "rpc:scrub_ask_for_contact",
  "jobs.update",
  "rpc:provider_events_scrub",
  "rpc:person_notes_scrub",
  "rpc:model_turns_scrub",
];

test("a leg that stops an erasure before any copy is gone says nothing was deleted: the block, and the Ask scrub, which commits whole", async () => {
  const cases = {
    "the block": [{ faults: { "contacts.update": { message: "denied" } } }, [], /being erased, so nothing was deleted/],
    // The one call it makes is the one the database refused, and one function commits whole or not at all.
    "the Ask pre-scrub": [
      { rpcs: { scrub_ask_for_contact: refused } },
      ["rpc:scrub_ask_for_contact"],
      /memory of this person could not be scrubbed, so nothing was deleted/,
    ],
  };
  for (const [leg, [world, tried, words]] of Object.entries(cases)) {
    const { error, steps, tables } = await erase(world);
    assert.equal(error?.code, "internal", leg);
    assert.equal(error.status, 500, leg);
    assert.match(error.message, words, leg);
    assert.deepEqual(
      steps.filter((s) => COPY_LEGS.includes(s)),
      tried,
      `${leg}: no copy was removed`,
    );
    assert.equal(tables.jobs[0].payload.to_phone, "+15550100123", `${leg}: the finished job is as it was`);
    assert.ok(!steps.includes("rpc:erase_contact"), `${leg}: the rows are untouched`);
    assert.equal(tables.policies.length, 1, `${leg}: nothing after it ran`);
  }
});

test("REGRESSION: a leg that stopped an erasure after the Ask scrub said nothing was deleted, while the legs before it had removed the person's copies for good -- it says what stays removed, and deleting again finishes", async () => {
  // Each case: the world that stops it, what it could not do, and whether the finished job was scrubbed before it.
  const cases = {
    // Stopped at its read, before it overwrote a job.
    "the jobs pre-scrub": [
      { faults: { "jobs.select": { message: "timeout" } } },
      /^The finished jobs that carried this person's number could not be scrubbed/,
      false,
    ],
    "the kept deliveries' pre-scrub": [
      { rpcs: { provider_events_scrub: refused } },
      /^The deliveries kept for replay that carried this person's number could not be scrubbed/,
      true,
    ],
    "the notes' pre-scrub": [
      { rpcs: { person_notes_scrub: refused } },
      /^The notes that carried this person's number or address could not be scrubbed/,
      true,
    ],
    "the kept turns' pre-scrub": [
      { rpcs: { model_turns_scrub: refused } },
      /^The receptionist's kept turns that named this person could not be scrubbed/,
      true,
    ],
    Storage: [{ storage: [{ error: "unavailable" }] }, /^The stored recordings and media could not be removed/, true],
  };
  for (const [leg, [world, what, jobScrubbed]] of Object.entries(cases)) {
    const { error, steps, tables } = await erase(world);
    assert.equal(error?.code, "internal", leg);
    assert.equal(error.status, 500, leg);
    assert.match(error.message, what, leg);
    assert.ok(steps.includes("rpc:scrub_ask_for_contact"), `${leg}: the Ask scrub had run, and committed`);
    // What a leg before the stop removed is gone already, before any second press: the finished job's number.
    const [job] = tables.jobs;
    if (jobScrubbed) assert.equal(job.payload.reason, "contact erased", `${leg}: the finished job stays scrubbed`);
    else assert.equal(job.payload.to_phone, "+15550100123", `${leg}: the finished job is as it was`);
    assert.doesNotMatch(
      error.message,
      /nothing (was|has been) deleted/i,
      `REGRESSION: ${leg} said nothing was deleted`,
    );
    assert.match(
      error.message,
      /, so the erasure stopped partway\. What it had already removed stays removed, and nothing more was deleted\. Delete them again to finish\.$/,
      leg,
    );
    assert.ok(!steps.includes("rpc:erase_contact"), `${leg}: the rows are untouched`);
    assert.equal(tables.policies.length, 1, `${leg}: nothing after it ran`);
    assert.ok(tables.contacts[0].erasing_since, `${leg}: the person is held meanwhile`);
    assert.equal(tables.contacts[0].erased_at, null, `${leg}: and still there to delete again`);

    // The owner deletes them again, the refusal passed: the erasure finishes over what the first press left.
    const again = await erase({ tables });
    assert.equal(again.value?.erased, true, `${leg}: deleting again finishes`);
    assert.equal(tables.jobs[0].payload.reason, "contact erased", `${leg}: the finished job scrubbed on the way`);
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

  // A row that names another workspace's object (a member could write one before 00260) never has it removed here.
  const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/calls/theirs.mp3";
  const foreign = await erase({
    rpcs: { erase_contact: () => ({ counts: {}, storage_paths: [REC, THEIRS, `${A}/../x.mp3`], jobs_canceled: 0 }) },
  });
  assert.equal(foreign.value.erased, true);
  assert.deepEqual(foreign.removed, [[REC]], "only this workspace's own objects are removed");

  const failed = await erase({
    rpcs: { erase_contact: () => ({ storage_paths: [LATE] }) },
    storage: [{}, { error: "x" }],
  });
  assert.equal(failed.value.erased, true);
  assert.deepEqual(failed.value.counts, {});
  assert.deepEqual(failed.value.storage, { requested: 2, removed: 1, error: "x" }, "the sweep's refusal is reported");

  // The kept deliveries' second pass refused: the person is erased, and the week's purge takes what it left.
  let passes = 0;
  const kept = await erase({
    rpcs: {
      provider_events_scrub: () => {
        if (passes++) throw new Error("refused");
        return 1;
      },
    },
  });
  assert.equal(
    kept.value.erased,
    true,
    "a kept delivery that would not go on the second pass does not undo an erasure",
  );
  assert.equal(passes, 2, "scrubbed before the rows, and tried again after them");

  // A database before 00336 has no intake ledger: nothing is kept to scrub, so the dashboard may deploy first.
  const before = await erase({
    rpcs: {
      provider_events_scrub: () => {
        throw Object.assign(new Error("Could not find the function public.provider_events_scrub"), {
          code: "PGRST202",
        });
      },
    },
  });
  assert.equal(before.value.erased, true, "no ledger yet is nothing to scrub, never a refused erasure");

  // The notes' second pass refused, and a database before 00341 with no notes scrub: neither undoes an erasure.
  let notePasses = 0;
  const notes = await erase({
    rpcs: {
      person_notes_scrub: () => {
        if (notePasses++) throw new Error("refused");
        return 1;
      },
    },
  });
  assert.equal(notes.value.erased, true, "a note that would not scrub on the second pass does not undo an erasure");
  assert.equal(notePasses, 2, "scrubbed before the rows, and tried again after them");
  const older = await erase({
    rpcs: {
      person_notes_scrub: () => {
        throw Object.assign(new Error("Could not find the function public.person_notes_scrub"), { code: "PGRST202" });
      },
    },
  });
  assert.equal(older.value.erased, true, "no scrub yet leaves the notes as they were, never a refused erasure");

  // The receptionist's kept turns (00401), on the same terms: refused on the second pass, or on a database before
  // 00401 with no turns to scrub, the erasure stands.
  let turnPasses = 0;
  const turns = await erase({
    rpcs: {
      model_turns_scrub: () => {
        if (turnPasses++) throw new Error("refused");
        return 1;
      },
    },
  });
  assert.equal(turns.value.erased, true, "a turn that would not scrub on the second pass does not undo an erasure");
  assert.equal(turnPasses, 2, "scrubbed before the rows, and tried again after them");
  const noTurns = await erase({
    rpcs: {
      model_turns_scrub: () => {
        throw Object.assign(new Error("Could not find the function public.model_turns_scrub"), { code: "PGRST202" });
      },
    },
  });
  assert.equal(noTurns.value.erased, true, "a database that keeps no turns has none to scrub, never a refused erasure");
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

  const failed = await erase({
    erased: true,
    faults: { "policies.delete": { message: "rls" }, "jobs.select": { message: "timeout" } },
    rpcs: { scrub_ask_for_contact: refused },
  });
  assert.deepEqual(failed.value.redriven, { policy: false, ask: false, jobs: 0 });
});

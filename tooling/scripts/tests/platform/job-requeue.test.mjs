/**
 * The ledger's dead letters: a failed job run again from the back office (POST /api/v1/platform/jobs/requeue).
 *
 * A job that failed for good (its last try threw, or its kind was unknown for a day) is a row in `failed`, final
 * (jobs_guard), kept ninety days. When the cause is fixed, support runs it again: a fresh row of its kind and payload,
 * due now, with who asked written first. Run here as the door runs it: the real route module behind its admin check,
 * and the real verb over a ledger in memory. What is proved is what the ledger holds afterwards and what was recorded
 * before it, not the words of the source.
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
const { setRateStore, memoryStore, RATE } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { platformJobRequeue } = await import(at("apps/dashboard/src/server/platform/platform.ts"));
const requeue = await import(at("apps/dashboard/app/api/v1/platform/jobs/requeue/route.ts"));
const { requeueFailedJob } = await import(at("packages/jobs/src/schedule.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const J = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ctx = { userId: "u1", email: "ada@example.com" };

/** A ledger with one job in workspace A, and the events table the record goes to. */
function ledger(job = {}, { faults = {}, unique = [] } = {}) {
  const tables = {
    jobs: [
      {
        id: J,
        tenant_id: A,
        kind: "email_ingest",
        state: "failed",
        payload: { email_id: "e-1" },
        due_at: "2026-09-29T10:00:00.000Z",
        created_at: "2026-09-29T09:00:00.000Z",
        last_error: "the key was restricted",
        ...job,
      },
    ],
    events: [],
  };
  const db = fakeDb(tables, faults, {}, { uniqueIndexes: unique });
  return { db, tables, office: { db, session: db } };
}

/** The order the ledger and the events saw their writes in. */
const order = (db) => db.seen.filter((s) => s.op === "insert").map((s) => s.table);

test("the door is on the platform scope with a support ceiling of its own, and asks for a workspace and a job", () => {
  assert.deepEqual(requeue.POST.policy, {
    kind: "write",
    scope: "platform",
    role: null,
    rate: "platform_job_requeue",
    spend: false,
  });
  assert.equal(RATE.platform_job_requeue.limit, 60);
});

test("a failed job is run again as a fresh row of its kind and payload, due now, and who asked is written first", async () => {
  const l = ledger();
  const before = Date.now();
  const out = await platformJobRequeue(l.office, ctx, A, J);
  assert.deepEqual(out, { ok: true, job_id: J, kind: "email_ingest" });

  assert.deepEqual(
    order(l.db),
    ["events", "jobs"],
    "the record, then the row: a record that cannot be written stops it",
  );
  assert.equal(l.tables.events.length, 1);
  const [event] = l.tables.events;
  assert.equal(event.kind, "platform.acted");
  assert.equal(event.tenant_id, A);
  assert.equal(event.subject_id, J);
  assert.deepEqual(event.data, { action: "requeue:email_ingest", by: "u1", by_email: "ada@example.com" });

  assert.equal(l.tables.jobs.length, 2, "beside the failed one, which stays as the record of what went wrong");
  const [failed, again] = l.tables.jobs;
  assert.deepEqual([failed.id, failed.state, failed.last_error], [J, "failed", "the key was restricted"]);
  assert.equal(again.tenant_id, A);
  assert.equal(again.kind, "email_ingest");
  assert.deepEqual(again.payload, { email_id: "e-1" });
  assert.ok(Date.parse(again.due_at) >= before - 1000 && Date.parse(again.due_at) <= Date.now() + 1000, "due now");
});

test("a job of another workspace is not found there, and nothing is recorded or run", async () => {
  const l = ledger();
  await assert.rejects(platformJobRequeue(l.office, ctx, B, J), (e) => e.code === "not_found" && e.status === 404);
  await assert.rejects(
    platformJobRequeue(l.office, ctx, A, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"),
    (e) => e.code === "not_found",
  );
  assert.deepEqual([l.tables.events, l.tables.jobs.length], [[], 1]);
});

test("only a failed job is run again: one still waiting, running or done is refused with its state", async () => {
  for (const state of ["scheduled", "fired", "done", "canceled"]) {
    const l = ledger({ state });
    await assert.rejects(
      platformJobRequeue(l.office, ctx, A, J),
      (e) => e.code === "conflict" && e.status === 409 && e.message.includes(`is ${state}, not failed`),
      state,
    );
    assert.deepEqual([l.tables.events, l.tables.jobs.length], [[], 1], `${state}: nothing recorded, nothing run`);
  }
});

test("work that speaks to a person is never run again from here: it may have reached them, and goes again from its thread or its broadcast", async () => {
  for (const kind of ["outbound_send", "broadcast_send"]) {
    const l = ledger({ kind, payload: { message_id: "m-1", broadcast_id: "b-1" } });
    await assert.rejects(
      platformJobRequeue(l.office, ctx, A, J),
      (e) => e.code === "conflict" && e.message.includes("never run again from here"),
      kind,
    );
    assert.deepEqual([l.tables.events, l.tables.jobs.length], [[], 1], `${kind}: nothing recorded, nothing run`);
  }
});

test("a kind this deploy does not know waits for the deploy that does", async () => {
  const l = ledger({ kind: "made_up_kind" });
  await assert.rejects(
    platformJobRequeue(l.office, ctx, A, J),
    (e) => e.code === "conflict" && e.message.includes("does not know that kind"),
  );
  assert.deepEqual([l.tables.events, l.tables.jobs.length], [[], 1]);
});

test("a record that cannot be written leaves nothing run: an act on somebody else's business nobody can be held to did not happen", async () => {
  const l = ledger({}, { faults: { "events.insert": { message: "connection reset" } } });
  await assert.rejects(
    platformJobRequeue(l.office, ctx, A, J),
    (e) => e.code === "internal" && e.status === 503 && e.message.includes("so it was not done"),
  );
  assert.equal(l.tables.jobs.length, 1, "no row was made");
});

test("work the ledger holds once per subject answers that it is on the ledger again already, rather than making a second", async () => {
  const l = ledger(
    { kind: "reply_read", payload: { message_id: "m-9", stage: "first" } },
    {
      unique: [
        {
          table: "jobs",
          name: "jobs_reply_read_once",
          key: (r) => `${r.payload?.message_id}:${r.payload?.stage}`,
          where: (r) => r.kind === "reply_read" && r.state !== "failed",
        },
      ],
    },
  );
  // The same reading was scheduled again after the failure, and is waiting.
  l.tables.jobs.push({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    tenant_id: A,
    kind: "reply_read",
    state: "scheduled",
    payload: { message_id: "m-9", stage: "first" },
    due_at: "2026-09-29T11:00:00.000Z",
  });
  await assert.rejects(
    platformJobRequeue(l.office, ctx, A, J),
    (e) => e.code === "conflict" && e.message.includes("on the ledger again already"),
  );
  assert.equal(l.tables.jobs.length, 2, "no second row for the same subject");
});

test("a dead letter is run again once: a second press, or a second person, finds the copy the first left and makes no other", async () => {
  const l = ledger();
  await platformJobRequeue(l.office, ctx, A, J);
  for (let again = 0; again < 2; again += 1)
    await assert.rejects(
      platformJobRequeue(l.office, ctx, A, J),
      (e) => e.code === "conflict" && e.message.includes("on the ledger again already"),
    );
  assert.equal(l.tables.jobs.length, 2, "one failed row and one copy, however many times it was pressed");

  // A copy that itself failed does not count: the work can be run again, and the second copy is a fresh row.
  const copy = l.tables.jobs.find((j) => j.id !== J);
  copy.state = "failed";
  const third = await platformJobRequeue(l.office, ctx, A, J);
  assert.deepEqual(third, { ok: true, job_id: J, kind: "email_ingest" });
  assert.equal(l.tables.jobs.length, 3);

  // Another payload of the same kind is another piece of work, not a copy.
  const other = ledger();
  other.tables.jobs.push({
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    tenant_id: A,
    kind: "email_ingest",
    state: "scheduled",
    payload: { email_id: "e-2" },
    due_at: "2026-09-29T11:00:00.000Z",
    created_at: "2026-09-29T10:30:00.000Z",
  });
  await platformJobRequeue(other.office, ctx, A, J);
  assert.equal(other.tables.jobs.length, 3);
});

test("the verb hands back what it did as data, and calls record only for a row it will make", async () => {
  const recorded = [];
  const l = ledger();
  const made = await requeueFailedJob(l.db, A, J, async (kind) => void recorded.push(kind));
  assert.deepEqual(made, { outcome: "requeued", kind: "email_ingest" });
  assert.deepEqual(recorded, ["email_ingest"]);

  const none = [];
  const refused = await requeueFailedJob(ledger({ state: "done" }).db, A, J, async (kind) => void none.push(kind));
  assert.deepEqual(refused, { outcome: "not_failed", state: "done" });
  assert.deepEqual(none, [], "a job it refuses is never recorded as run again");

  const boom = ledger();
  await assert.rejects(
    requeueFailedJob(boom.db, A, J, async () => {
      throw new Error("could not record");
    }),
    /could not record/,
  );
  assert.equal(boom.tables.jobs.length, 1, "and a record that throws leaves the row unmade");
});

test("the route asks the database whether this session is a platform admin, and answers a stranger as it answers any missing page", async () => {
  const supabase = fakeDb({}, {}, { is_platform_admin: () => false });
  await assert.rejects(
    requeue.POST.run(new Request("http://localhost/api/v1/x", { method: "POST", body: "{}" }), {
      supabase,
      ...ctx,
      params: {},
    }),
    (e) => e.code === "not_found" && e.status === 404,
  );
});

test("an admin who names no workspace or no job, or one that cannot exist, is told which, as the lines' doors tell it", async () => {
  const supabase = fakeDb({}, {}, { is_platform_admin: () => true });
  const post = (body) =>
    requeue.POST.run(new Request("http://localhost/api/v1/x", { method: "POST", body: JSON.stringify(body) }), {
      supabase,
      ...ctx,
      params: {},
    });
  const missing = (what) => (e) =>
    e.code === "not_found" && e.status === 404 && e.message === `That ${what} does not exist.`;
  await assert.rejects(post({ job_id: J }), missing("workspace"));
  await assert.rejects(post({ tenant_id: A }), missing("job"));
  await assert.rejects(post({ tenant_id: "not-an-id", job_id: J }), missing("workspace"));
});

/**
 * What a job leaves saying it is still going is made final whichever way the job ends (decision 0089): its last try
 * threw, a run died and the ledger gave up, or nothing knew its kind. The handlers used to settle on a thrown last try
 * alone, so a run killed on it (the ceiling, a crash, a deploy) left an import "running" and a preview "building" for
 * ever. Every ending now reaches the kind's settler (tick.ts conclude → settle.ts SETTLERS), and each settler writes its
 * subject's end over the database in memory.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { JOB_KINDS } from "../../packages/contracts/src/shared/enums.ts";
import { runTick } from "../../packages/jobs/src/runner/tick.ts";
import { MAX_ATTEMPTS, UNKNOWN_KIND_GIVE_UP_MS } from "../../packages/jobs/src/runner/ledger.ts";
import { settleJob } from "../../packages/jobs/src/runner/settle.ts";
import { KIND_POLICY } from "../../packages/jobs/src/runner/kinds.ts";
import { VIDEO_LOOK_EDITION } from "../../packages/contracts/src/files/look.ts";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OPTS = { claimForMs: 20_000, yieldAtMs: 45_000, leaseSeconds: 90 };

/** A tick over one job whose run ends `how`, recording what reached the settle port. */
async function endOne(kind, how) {
  const job = {
    id: `j-${kind}`,
    tenant_id: T,
    kind,
    payload: {},
    due_at: new Date(0).toISOString(),
    attempts: how === "died" ? MAX_ATTEMPTS + 1 : how === "threw" ? MAX_ATTEMPTS : 1,
    ...(how === "died" && KIND_POLICY[kind]?.speaks ? { attempts: 2 } : {}),
  };
  let claimed = false;
  const settled = [];
  await runTick(
    {
      claim: async () => (claimed ? null : ((claimed = true), job)),
      dispatch: async () => {
        if (how === "unknown") return "unknown_kind";
        throw new Error("the provider's bad minute");
      },
      complete: async () => true,
      fail: async () => true,
      defer: async () => true,
      deferUnknown: async () => true,
      settle: async (j, certain) => {
        settled.push([j.id, certain]);
        return [];
      },
      alert: async () => {},
      page: async () => {},
      log: { info() {}, warn() {}, error() {} },
      // A kind nobody has known for a day is failed as never run: the clock is a day past its due time.
      now: () => (how === "unknown" ? UNKNOWN_KIND_GIVE_UP_MS + 1 : 0),
      random: () => 0,
    },
    OPTS,
  );
  return settled;
}

test("every kind's every ending reaches its settle once: the last try's throw, a death the ledger gives up on, a kind nobody knew", async () => {
  for (const kind of JOB_KINDS)
    for (const how of ["threw", "died", "unknown"]) {
      const settled = await endOne(kind, how);
      assert.equal(settled.length, 1, `${kind}, ${how}: settled once`);
      assert.equal(settled[0][1], how === "unknown", `${kind}, ${how}: certain only when it provably never ran`);
    }
});

test("a preview that will not be built is marked failed, so a send waiting on it is skipped with why", async () => {
  const asked = [];
  const db = fakeDb({}, {}, { preview_built: (a) => (asked.push(a), true) });
  const out = await settleJob(
    db,
    { id: "j", kind: "preview_build", tenant_id: T, payload: { preview_id: "p1" } },
    false,
  );
  assert.deepEqual(asked, [{ p_id: "p1", p_ok: false, p_why: "build_failed" }]);
  assert.deepEqual(out, [{ what: "preview", changed: true }]);
});

test("a video's digest that will not hear it goes on to its look; one that will not draw its sheet stops saying Looking", async () => {
  const F = "ffffffff-0000-4000-8000-000000000001";
  for (const step of ["audio", "words", "note"]) {
    const tables = { jobs: [] };
    const kept = [];
    const db = fakeDb(tables, {}, { file_look_keep: (a) => (kept.push(a), null) });
    const out = await settleJob(
      db,
      { id: "j", kind: "video_digest", tenant_id: T, payload: { file_id: F, step, edition: "1" } },
      false,
    );
    assert.deepEqual(out, [{ what: "file", changed: true }]);
    assert.deepEqual(
      tables.jobs.map((j) => [j.kind, j.payload]),
      [["file_look", { file_id: F, edition: String(VIDEO_LOOK_EDITION) }]],
      `${step}: the look goes ahead on the sheet alone`,
    );
    assert.deepEqual(kept, [], `${step}: and the row is not said to have failed`);
  }
  const tables = { jobs: [] };
  const kept = [];
  const db = fakeDb(tables, {}, { file_look_keep: (a) => (kept.push(a), null) });
  await settleJob(db, { id: "j", kind: "video_digest", tenant_id: T, payload: { file_id: F, step: "sheet" } }, false);
  assert.equal(kept.length, 1, "a sheet that will not be drawn leaves nothing to look at");
  assert.equal(kept[0].p_status, "failed");
  assert.deepEqual(tables.jobs, []);
});

test("a part of a connection's history that will not come in says it stopped on its source's row, with Try again", async () => {
  const noted = [];
  const db = fakeDb({}, {}, { import_ledger_note: (a) => (noted.push(a), null) });
  const out = await settleJob(
    db,
    {
      id: "j",
      kind: "history_import",
      tenant_id: T,
      payload: { source: "mailbox", seq: "run-7:3", connection_id: "mb-1" },
    },
    false,
  );
  assert.equal(noted.length, 1);
  assert.equal(noted[0].p_source, "mailbox");
  assert.equal(noted[0].p_state, "failed");
  assert.deepEqual(out, [{ what: "import", changed: true }]);
});

test("a booking notice whose read died is held for a person unless the ledger already keeps it, never over a read that ended", async () => {
  const tables = { appointment_notices: [] };
  const db = fakeDb(tables);
  const job = { id: "j", kind: "booking_read", tenant_id: T, payload: { received_id: "r1", tool: "square" } };
  assert.deepEqual(await settleJob(db, job, false), [{ what: "notice", changed: true }]);
  assert.deepEqual(
    tables.appointment_notices.map((n) => [n.notice_id, n.outcome, n.hold_reason]),
    [["r1", "held", "unreadable"]],
  );
  // A read that had written its booking before the run died keeps what it wrote.
  tables.appointment_notices[0].outcome = "booked";
  assert.deepEqual(await settleJob(db, job, false), [{ what: "notice", changed: false }]);
  assert.equal(tables.appointment_notices[0].outcome, "booked");
});

test("a delivery whose run died is settled failed, so Deliver again reaches it; one its subscriber settled is left", async () => {
  const delivery = (state) => ({
    tenant_id: T,
    event_id: "e1",
    subscriber: "owner_notice",
    kind: "x.y",
    state,
    attempts: 1,
    last_error: null,
  });
  const job = {
    id: "j",
    kind: "event_deliver",
    tenant_id: T,
    payload: { event_id: "e1", subscriber: "owner_notice", kind: "x.y" },
  };
  const open = { event_deliveries: [delivery("scheduled")] };
  assert.deepEqual(await settleJob(fakeDb(open), job, false), [{ what: "delivery", changed: true }]);
  assert.equal(open.event_deliveries[0].state, "failed");
  const done = { event_deliveries: [delivery("done")] };
  assert.deepEqual(await settleJob(fakeDb(done), job, false), [{ what: "delivery", changed: false }]);
  assert.equal(done.event_deliveries[0].state, "done");
});

test("a settler that throws is said as what could not be written, never thrown over the job's failure", async () => {
  const db = fakeDb(
    {},
    {},
    {
      preview_built: () => {
        throw new Error("statement timeout");
      },
    },
  );
  const out = await settleJob(
    db,
    { id: "j", kind: "preview_build", tenant_id: T, payload: { preview_id: "p1" } },
    false,
  );
  assert.equal(out[0].what, "preview");
  assert.match(out[0].error, /statement timeout/);
});

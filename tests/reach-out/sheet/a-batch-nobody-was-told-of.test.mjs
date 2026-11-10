/**
 * A batch nobody was told of (cold email, Before each batch). The run's verb asks two things of the edge
 * (packages/core/src/campaigns/run-reach-out.ts; apps/edge/lib/campaigns/reach-out/run-context.ts answers): was its
 * owner told the batch goes, and, when they were not, does the run now wait for their OK. Run over the fake database
 * with the real bell (shared/alerts/notify.ts notifyOnceAs) and a stubbed mail provider: told is the row on the bell,
 * whatever became of its mail; a row that could not be kept is not told; a hold moves a scheduled run to waiting and
 * no other; and neither answer ever throws, each failure is written down and answered false.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../../_fake-db.mjs";
import { holdBatchForOk } from "@chanlytics/db/campaigns";

const { getReachOutRunContext } = await import("../../../apps/edge/lib/campaigns/reach-out/run-context.ts");

const T = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const STEP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const RUN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const NOW = new Date("2026-11-10T14:00:00Z");
const FIRST_AT = NOW.getTime() + 30 * 60_000;

/** A run as the table holds it: scheduled, a reach-out's. */
const run = (over = {}) => ({
  id: RUN,
  tenant_id: T,
  state: "scheduled",
  recipient_count: 12,
  audience: { kind: "reach_out", root_id: STEP, step_id: STEP },
  ...over,
});

/** A first step of a chain, an email step, running. */
const stepRow = () => ({
  id: STEP,
  sequence_id: STEP,
  tenant_id: T,
  name: "Movers",
  trigger: "lead_first",
  state: "running",
  lead_search_id: null,
  include_unconfirmed: false,
  after_step_id: null,
  after_days: null,
  gap_minutes: 0,
  mailbox_ids: [],
  owner_sends: false,
  cap_per_run: 20,
  words_ok_at: null,
  hand: null,
  template_id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  template_name: "movers_first",
  template_language: "en",
});

/** The workspace's world: its run, its bell, and (when given) the addresses its notices are mailed to. */
function world({ runs = [run()], mailTo = null, faults = {} } = {}) {
  const tables = {
    tenants: [{ id: T, timezone: "America/New_York", status: "active" }],
    sequence_batches: runs,
    tenant_config: mailTo ? [{ tenant_id: T, config: { notifications: mailTo } }] : [],
    tenant_channels: [],
    notifications: [],
    jobs: [],
  };
  return { tables, db: fakeDb(tables, faults) };
}

/** The run's ports as the edge builds them, with everything the edge logs while `fn` runs. */
async function withPorts(w, fn) {
  const lines = [];
  const was = { log: console.log, warn: console.warn, error: console.error };
  const hear = (...a) => lines.push(a.map(String).join(" "));
  console.log = console.warn = console.error = hear;
  try {
    const ctx = await getReachOutRunContext(w.db, stepRow(), NOW);
    assert.ok(!("error" in ctx), `the context builds: ${JSON.stringify(ctx)}`);
    return { answer: await fn(ctx.ports), lines };
  } finally {
    Object.assign(console, was);
  }
}

/** Resend, stubbed: each mail recorded, answered with `status`. */
function provider(status) {
  const mails = [];
  const was = globalThis.fetch;
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "re_test_key";
  globalThis.fetch = async (url, init) => {
    mails.push(JSON.parse(init.body));
    return new Response(status === 200 ? "{}" : "down", { status });
  };
  const restore = () => {
    globalThis.fetch = was;
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
  };
  return { mails, restore };
}

/* ------------------------------------------------------------ the hold itself */

test("a scheduled run moves to waiting on its owner's yes, and answers its id", async () => {
  const w = world();
  const { data, error } = await holdBatchForOk(w.db, T, RUN);
  assert.equal(error, null);
  assert.deepEqual(data, [{ id: RUN }]);
  assert.equal(w.tables.sequence_batches[0].state, "pending_approval");
});

test("a run that is no longer scheduled stays as it is, and answers none", async () => {
  for (const state of ["sending", "sent", "canceled", "pending_approval"]) {
    const w = world({ runs: [run({ state })] });
    const { data, error } = await holdBatchForOk(w.db, T, RUN);
    assert.equal(error, null);
    assert.deepEqual(data, [], state);
    assert.equal(w.tables.sequence_batches[0].state, state);
  }
});

test("another workspace's run is never moved", async () => {
  const w = world({ runs: [run({ tenant_id: OTHER })] });
  const { data } = await holdBatchForOk(w.db, T, RUN);
  assert.deepEqual(data, []);
  assert.equal(w.tables.sequence_batches[0].state, "scheduled");
});

/* ------------------------------------------------------- was its owner told */

test("told is the row on the bell: a batch that goes is said once, with its run", async () => {
  const w = world();
  const { answer } = await withPorts(w, (ports) => ports.notifyGoes(RUN, 12, FIRST_AT));
  assert.equal(answer, true);
  assert.deepEqual(
    w.tables.notifications.map((n) => [
      n.kind,
      n.subject_type,
      n.subject_id,
      n.title.startsWith("Campaign “Movers” sends"),
    ]),
    [["playbook", "broadcast", RUN, true]],
  );
});

test("a mail that failed costs the batch nothing: the row is on the bell, so its owner was told", async () => {
  const w = world({ mailTo: { escalation_emails: ["owner@harbor.example"], from: "alerts@harbor.example" } });
  const p = provider(500);
  try {
    const { answer } = await withPorts(w, (ports) => ports.notifyGoes(RUN, 12, FIRST_AT));
    assert.equal(answer, true);
    assert.equal(p.mails.length, 1, "the mail was tried");
    assert.equal(w.tables.notifications.length, 1, "and its row stays");
  } finally {
    p.restore();
  }
});

test("a row the bell could not keep is not told, and never a throw", async () => {
  const w = world({ faults: { "notifications.insert": { message: "the bell is down" } } });
  const { answer } = await withPorts(w, (ports) => ports.notifyGoes(RUN, 12, FIRST_AT));
  assert.equal(answer, false);
  assert.equal(w.tables.notifications.length, 0);
});

/* --------------------------------------------------- does it wait for its OK */

test("the hold answers true once the run waits for its owner's OK", async () => {
  const w = world();
  const { answer } = await withPorts(w, (ports) => ports.holdForOk(RUN));
  assert.equal(answer, true);
  assert.equal(w.tables.sequence_batches[0].state, "pending_approval");
});

test("a run that already moved on is not held: the hold answers false", async () => {
  const w = world({ runs: [run({ state: "sending" })] });
  const { answer } = await withPorts(w, (ports) => ports.holdForOk(RUN));
  assert.equal(answer, false);
  assert.equal(w.tables.sequence_batches[0].state, "sending");
});

test("a hold the database refuses answers false and is written down, never a throw", async () => {
  const w = world({ faults: { "sequence_batches.update": { message: "the database is down" } } });
  const { answer, lines } = await withPorts(w, (ports) => ports.holdForOk(RUN));
  assert.equal(answer, false);
  assert.equal(w.tables.sequence_batches[0].state, "scheduled");
  assert.ok(
    lines.some((l) => l.includes("cannot hold an untold batch") && l.includes("the database is down")),
    `the failure is on the log with what it knows: ${lines.join(" | ")}`,
  );
});

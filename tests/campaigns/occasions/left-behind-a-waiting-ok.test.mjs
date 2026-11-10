/**
 * Someone who runs out of time behind a step's first OK is not left in silence (decision 0119).
 *
 * While a step's words are new, one batch waits for the owner's OK and the people after it wait behind it, ten minutes at a
 * time. One whose own time passes meanwhile (a reminder's visit began, or a day went by) is left with nothing sent, and
 * nothing told the owner that the wait was costing people: the first batch said it waited, and that was all. The door that
 * settles a workspace's due occasions (apps/edge/lib/campaigns/occasions/due.ts) now tells them, once per waiting batch.
 *
 * Run on the real door over a database in memory, with the notice's own door handed in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { visitOccasion } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { importSrc } from "../../_source.mjs";

const { runDueOccasions } = await importSrc("apps/edge/lib/campaigns/occasions/due.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQ = "5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e";
const BATCH = "b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0";
const HOUR = 3_600_000;
/** Tuesday 10 November 2026, 3:05 PM in New York. */
const NOW = new Date("2026-11-10T20:05:00.000Z");

/** The two-hour reminder, its words not yet seen going: its first batch waits for an OK. */
const step = (over = {}) => ({
  id: SEQ,
  tenant_id: T,
  sequence_id: SEQ,
  kind: "moment",
  name: "Two-hour reminder",
  trigger: "visit_soon",
  template_id: "tpl-1",
  template_name: "two_hour_reminder",
  template_language: "en_US",
  params: [],
  policy_class: "booking",
  state: "running",
  run_hour: 10,
  mode: "auto",
  words_ok_at: null,
  ...over,
});

/** A booked visit of one person's, and the occasion its reminder was made for: due two hours before its start. */
function visitOf(n, startsAt, over = {}) {
  const id = `a${n}a${n}a${n}a${n}-0000-4000-8000-00000000000${n}`;
  const contact = `c${n}c${n}c${n}c${n}-0000-4000-8000-00000000000${n}`;
  return {
    appointment: {
      id,
      tenant_id: T,
      contact_id: contact,
      status: "booked",
      starts_at: new Date(startsAt).toISOString(),
      vanished_at: null,
      title: "Colour",
      service: null,
      all_day: false,
      source: "booking",
      external_id: null,
      created_at: new Date(startsAt - 48 * HOUR).toISOString(),
      ...over,
    },
    due: {
      id: `0${n}0${n}0${n}0${n}-0000-4000-8000-00000000000${n}`,
      sequence_id: SEQ,
      contact_id: contact,
      occasion: visitOccasion(id, startsAt),
      due_at: new Date(startsAt - 2 * HOUR).toISOString(),
      created_at: new Date(startsAt - 48 * HOUR).toISOString(),
    },
  };
}

/** One job's world: what is due, the appointments on record, and whether a batch of the step waits. */
function world({ visits, waiting = true, its = step() }) {
  const tables = {
    appointments: visits.map((v) => v.appointment),
    sequence_occasions: visits.map((v) => ({ ...v.due, tenant_id: T, state: "waiting", why: null, settled_at: null })),
    sequence_batches: waiting ? [{ id: BATCH, tenant_id: T, step_id: SEQ, state: "pending_approval" }] : [],
  };
  const db = fakeDb(
    tables,
    {},
    { sequence_occasions_due: () => visits.map((v) => ({ ...v.due, step: its, runs: true })) },
  );
  const told = [];
  const logged = [];
  const log = {
    info: (event, fields) => logged.push([event, fields]),
    error: (event, fields) => logged.push([event, fields]),
  };
  const run = () =>
    runDueOccasions(
      { db, tenantId: T, now: NOW, until: Date.now() + 60_000, log },
      // Nobody here is run: each is judged gone before the run is asked for anything.
      async () => ({}),
      async (_db, tenantId, msg) => {
        told.push([tenantId, msg]);
        return true;
      },
    );
  return { tables, told, logged, run };
}

/** Two people whose visits began minutes ago, their reminders put off behind the batch that waits. */
const begun = () => [visitOf(1, NOW.getTime() - 5 * 60_000), visitOf(2, NOW.getTime() - 60_000)];

test("people whose visit began while the step's first OK waited are left, and the owner is told once for the batch that waits: who it is costing, and where to end the wait", async () => {
  const w = world({ visits: begun() });
  const out = await w.run();
  assert.deepEqual([out.due, out.left, out.sent, out.held], [2, 2, 0, 0]);
  assert.deepEqual(
    w.tables.sequence_occasions.map((o) => [o.state, o.why]),
    [
      ["left", "visit_begun"],
      ["left", "visit_begun"],
    ],
  );
  assert.equal(w.told.length, 1, "one notice for the two of them");
  const [tenantId, msg] = w.told[0];
  assert.equal(tenantId, T);
  assert.equal(msg.subject, "“Two-hour reminder” is skipping people while it waits for your OK");
  assert.equal(
    msg.body,
    "2 people’s messages did not go: “Two-hour reminder” still waits for your first OK of its words, and their time passed while it waited. Nothing later sends it in its place. Each person after them is skipped the same way until you approve or skip the one that waits, from your Inbox or Today.",
  );
  // Told once a waiting batch, under its own name, and its row opens that batch.
  assert.equal(msg.onceKey, `occasions-behind:${BATCH}`);
  assert.deepEqual(msg.about, { type: "broadcast", id: BATCH });
  assert.equal(msg.kind, "playbook");
  assert.ok(msg.route.includes(BATCH), msg.route);
});

test("one person says it of one person", async () => {
  const w = world({ visits: begun().slice(0, 1) });
  await w.run();
  assert.ok(w.told[0][1].body.startsWith("1 person’s message did not go:"), w.told[0][1].body);
});

test("one found more than a day past its time behind a waiting OK is told the same way", async () => {
  // A follow-up owed yesterday morning: no visit to begin, a day went by while the words waited.
  const late = visitOf(3, NOW.getTime() - 30 * HOUR);
  const w = world({ visits: [late], its: step({ trigger: "asked_no_booking", name: "Booking follow-up" }) });
  const out = await w.run();
  assert.equal(out.left, 1);
  assert.deepEqual(
    w.tables.sequence_occasions.map((o) => o.why),
    ["too_late"],
  );
  assert.equal(w.told.length, 1);
  assert.ok(w.told[0][1].subject.startsWith("“Booking follow-up” is skipping people"));
});

test("nobody is told where it was not the wait: the words have their OK, no batch waits, or the visit is gone", async () => {
  // Its words were seen going: someone found after their visit began was late for another reason.
  const okd = world({ visits: begun(), its: step({ words_ok_at: "2026-11-01T10:00:00.000Z" }) });
  assert.equal((await okd.run()).left, 2);
  assert.deepEqual(okd.told, []);

  // No batch of the step waits: nothing stood in front of them.
  const none = world({ visits: begun(), waiting: false });
  assert.equal((await none.run()).left, 2);
  assert.deepEqual(none.told, []);

  // A visit cancelled is no reminder owed, whatever waits.
  const cancelled = world({ visits: [visitOf(4, NOW.getTime() + HOUR, { status: "cancelled" })] });
  assert.equal((await cancelled.run()).left, 1);
  assert.deepEqual(
    cancelled.tables.sequence_occasions.map((o) => o.why),
    ["visit_gone"],
  );
  assert.deepEqual(cancelled.told, []);
});

test("a notice that cannot be sent is logged and the job still answers: the people are left either way", async () => {
  const w = world({ visits: begun() });
  const out = await runDueOccasions(
    {
      db: fakeDb(
        w.tables,
        {},
        { sequence_occasions_due: () => begun().map((v) => ({ ...v.due, step: step(), runs: true })) },
      ),
      tenantId: T,
      now: NOW,
      until: Date.now() + 60_000,
      log: { info() {}, error: (event) => w.logged.push(event) },
    },
    async () => ({}),
    async () => {
      throw new Error("the mail is down");
    },
  );
  assert.equal(out.left, 2);
  assert.ok(w.logged.includes("occasions_behind_untold"), JSON.stringify(w.logged));
});

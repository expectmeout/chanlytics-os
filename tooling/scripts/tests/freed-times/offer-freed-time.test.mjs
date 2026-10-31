/**
 * The edge's offer of a freed time (decision 0082, apps/edge/lib/calendar/freed-time-offer.ts), over a database in
 * memory: the workspace's running step on `slot_opened` runs for the time through the run the sweep and Run now use
 * (lib/playbooks.ts runPlaybook), and its batch keeps the time it offers and the appointment that freed it; a second ask
 * answers that batch and runs nothing; no step, a paused step and a paused workspace ask nothing; the run's outcome is
 * the answer (nobody to offer it to, a run that was off), and a run that failed throws so the delivery tries again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, numberHealth } from "@chanlytics/contracts";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

const { offerFreedTime } = await importSrc("apps/edge/lib/calendar/freed-time-offer.ts");
const { CONTEXT_PAUSED } = await importSrc("apps/edge/lib/playbooks.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQ = "5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e";
const STEP = "57575757-5757-4575-8575-575757575757";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const TZ = "America/New_York";
/** Sunday 6 September 2026, 10:00 AM in New York: inside the sending hours. */
const NOW = new Date("2026-09-06T14:00:00Z");
const D = 86_400_000;
/** Tuesday 8 September, 3:00 to 4:00 PM in New York: the time a cancellation freed. */
const FREED = { from: APPT, start: Date.parse("2026-09-08T19:00:00Z"), end: Date.parse("2026-09-08T20:00:00Z") };

/** Someone who asked and never booked, and when they were last in touch. */
const asker = (id, daysAgo) => ({
  id,
  state: "quiet",
  hasChat: true,
  calls: 0,
  phone: `+1555010${id.charCodeAt(0) % 100}`,
  consent: {
    state: "opted_in",
    dnc: false,
    label: "Opted in",
    sub: "",
    source: "in_person",
    marketing: "opted_in",
    marketingSource: "in_person",
    marketingSub: "",
  },
  askedNotBooked: true,
  lastContact: { ts: NOW.getTime() - daysAgo * D, label: "" },
  heardDays: daysAgo,
});

/** The step on `slot_opened`, as the owner turned it on: its words seen going, its sequence sending on its own. */
const step = (over = {}) => ({
  id: STEP,
  tenant_id: T,
  sequence_id: SEQ,
  kind: "moment",
  name: "Fill a cancellation",
  trigger: "slot_opened",
  template_id: "tpl-whatsapp",
  template_name: "time_freed",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "freed_when" }],
  policy_class: "follow_up",
  state: "running",
  run_hour: 10,
  cap_per_run: 4,
  gap_days: 7,
  cadence_days: 30,
  created_by: "owner-1",
  last_run_for: null,
  last_run_at: null,
  words_ok_at: "2026-09-01T10:00:00.000Z",
  created_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
  ...over,
});

/**
 * A workspace with its sequence (in `mode`), its step and Meta's approved message; the run context the offer loads is
 * these people, counted each time it is loaded.
 */
function world({ steps = [step()], mode = "auto", people = [asker("a", 2), asker("b", 1)], load } = {}) {
  const tables = {
    sequences: [{ id: SEQ, tenant_id: T, name: "Fill a cancellation", mode, created_at: "2026-09-01T10:00:00.000Z" }],
    sequence_steps: steps,
    sequence_batches: [],
    sequence_sends: [],
    templates: [
      {
        id: "tpl-whatsapp",
        tenant_id: T,
        channel: "whatsapp",
        name: "time_freed",
        language: "en_US",
        meta_status: "approved",
        category: "utility",
        variables: [],
        hidden_at: null,
        title: null,
        source: "meta",
        components: [],
        body_preview: null,
        rejected_reason: null,
      },
    ],
    jobs: [],
    decisions: [],
    events: [],
    notifications: [],
  };
  const db = fakeDb(tables);
  let loads = 0;
  const loadContext =
    load ??
    (async () => {
      loads += 1;
      return {
        db,
        tenantId: T,
        tz: TZ,
        now: NOW,
        people,
        health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
        ready: channelsReady({
          whatsapp: { canSend: true, refusal: null },
          textLine: null,
          email: { mailbox: false, domain: false },
        }),
        touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
        calendar: "none",
        visits: new Map(),
      };
    });
  const offer = () => offerFreedTime(db, T, FREED, NOW, loadContext);
  return { tables, offer, loads: () => loads };
}

test("the running step offers the freed time: one batch, the time and the appointment kept, every send its words", async () => {
  const w = world();
  assert.deepEqual(await w.offer(), { offered: true, people: 2, waits: false });
  assert.equal(w.tables.sequence_batches.length, 1);
  const [batch] = w.tables.sequence_batches;
  assert.deepEqual(
    [batch.step_id, batch.offered_start, batch.offered_end, batch.offered_from, batch.run_for ?? null],
    [STEP, "2026-09-08T19:00:00.000Z", "2026-09-08T20:00:00.000Z", APPT, null],
  );
  assert.equal(batch.name, "Fill a cancellation · Tue, Sep 8, 3:00 PM");
  const sends = w.tables.sequence_sends.filter((s) => s.batch_id === batch.id);
  assert.deepEqual(
    sends.map((s) => s.contact_id),
    ["b", "a"],
    "whoever asked most recently first",
  );
  assert.ok(sends.every((s) => s.facts?.freed_when === "on Tuesday at 3:00 PM" && s.facts?.appointment === APPT));
  assert.equal(w.tables.jobs.filter((j) => j.kind === "broadcast_send").length, 1);

  // Asked again (a second delivery, or visit_notice's clause after the subscriber): the batch it made, and no run.
  assert.deepEqual(await w.offer(), { offered: true, people: 2, waits: false });
  assert.equal(w.tables.sequence_batches.length, 1);
  assert.equal(w.loads(), 1, "the workspace is read for a run, never for an answer it already has");
});

test("two asks at once (the subscriber and the news, in one tick): one batch, and both answer it", async () => {
  const w = world({ mode: "ask" });
  const answers = await Promise.all([w.offer(), w.offer()]);
  assert.deepEqual(answers, [
    { offered: true, people: 2, waits: true },
    { offered: true, people: 2, waits: true },
  ]);
  assert.equal(w.tables.sequence_batches.length, 1, "the database keeps one batch per step and appointment");
});

test("a sequence that asks makes a batch that waits for the owner's OK", async () => {
  const w = world({ mode: "ask" });
  assert.deepEqual(await w.offer(), { offered: true, people: 2, waits: true });
  assert.equal(w.tables.sequence_batches[0].state, "pending_approval");
});

test("no step on the moment, a paused step and a paused workspace ask nothing", async () => {
  const none = world({ steps: [] });
  assert.deepEqual(await none.offer(), { offered: false, why: "no_step" });
  const paused = world({ steps: [step({ state: "paused" })] });
  assert.deepEqual(await paused.offer(), { offered: false, why: "paused" });
  const away = world({ load: async () => ({ error: CONTEXT_PAUSED }) });
  assert.deepEqual(await away.offer(), { offered: false, why: "paused" });
  for (const w of [none, paused, away]) assert.deepEqual(w.tables.sequence_batches, []);
});

test("the run's outcome is the answer: nobody to offer it to, or a run that was off", async () => {
  const nobody = world({ people: [] });
  assert.deepEqual(await nobody.offer(), { offered: false, why: "nobody" });
  const off = world({ steps: [step({ template_name: "not_on_file" })] });
  const answer = await off.offer();
  assert.equal(answer.offered, false);
  assert.equal(answer.why, "off");
  assert.equal(typeof answer.detail, "string");
});

test("a workspace that could not be read throws, so the delivery tries again", async () => {
  const w = world({ load: async () => ({ error: "people: the read timed out" }) });
  await assert.rejects(() => w.offer(), /could not be read for its freed time: people: the read timed out/);
});

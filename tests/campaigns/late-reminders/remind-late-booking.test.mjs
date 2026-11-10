/**
 * The edge's reminder of a late booking (decision 0118, apps/edge/lib/campaigns/late-reminder.ts), over a database in
 * memory: the workspace's running step on `visit_tomorrow` runs for the one person a booking is for, through the run the
 * sweep and Run now use, where the day's look can no longer name the visit. Its batch has no day, goes at the time the
 * rule gives, and never closes the day for everyone else; a second ask answers the reminder that stands and runs nothing;
 * no step, a paused step and a paused workspace ask nothing; a booking the look still names, one for nobody and one gone
 * from the record say so; and a run that failed throws, so the delivery tries again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, numberHealth, toPersonRowVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { importSrc } from "../../_source.mjs";

const { remindLateBooking } = await importSrc("apps/edge/lib/campaigns/late-reminder.ts");
const { CONTEXT_PAUSED } = await importSrc("apps/edge/lib/campaigns/playbooks/playbooks.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQ = "5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e";
const STEP = "57575757-5757-4575-8575-575757575757";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const TZ = "America/New_York";
const DAY_MS = 86_400_000;
/** Monday 9 November 2026, 3:12 PM in New York: after the reminder's 10:00 AM look. */
const AFTERNOON = new Date("2026-11-09T20:12:00Z");
/** Tuesday 9:00 AM in New York, and 8:00 PM the evening before. */
const STARTS = "2026-11-10T14:00:00+00:00";
const EVENING = "2026-11-10T01:00:00.000Z";

/** The appointment reminder, as its owner turned it on: its words seen going, today's look already made. */
const step = (over = {}) => ({
  id: STEP,
  tenant_id: T,
  sequence_id: SEQ,
  kind: "moment",
  name: "Appointment reminder",
  trigger: "visit_tomorrow",
  template_id: "tpl-whatsapp",
  template_name: "visit_reminder",
  template_language: "en_US",
  params: [{ kind: "visit_when" }],
  policy_class: "booking",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner-1",
  last_run_for: "2026-11-09",
  last_run_at: "2026-11-09T15:00:00.000Z",
  words_ok_at: "2026-11-01T10:00:00.000Z",
  created_at: "2026-11-01T10:00:00.000Z",
  updated_at: "2026-11-01T10:00:00.000Z",
  ...over,
});

/** The booking on the record: a booking tool's, for the person, tomorrow morning. */
const booking = (over = {}) => ({
  id: APPT,
  tenant_id: T,
  contact_id: "a",
  starts_at: STARTS,
  ends_at: "2026-11-10T15:00:00+00:00",
  all_day: false,
  timezone: TZ,
  status: "booked",
  source: "booking_email",
  client_name: "Nina Patel",
  service: "Walk-through",
  vanished_at: null,
  expires_at: null,
  ...over,
});

/** The person as the run reads them, with the visit the calendar holds for them. */
function person(now, startIso) {
  const next = {
    id: "v-1",
    start: new Date(startIso).toISOString(),
    end: new Date(Date.parse(startIso) + 3_600_000).toISOString(),
    title: "Walk-through",
    all_day: false,
    via: "phone",
    key: "evt-1",
  };
  const visits = { timezone: TZ, source: "calendar", state: "ok", next, last: null };
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  const row = toPersonRowVM(
    {
      id: "a",
      display_name: "Nina Patel",
      wa_profile_name: null,
      phone_e164: "+13055550142",
      consent: "opted_in",
      consent_source: "keyword",
      consent_updated_at: ago(30 * DAY_MS),
      dnc: false,
      marketing_consent: "unknown",
      marketing_consent_source: null,
      marketing_consent_updated_at: null,
      channels: ["whatsapp"],
      conversation_count: 1,
      escalation_count: 0,
      needs_human: false,
      latest_conversation_id: "cv-a",
      latest_state: "open",
      latest_wa_inbound_at: ago(DAY_MS),
      last_message_at: ago(DAY_MS),
      last_message_direction: "inbound",
      last_message_sender: "customer",
      last_inbound_text: "Thursday works",
      last_inbound_at: ago(DAY_MS),
      call_count: 0,
      call_seconds: 0,
      first_contact_at: ago(20 * DAY_MS),
      earliest_row_at: ago(20 * DAY_MS),
      has_backfill: false,
      has_chat: true,
      effective_reply_mode: "auto",
      visits,
    },
    TZ,
    now,
  );
  return { row, visits };
}

/**
 * A workspace with its sequence (in `mode`), its reminder step, Meta's approved message and one booking; the run context
 * the door loads is the person with that visit, counted each time it is loaded.
 */
function world({
  steps = [step()],
  mode = "auto",
  appointments = [booking()],
  now = AFTERNOON,
  load,
  calendar = "ok",
} = {}) {
  const tables = {
    tenants: [rows.tenant({ id: T, timezone: TZ })],
    sequences: [{ id: SEQ, tenant_id: T, name: "Appointment reminder", mode, created_at: "2026-11-01T10:00:00.000Z" }],
    sequence_steps: steps,
    sequence_batches: [],
    sequence_sends: [],
    appointments,
    templates: [
      {
        id: "tpl-whatsapp",
        tenant_id: T,
        channel: "whatsapp",
        name: "visit_reminder",
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
      const start = appointments[0]?.starts_at ?? STARTS;
      const who = person(now, start);
      return {
        db,
        tenantId: T,
        tz: TZ,
        now,
        people: [who.row],
        health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
        ready: channelsReady({
          whatsapp: { canSend: true, refusal: null },
          textLine: null,
          email: { mailbox: false, domain: false },
        }),
        touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
        calendar,
        visits: new Map([["a", who.visits]]),
      };
    });
  const remind = () => remindLateBooking(db, T, APPT, now, loadContext);
  return { tables, remind, loads: () => loads };
}

test("a booking made after the day's look is reminded at 8:00 PM the evening before, as a batch with no day", async () => {
  const w = world();
  assert.deepEqual(await w.remind(), { reminded: true, at: EVENING, waits: false });
  assert.equal(w.tables.sequence_batches.length, 1);
  const [batch] = w.tables.sequence_batches;
  assert.deepEqual([batch.step_id, batch.run_for ?? null, batch.recipient_count], [STEP, null, 1]);
  assert.equal(new Date(batch.scheduled_for).toISOString(), EVENING);
  assert.equal(batch.name, "Appointment reminder · Tue, Nov 10, 9:00 AM");
  assert.deepEqual(batch.audience.late, { appointment: APPT, start: "2026-11-10T14:00:00.000Z", day: "2026-11-09" });
  const sends = w.tables.sequence_sends.filter((s) => s.batch_id === batch.id);
  assert.deepEqual(
    sends.map((s) => [s.contact_id, s.facts?.visit_when]),
    [["a", "tomorrow at 9:00 AM"]],
  );
  assert.equal(w.tables.jobs.filter((j) => j.kind === "broadcast_send").length, 1);
});

test("asked again for the same visit, the reminder that stands answers, and nothing runs", async () => {
  const w = world();
  await w.remind();
  assert.deepEqual(await w.remind(), { reminded: false, why: "already" });
  assert.equal(w.tables.sequence_batches.length, 1);
  assert.equal(w.loads(), 1, "the workspace is read for a run, never for an answer it already has");
});

test("a reminder its owner stopped is still the visit's: a later word about the booking makes no other; one that failed is made again", async () => {
  const w = world();
  await w.remind();
  const [batch] = w.tables.sequence_batches;
  batch.state = "canceled";
  assert.deepEqual(await w.remind(), { reminded: false, why: "already" });
  assert.equal(w.tables.sequence_batches.length, 1, "the owner's Stop stands");
  batch.state = "failed";
  assert.deepEqual(await w.remind(), { reminded: true, at: EVENING, waits: false });
  assert.equal(w.tables.sequence_batches.length, 2);
});

test("a late reminder never closes the day: the step's last run stands as it was", async () => {
  // Monday at 10:00 PM, and today's look never ran: the visit is Tuesday at 2:00 PM, reminded Tuesday at 10:00 AM.
  const w = world({
    now: new Date("2026-11-10T03:00:00Z"),
    steps: [step({ last_run_for: "2026-11-08", last_run_at: "2026-11-08T15:00:00.000Z" })],
    appointments: [booking({ starts_at: "2026-11-10T19:00:00+00:00", ends_at: "2026-11-10T20:00:00+00:00" })],
  });
  assert.deepEqual(await w.remind(), { reminded: true, at: "2026-11-10T15:00:00.000Z", waits: false });
  const [kept] = w.tables.sequence_steps;
  assert.deepEqual([kept.last_run_for, kept.last_run_at], ["2026-11-08", "2026-11-08T15:00:00.000Z"]);
  assert.equal(w.tables.sequence_sends[0].facts?.visit_when, "today at 2:00 PM");
});

test("a sequence that asks makes a reminder that waits for the owner's OK", async () => {
  const w = world({ mode: "ask" });
  assert.deepEqual(await w.remind(), { reminded: true, at: null, waits: true });
  assert.equal(w.tables.sequence_batches[0].state, "pending_approval");
});

test("a booking the day's look still names is left to it, and the workspace is never read", async () => {
  // The look has not run today: at its hour it names tomorrow's visits itself.
  const w = world({ steps: [step({ last_run_for: "2026-11-08" })] });
  assert.deepEqual(await w.remind(), { reminded: false, why: "not_late" });
  assert.equal(w.loads(), 0);
  assert.equal(w.tables.sequence_batches.length, 0);
});

test("no step on the moment, a paused step and a paused workspace ask nothing", async () => {
  assert.deepEqual(await world({ steps: [] }).remind(), { reminded: false, why: "no_step" });
  assert.deepEqual(await world({ steps: [step({ state: "paused" })] }).remind(), { reminded: false, why: "paused" });
  const paused = world({ load: async () => ({ error: CONTEXT_PAUSED }) });
  assert.deepEqual(await paused.remind(), { reminded: false, why: "paused" });
  assert.equal(paused.tables.sequence_batches.length, 0);
});

test("a booking for nobody, and one cancelled or gone from the record, are owed nothing", async () => {
  assert.deepEqual(await world({ appointments: [booking({ contact_id: null })] }).remind(), {
    reminded: false,
    why: "nobody",
  });
  assert.deepEqual(await world({ appointments: [booking({ status: "cancelled" })] }).remind(), {
    reminded: false,
    why: "gone",
  });
  assert.deepEqual(await world({ appointments: [] }).remind(), { reminded: false, why: "gone" });
});

test("a workspace that could not be read, and a run that failed, throw, so the delivery tries again", async () => {
  const unread = world({ load: async () => ({ error: "people: the read timed out" }) });
  await assert.rejects(() => unread.remind(), /could not be read for a late reminder/);
  // A calendar that could not be read fails a visit's run (core run-playbook): nothing is made.
  const failed = world({ calendar: "unavailable" });
  await assert.rejects(() => failed.remind(), /late reminder's run failed/);
  assert.equal(failed.tables.sequence_batches.length, 0);
});

/**
 * A visit marked kept after the thank-you's look is thanked on its own (decision 0122).
 *
 * The thank-you the day after a visit goes only for a visit a member said was kept. Its look is once a day, at its hour,
 * so a word said after that look found nobody to send it: the owner pressed Kept at three and the customer was never
 * thanked. The rule says when such a visit is still owed its thank-you (contracts lateThanksAt), and the edge's door runs
 * the workspace's step on `visited` for that one person (apps/edge/lib/campaigns/late-thanks.ts), once per visit.
 *
 * Run on the rule, and on the real door over a database in memory with the run's own context handed in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, keptThanksAt, lateThanksAt, numberHealth, toPersonRowVM } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { rows } from "../../_rows.mjs";
import { importSrc } from "../../_source.mjs";

const { thankLateKept } = await importSrc("apps/edge/lib/campaigns/late-thanks.ts");
const { CONTEXT_PAUSED } = await importSrc("apps/edge/lib/campaigns/playbooks/playbooks.ts");

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SEQ = "5e5e5e5e-5e5e-45e5-85e5-5e5e5e5e5e5e";
const STEP = "57575757-5757-4575-8575-575757575757";
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const TZ = "America/New_York";
const DAY_MS = 86_400_000;
/** The visit: Monday 9 November 2026, 2:00 PM in New York. */
const STARTS = "2026-11-09T19:00:00+00:00";
/** Tuesday 3:12 PM in New York: the day after, past the thank-you's 10:00 AM look. */
const AFTERNOON = new Date("2026-11-10T20:12:00Z");

/* ------------------------------ the rule ------------------------------ */

const kept = (iso, lastRunFor) => ({
  startsAt: Date.parse(STARTS),
  tz: TZ,
  nowMs: Date.parse(iso),
  runHour: 10,
  lastRunFor,
});
const at = (iso, lastRunFor = "2026-11-10") => lateThanksAt(kept(iso, lastRunFor));

test("the rule: owed on the day after the visit, once that day's look has gone, while its sending hours last", () => {
  assert.deepEqual(at("2026-11-10T20:12:00Z"), { at: Date.parse("2026-11-10T20:12:00Z"), day: "2026-11-09" });
  // The look still to come names the visit itself, now that the record says kept.
  assert.equal(at("2026-11-10T13:30:00Z", "2026-11-09"), null, "8:30 AM, before the 10:00 look");
  assert.equal(at("2026-11-10T20:12:00Z", "2026-11-09"), null, "the look has not run today: it is the look's still");
  // Marked on the visit's own day, tomorrow's look names it.
  assert.equal(at("2026-11-09T21:00:00Z", "2026-11-09"), null);
  // Marked later, its words ("yesterday") would be a day old: nothing goes.
  assert.equal(at("2026-11-11T15:00:00Z", "2026-11-11"), null);
  // Past the day's sending hours it would go tomorrow, a day after its words.
  assert.equal(at("2026-11-11T03:30:00Z"), null, "10:30 PM on the day after");
  assert.notEqual(at("2026-11-11T01:59:00Z"), null, "8:59 PM still goes tonight");
});

test("the one reading of when a kept visit is thanked: by tomorrow's look, by today's still to come, or now on its own", () => {
  const when = (iso, lastRunFor) => {
    const owed = keptThanksAt(kept(iso, lastRunFor));
    return owed ? [new Date(owed.at).toISOString(), owed.late] : null;
  };
  // Said on the visit's own day, at 4:00 PM: tomorrow's look, at the step's 10:00 AM.
  assert.deepEqual(when("2026-11-09T21:00:00Z", "2026-11-09"), ["2026-11-10T15:00:00.000Z", false]);
  // Said the next morning at 8:30, before the look: today's look.
  assert.deepEqual(when("2026-11-10T13:30:00Z", "2026-11-09"), ["2026-11-10T15:00:00.000Z", false]);
  // Said after the look went: now, on its own.
  assert.deepEqual(when("2026-11-10T20:12:00Z", "2026-11-10"), ["2026-11-10T20:12:00.000Z", true]);
  // A look that is overdue is expected now, never in the past.
  assert.deepEqual(when("2026-11-10T20:12:00Z", "2026-11-09"), ["2026-11-10T20:12:00.000Z", false]);
  // Two days on, or past the day's sending hours: nothing.
  assert.equal(when("2026-11-11T15:00:00Z", "2026-11-11"), null);
  assert.equal(when("2026-11-11T03:30:00Z", "2026-11-10"), null);
});

/* ------------------------------ the door ------------------------------ */

/** The thank-you, as its owner turned it on: its words seen going, today's look already made. */
const step = (over = {}) => ({
  id: STEP,
  tenant_id: T,
  sequence_id: SEQ,
  kind: "moment",
  name: "After the appointment",
  trigger: "visited",
  template_id: "tpl-whatsapp",
  template_name: "after_visit_check",
  template_language: "en_US",
  params: [{ kind: "visit_when" }],
  policy_class: "booking",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner-1",
  last_run_for: "2026-11-10",
  last_run_at: "2026-11-10T15:00:00.000Z",
  words_ok_at: "2026-11-01T10:00:00.000Z",
  created_at: "2026-11-01T10:00:00.000Z",
  updated_at: "2026-11-01T10:00:00.000Z",
  ...over,
});

/** The visit on the record, as a member just said it: kept. */
const visit = (over = {}) => ({
  id: APPT,
  tenant_id: T,
  contact_id: "a",
  starts_at: STARTS,
  ends_at: "2026-11-09T20:00:00+00:00",
  all_day: false,
  timezone: TZ,
  status: "kept",
  source: "booking_email",
  external_id: null,
  client_name: "Nina Patel",
  title: null,
  service: "Walk-through",
  vanished_at: null,
  expires_at: null,
  ...over,
});

/** The person as the run reads them, with yesterday's visit as the calendar and the record hold it. */
function person(now, said) {
  const last = {
    id: "v-1",
    start: new Date(STARTS).toISOString(),
    end: new Date(Date.parse(STARTS) + 3_600_000).toISOString(),
    title: "Walk-through",
    all_day: false,
    via: "phone",
    key: "evt-1",
    ...(said ? { said } : {}),
  };
  const visits = { timezone: TZ, source: "calendar", state: "ok", next: null, last };
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
      last_inbound_text: "See you then",
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
 * A workspace with its sequence (in `mode`), its thank-you step, Meta's approved message and one visit; the run context
 * the door loads is the person with that visit as `said` says the calendar read it, counted each time it is loaded.
 */
function world({
  steps = [step()],
  mode = "auto",
  appointments = [visit()],
  now = AFTERNOON,
  said = "kept",
  load,
} = {}) {
  const tables = {
    tenants: [rows.tenant({ id: T, timezone: TZ })],
    sequences: [{ id: SEQ, tenant_id: T, name: "After the appointment", mode, created_at: "2026-11-01T10:00:00.000Z" }],
    sequence_steps: steps,
    sequence_batches: [],
    sequence_sends: [],
    appointments,
    templates: [
      {
        id: "tpl-whatsapp",
        tenant_id: T,
        channel: "whatsapp",
        name: "after_visit_check",
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
      const who = person(now, said);
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
        calendar: "ok",
        visits: new Map([["a", who.visits]]),
      };
    });
  const thank = () => thankLateKept(db, T, APPT, now, loadContext);
  return { tables, thank, loads: () => loads };
}

test("a visit marked kept after the day's look is thanked now, as a batch about that one visit, behind it", async () => {
  const w = world();
  assert.deepEqual(await w.thank(), { thanked: true, at: AFTERNOON.toISOString(), waits: false });
  assert.equal(w.tables.sequence_batches.length, 1);
  const [batch] = w.tables.sequence_batches;
  assert.deepEqual([batch.step_id, batch.run_for ?? null, batch.recipient_count], [STEP, null, 1]);
  assert.match(batch.name, /^After the appointment · Mon, Nov 9/, "named for the visit it is about");
  // The day its words were written for, and that the visit is behind it: an approval on a later day is refused.
  assert.deepEqual(batch.audience.late, {
    appointment: APPT,
    start: "2026-11-09T19:00:00.000Z",
    day: "2026-11-10",
    behind: true,
  });
  const sends = w.tables.sequence_sends.filter((s) => s.batch_id === batch.id);
  assert.deepEqual(
    sends.map((s) => [s.contact_id, s.facts?.visit_when, s.facts?.visit_was]),
    [["a", "yesterday", "kept"]],
    "its words say yesterday, and the send asks the row once more that it still says kept",
  );
  assert.equal(w.tables.jobs.filter((j) => j.kind === "broadcast_send").length, 1);
});

test("asked again for the same visit, the thank-you that stands answers, and nothing runs", async () => {
  const w = world();
  await w.thank();
  assert.deepEqual(await w.thank(), { thanked: false, why: "already" });
  assert.equal(w.tables.sequence_batches.length, 1);
  assert.equal(w.loads(), 1, "the workspace is read for a run, never for an answer it already has");
});

test("nothing where the look names it, or no thank-you is owed: the look still to come, a visit of another day, or night", async () => {
  // The day's look has not run yet: it names the visit itself.
  const early = world({ steps: [step({ last_run_for: "2026-11-09" })] });
  assert.deepEqual(await early.thank(), { thanked: false, why: "not_late" });
  // Said on the visit's own day: tomorrow's look.
  const sameDay = world({ now: new Date("2026-11-09T21:30:00Z"), steps: [step({ last_run_for: "2026-11-09" })] });
  assert.deepEqual(await sameDay.thank(), { thanked: false, why: "not_late" });
  // Said two days on: its words would be a day old.
  const days = world({ now: new Date("2026-11-11T20:12:00Z"), steps: [step({ last_run_for: "2026-11-11" })] });
  assert.deepEqual(await days.thank(), { thanked: false, why: "not_late" });
  for (const w of [early, sameDay, days]) {
    assert.equal(w.tables.sequence_batches.length, 0);
    assert.equal(w.loads(), 0, "nothing is read for a visit that is owed none");
  }
});

test("nothing where the visit is not one to thank for, or nothing runs for it", async () => {
  const answers = async (over) => (await world(over).thank()).why;
  assert.equal(await answers({ appointments: [visit({ status: "missed" })] }), "gone", "the word was Missed");
  assert.equal(await answers({ appointments: [visit({ status: "booked" })] }), "gone", "the word was taken back");
  assert.equal(await answers({ appointments: [visit({ vanished_at: "2026-11-10T12:00:00Z" })] }), "gone");
  assert.equal(await answers({ appointments: [] }), "gone");
  assert.equal(await answers({ appointments: [visit({ contact_id: null })] }), "nobody");
  assert.equal(await answers({ steps: [] }), "no_step");
  assert.equal(await answers({ steps: [step({ state: "paused" })] }), "paused");
  assert.equal(await answers({ load: async () => ({ error: CONTEXT_PAUSED }) }), "paused");
  // The calendar's read does not say kept yet (its copy is older than the word): the run names nobody, and says so.
  assert.equal(await answers({ said: null }), "nobody");
});

test("a workspace that cannot be read throws, so the delivery tries again", async () => {
  const w = world({ load: async () => ({ error: "the people list is down" }) });
  await assert.rejects(w.thank(), /could not be read for a late thank-you/);
});

test("under a sequence that asks, or whose words are new, the thank-you is made and waits for its owner", async () => {
  for (const over of [{ mode: "ask" }, { steps: [step({ words_ok_at: null })] }]) {
    const w = world(over);
    assert.deepEqual(await w.thank(), { thanked: true, at: null, waits: true });
    assert.equal(w.tables.sequence_batches[0].state, "pending_approval");
    assert.equal(w.tables.jobs.filter((j) => j.kind === "broadcast_send").length, 0);
  }
});

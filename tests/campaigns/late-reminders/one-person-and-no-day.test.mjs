/**
 * A late booking's reminder, run (core runPlaybook with `late`, decision 0118): the appointment reminder runs for the one
 * person the booking is for, on the visit's own day, at the time the rule gave it, as a batch with no day of its own. It
 * never asks whether the day's run was made, and its record says it is late, so the edge never closes the day for it. Any
 * other step refuses a late booking before anything is read. Through fakes that log their calls, as the run's own tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, numberHealth, toPersonRowVM } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");

const TZ = "America/New_York";
/** Monday 9 November 2026, 3:12 PM in New York: after the reminder's 10:00 AM look. */
const NOW = new Date("2026-11-09T20:12:00Z");
const DAY_MS = 86_400_000;
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
/** Tuesday 9:00 AM in New York, and 8:00 PM the evening before: the visit, and when its reminder goes. */
const STARTS = "2026-11-10T14:00:00Z";
const EVENING = "2026-11-10T01:00:00.000Z";

const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
/** One visit as the calendar's read keeps it, with the key a reminder asks its row again by. */
const visitAt = (startIso, title) => ({
  id: `v-${startIso}`,
  start: startIso,
  end: new Date(Date.parse(startIso) + 3_600_000).toISOString(),
  title,
  all_day: false,
  via: "phone",
  key: `evt:${startIso}`,
});
const readOf = (next) => ({ timezone: TZ, source: "calendar", state: "ok", next, last: null });
/** Someone in People who said yes to messages, with their next visit as the calendar says it. */
const booked = (id, next) =>
  toPersonRowVM(
    {
      id,
      display_name: `Person ${id}`,
      wa_profile_name: null,
      phone_e164: `+1305555010${id.charCodeAt(0) % 10}`,
      consent: "opted_in",
      consent_source: "keyword",
      consent_updated_at: ago(30 * DAY_MS),
      dnc: false,
      marketing_consent: "opted_in",
      marketing_consent_source: "customer_message",
      marketing_consent_updated_at: ago(30 * DAY_MS),
      channels: ["whatsapp"],
      conversation_count: 1,
      escalation_count: 0,
      needs_human: false,
      latest_conversation_id: `cv-${id}`,
      latest_state: "open",
      latest_wa_inbound_at: ago(3 * DAY_MS),
      last_message_at: ago(3 * DAY_MS),
      last_message_direction: "inbound",
      last_message_sender: "customer",
      last_inbound_text: "hi",
      last_inbound_at: ago(3 * DAY_MS),
      call_count: 0,
      call_seconds: 0,
      first_contact_at: ago(60 * DAY_MS),
      earliest_row_at: ago(60 * DAY_MS),
      has_backfill: false,
      has_chat: true,
      effective_reply_mode: "auto",
      visits: readOf(next),
    },
    TZ,
    NOW,
  );

/** The appointment reminder as its owner turned it on: its words seen going, its sequence sending on its own. */
const reminder = (over = {}) => ({
  id: "p1",
  tenant_id: "t1",
  name: "Appointment reminder",
  trigger: "visit_tomorrow",
  template_id: "tpl-1",
  template_name: "visit_reminder",
  template_language: "en_US",
  params: [{ kind: "visit_when" }],
  policy_class: "booking",
  mode: "auto",
  words_ok_at: "2026-11-01T10:00:00.000Z",
  state: "running",
  run_hour: 10,
  cap_per_run: 25,
  gap_days: 90,
  cadence_days: 30,
  created_by: "owner",
  last_run_for: "2026-11-09",
  ...over,
});

/** Two people with a visit tomorrow morning; the late booking is the first one's. */
function world(next = visitAt(STARTS, "Walk-through")) {
  const other = visitAt("2026-11-10T16:00:00Z", "First clean");
  return {
    tz: TZ,
    now: NOW,
    people: [booked("a", next), booked("b", other)],
    health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
    ready: channelsReady({
      whatsapp: { canSend: true, refusal: null },
      textLine: null,
      email: { mailbox: false, domain: false },
    }),
    touches: { byThis: new Map(), byAny: new Map() },
    calendar: "ok",
    visits: new Map([
      ["a", readOf(next)],
      ["b", readOf(other)],
    ]),
  };
}
const late = (over = {}) => ({
  contactId: "a",
  appointment: APPT,
  day: "2026-11-10",
  startsAt: Date.parse(STARTS),
  at: Date.parse(EVENING),
  ...over,
});

/** The run's ports: each answers what a test says, and the writes are kept in the order they were made. */
function fakes(over = {}) {
  const calls = [];
  const answers = {
    message: (name, language) => [
      {
        id: "tpl-whatsapp",
        channel: "whatsapp",
        name,
        language,
        meta_status: "approved",
        category: null,
        variables: [],
        hidden_at: null,
        title: null,
        source: "meta",
        components: [],
        body_preview: null,
        rejected_reason: null,
      },
    ],
    alreadyRan: false,
    record: undefined,
    assemble: (_row, _people, _sendAt, decision) => ({ id: "b1", decisionId: decision ? "d1" : null }),
    monthSent: 0,
    holdRecipients: (_id, ids) => ({ skipped: ids, error: null }),
    notify: undefined,
    ...over,
  };
  const ports = {};
  for (const [name, answer] of Object.entries(answers)) {
    ports[name] = async (...args) => {
      calls.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  return { ports, calls, of: (name) => calls.filter((c) => c[0] === name) };
}
const ask = (ports, over = {}) =>
  runPlaybook(ports, { playbook: reminder(), ctx: world(), by: { kind: "system" }, late: late(), ...over });

test("a late run reaches the one person, on the day it names, at its own time, as a batch with no day", async () => {
  const { ports, of } = fakes();
  const r = await ask(ports);
  assert.equal(r.outcome, "sent");
  assert.equal(r.scheduled_for, EVENING);
  const [, row, people, sendAt] = of("assemble")[0];
  assert.equal("run_for" in row, false, "the day's own batch holds the day");
  assert.equal(row.scheduled_for, EVENING);
  assert.equal(row.recipient_count, 1);
  // The visit it is about, and the day its words were written for: the evening before.
  assert.deepEqual(row.audience.late, { appointment: APPT, start: "2026-11-10T14:00:00.000Z", day: "2026-11-09" });
  assert.equal(sendAt.toISOString(), EVENING);
  assert.equal(people.length, 1, "the other person with a visit tomorrow is the day's run's, not this one's");
  assert.equal(people[0].contact_id, "a");
  assert.equal(people[0].facts.visit_when, "tomorrow at 9:00 AM");
  assert.equal(people[0].facts.visit_start, STARTS);
});

test("a reminder that goes the morning of the visit says today", async () => {
  // Booked Monday at 10:00 PM for Tuesday at 2:00 PM: the reminder goes Tuesday at 10:00 AM.
  const ctx = { ...world(visitAt("2026-11-10T19:00:00Z", "Walk-through")), now: new Date("2026-11-10T03:00:00Z") };
  const { ports, of } = fakes();
  const r = await ask(ports, {
    ctx,
    late: late({ startsAt: Date.parse("2026-11-10T19:00:00Z"), at: Date.parse("2026-11-10T15:00:00Z") }),
  });
  assert.equal(r.outcome, "sent");
  assert.equal(r.scheduled_for, "2026-11-10T15:00:00.000Z");
  assert.equal(of("assemble")[0][2][0].facts.visit_when, "today at 2:00 PM");
});

test("a late run never asks whether the day ran, and its record says it is late", async () => {
  const { ports, of } = fakes({ alreadyRan: true });
  const r = await ask(ports);
  assert.equal(r.outcome, "sent", "the day's run stands beside it");
  assert.equal(of("alreadyRan").length, 0);
  const recorded = of("record").map((c) => c[4]);
  assert.ok(recorded.length > 0);
  assert.ok(
    recorded.every((data) => data.late === true),
    "every record of it says so, so the edge never stamps the day",
  );
});

test("the day's own run names everyone, and its record says nothing of late", async () => {
  const { ports, of } = fakes();
  const r = await runPlaybook(ports, { playbook: reminder(), ctx: world(), by: { kind: "system" } });
  assert.equal(r.outcome, "sent");
  assert.equal(of("assemble")[0][2].length, 2);
  assert.equal(of("assemble")[0][1].run_for, "2026-11-09");
  assert.equal("late" in of("assemble")[0][1].audience, false);
  assert.ok(of("record").every((c) => !("late" in c[4])));
});

test("a sequence that asks first leaves a late reminder waiting for its owner, who is told", async () => {
  const { ports, of } = fakes();
  const r = await ask(ports, { playbook: reminder({ mode: "ask" }) });
  assert.equal(r.outcome, "held");
  const [, row, , sendAt] = of("assemble")[0];
  assert.equal(row.state, "pending_approval");
  assert.equal(sendAt, null);
  assert.equal(of("notify").length, 1);
});

test("a late reminder that waits keeps the words of the moment it was to go, never of the night it was made", async () => {
  // Booked Monday at 10:00 PM for Tuesday at 2:00 PM, under a sequence that asks: approved in the morning it says today.
  const ctx = { ...world(visitAt("2026-11-10T19:00:00Z", "Walk-through")), now: new Date("2026-11-10T03:00:00Z") };
  const { ports, of } = fakes();
  const r = await ask(ports, {
    ctx,
    playbook: reminder({ mode: "ask" }),
    late: late({ startsAt: Date.parse("2026-11-10T19:00:00Z"), at: Date.parse("2026-11-10T15:00:00Z") }),
  });
  assert.equal(r.outcome, "held");
  const [, row, people] = of("assemble")[0];
  assert.equal(people[0].facts.visit_when, "today at 2:00 PM");
  assert.deepEqual(row.audience.late, { appointment: APPT, start: "2026-11-10T19:00:00.000Z", day: "2026-11-10" });
});

test("a run about one visit handed to a step on no visit's moment is off before anything is read or written", async () => {
  // A visit's two moments take one: a late booking's reminder (0118), and a late Kept's thank-you (0123).
  const { ports, calls } = fakes();
  const r = await ask(ports, {
    playbook: reminder({ trigger: "quiet_30", name: "Win-back", policy_class: "reengage" }),
  });
  assert.deepEqual(r, { outcome: "off", mode: "auto", skipped: "not_a_reminder_step" });
  assert.deepEqual(calls, []);
});

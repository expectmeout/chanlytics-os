/**
 * An occasion's step, run (core runPlaybook with `occasion`, decision 0119): the sequence's first step runs for the one
 * person its occasion enrolled, at their own time, as a batch with no day of its own, with the visit's words read off the
 * record. It never asks whether the day's run was made, keeps no gap and no week's breath, and its record says it is an
 * occasion's, so the edge never stamps a day for it. A step an occasion starts runs for nobody without one, and no other
 * step takes one. Through fakes that log their calls, as the run's own tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsReady, missedOccasion, numberHealth, toPersonRowVM, visitOccasion } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { runPlaybook } = await importSrc("packages/core/src/campaigns/run-playbook.ts");

const TZ = "America/New_York";
/** Tuesday 10 November 2026, noon in New York: two hours before the visit. */
const NOON = new Date("2026-11-10T17:00:00Z");
const DAY_MS = 86_400_000;
const APPT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
/** Tuesday at 2:00 PM in New York. */
const STARTS = "2026-11-10T19:00:00.000Z";

/** Someone in People who said yes to messages, read narrow: no calendar is read for an occasion's run. */
const person = (id, now) => {
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  return toPersonRowVM(
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
      visits: null,
    },
    TZ,
    now,
  );
};

/** A sequence's first step on an occasion's moment, its words seen going, its sequence sending on its own. */
const step = (over = {}) => ({
  id: "p1",
  tenant_id: "t1",
  name: "Two hours before",
  trigger: "visit_soon",
  template_id: "tpl-1",
  template_name: "visit_soon",
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
  last_run_for: null,
  ...over,
});

/** The workspace as an occasion's job reads it: the people due and nobody else, and no calendar. */
const world = (now = NOON, ids = ["a", "b"]) => ({
  tz: TZ,
  now,
  people: ids.map((id) => person(id, now)),
  health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
  ready: channelsReady({
    whatsapp: { canSend: true, refusal: null },
    textLine: null,
    email: { mailbox: false, domain: false },
  }),
  touches: { byThis: new Map(), byAny: new Map(), followUps: new Map(), followUpKeys: new Map() },
  calendar: "none",
  visits: new Map(),
  listMembers: () => null,
  pace: null,
});

const visit = (over = {}) => ({
  key: `appt:${APPT}`,
  appointment: APPT,
  startsAt: Date.parse(STARTS),
  title: "Walk-through",
  allDay: false,
  ...over,
});
const soon = (over = {}) => ({
  contactId: "a",
  occasion: visitOccasion(APPT, Date.parse(STARTS)),
  visit: visit(),
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
  runPlaybook(ports, { playbook: step(), ctx: world(), by: { kind: "system" }, occasion: soon(), ...over });

test("an occasion's run reaches its one person now, as a batch with no day, with the visit's words off the record", async () => {
  const { ports, of } = fakes();
  const r = await ask(ports);
  assert.equal(r.outcome, "sent");
  assert.equal(r.scheduled_for, NOON.toISOString());
  const [, row, people] = of("assemble")[0];
  assert.equal("run_for" in row, false, "an occasion has no day");
  assert.match(row.name, /^Two hours before · /, "named for the visit it is about");
  assert.equal(row.recipient_count, 1);
  assert.deepEqual(row.audience.late, { appointment: APPT, start: STARTS, day: "2026-11-10" });
  assert.equal(people.length, 1, "nobody else in People is named");
  assert.equal(people[0].contact_id, "a");
  assert.equal(people[0].facts.visit_when, "today at 2:00 PM");
  // What the send asks the record again by.
  assert.equal(people[0].facts.appointment, `appt:${APPT}`);
  assert.equal(people[0].facts.visit_start, STARTS);
  assert.equal(people[0].facts.appointment_read_at, NOON.toISOString());
  assert.equal(people[0].facts.occasion, visitOccasion(APPT, Date.parse(STARTS)));
});

test("an occasion's run never asks whether the day ran, and its record says it is an occasion's", async () => {
  const { ports, of } = fakes({ alreadyRan: true });
  const r = await ask(ports);
  assert.equal(r.outcome, "sent");
  assert.equal(of("alreadyRan").length, 0);
  const recorded = of("record").map((c) => c[4]);
  assert.ok(recorded.length > 0);
  assert.ok(
    recorded.every((data) => data.occasion === true),
    "every record of it says so, so the edge never stamps a day",
  );
});

test("someone who heard from this very step yesterday still gets their occasion's message: no gap, no breath", async () => {
  const ctx = world();
  const yesterday = NOON.getTime() - DAY_MS;
  ctx.touches.byThis.set("p1", new Map([["a", yesterday]]));
  ctx.touches.byAny.set("a", yesterday);
  const { ports } = fakes();
  const r = await ask(ports, { ctx });
  assert.equal(r.outcome, "sent", "it is owed for what happened, once, whatever went before");
});

test("a person People no longer holds is nobody to reach", async () => {
  const { ports, of } = fakes();
  const r = await ask(ports, { ctx: world(NOON, ["b"]) });
  assert.equal(r.outcome, "empty");
  assert.equal(of("assemble").length, 0);
});

test("while a step's words are new its batch waits, and its owner is told it waits only until the visit begins", async () => {
  const { ports, of } = fakes();
  const r = await ask(ports, { playbook: step({ words_ok_at: null }) });
  assert.equal(r.outcome, "held");
  const [, row, , sendAt] = of("assemble")[0];
  assert.equal(row.state, "pending_approval");
  assert.equal(sendAt, null);
  const [, , body] = of("notify")[0];
  assert.match(body, /Goes only if you approve it before .*2:00 PM; after that it is skipped/);
});

test("a missed visit's message says the day, is behind its visit, and is held to the row still saying missed", async () => {
  // Marked missed at 2:40 PM, forty minutes after it was to begin.
  const now = new Date("2026-11-10T19:40:00Z");
  const { ports, of } = fakes();
  const r = await ask(ports, {
    ctx: world(now),
    playbook: step({ trigger: "visit_missed", name: "Missed appointment" }),
    occasion: { contactId: "a", occasion: missedOccasion(APPT), visit: visit() },
  });
  assert.equal(r.outcome, "sent");
  const [, row, people] = of("assemble")[0];
  assert.deepEqual(row.audience.late, { appointment: APPT, start: STARTS, day: "2026-11-10", behind: true });
  assert.equal(people[0].facts.visit_when, "today");
  assert.equal(people[0].facts.visit_was, "missed");
});

test("an ask's follow-up names no visit: its batch keeps no visit, and its words none", async () => {
  const { ports, of } = fakes();
  const occasion = "ask:b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
  const r = await ask(ports, {
    playbook: step({ trigger: "asked_no_booking", name: "Follow-up", params: [], policy_class: "follow_up" }),
    occasion: { contactId: "a", occasion, visit: null },
  });
  assert.equal(r.outcome, "sent");
  const [, row, people] = of("assemble")[0];
  assert.equal("late" in row.audience, false);
  assert.equal("run_for" in row, false);
  assert.deepEqual(people[0].facts, { occasion });
});

test("a step an occasion starts runs for nobody without one, before anything is read or written", async () => {
  const { ports, calls } = fakes();
  const r = await runPlaybook(ports, { playbook: step(), ctx: world(), by: { kind: "system" } });
  assert.deepEqual(r, { outcome: "off", mode: "auto", skipped: "no_occasion" });
  assert.deepEqual(calls, []);
});

test("an occasion's person handed to any other step is off before anything is read or written", async () => {
  const { ports, calls } = fakes();
  const r = await ask(ports, { playbook: step({ trigger: "visit_tomorrow", name: "Appointment reminder" }) });
  assert.deepEqual(r, { outcome: "off", mode: "auto", skipped: "not_an_occasion_step" });
  assert.deepEqual(calls, []);
});

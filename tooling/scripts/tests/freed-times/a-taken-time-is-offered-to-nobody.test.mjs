/**
 * A freed time's batch asks the record before its first send (decision 0082, core broadcast-stops.ts takenBeforeItWent):
 * a time booked since it was offered is taken, and the batch is cancelled as the system through the cancel verb (reason
 * `taken`), told once, with nobody claimed and nothing sent; a time still free sends as every batch does; the calendar's
 * copy of the cancelled visit takes nothing; a batch already sending goes on. Over fakes that log their calls.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { sendBroadcastBatch } = await importSrc("packages/core/src/messages/broadcast.ts");

/** Noon UTC on Sunday 6 September 2026: inside the sending hours in UTC. */
const NOW = Date.parse("2026-09-06T12:00:00Z");
const START = Date.parse("2026-09-08T15:00:00Z");
const END = START + 3_600_000;
const WRITES = new Set(["startSending", "mark", "deliver", "finish", "alert", "cancelFrom", "recordDecision"]);

/** The freed time's batch as the job reads it: scheduled, the time it offers and the appointment that freed it. */
const batchRow = (over = {}) => ({
  id: "b1",
  state: "scheduled",
  name: "Fill a cancellation · Tue 3:00 PM",
  template_name: "time_freed",
  template_language: "en_US",
  params: [{ kind: "first_name" }, { kind: "freed_when" }],
  recipient_count: 1,
  playbook_id: "pf",
  audience: { kind: "playbook", id: "pf", trigger: "slot_opened" },
  offered_start: new Date(START).toISOString(),
  offered_end: new Date(END).toISOString(),
  offered_from: "appt-1",
  ...over,
});
/** The cancelled appointment as the record holds it, and what stands on the record now. */
const factsWith = (standing) => ({
  row: {
    id: "appt-1",
    contactId: "person-1",
    startsAt: new Date(START).toISOString(),
    endsAt: new Date(END).toISOString(),
    allDay: false,
  },
  calendar: { tz: "UTC", hours: undefined, closures: undefined, standing, rules: null },
});

function fakes(over = {}) {
  const log = [];
  const answers = {
    broadcast: batchRow(),
    workspacePaused: false,
    facts: { businessName: "Marisa's", bookingLink: "https://book.example/m", timezone: "UTC" },
    batch: [{ contact_id: "k1", facts: { freed_when: "on Tuesday at 3:00 PM", appointment: "appt-1" } }],
    wireUnavailable: null,
    freedTimeFacts: factsWith([]),
    cancelFrom: true,
    recordDecision: "d1",
    startSending: true,
    message: (name, language) => [
      {
        id: "whatsapp-time_freed",
        channel: "whatsapp",
        name,
        language,
        meta_status: "approved",
        category: "utility",
        variables: [],
        hidden_at: null,
        title: null,
        source: "meta",
        components: [],
        body_preview: "Hi {{1}}, a time freed up {{2}}. Want it?",
        rejected_reason: null,
      },
    ],
    byOtherChannels: false,
    offersClosed: null,
    offersUnread: null,
    contacts: () =>
      new Map([
        [
          "k1",
          { id: "k1", phone_e164: "+13475550101", erased_at: null, display_name: "Ada Park", wa_profile_name: null },
        ],
      ]),
    target: () => ({ conversationId: "c-01" }),
    alreadySent: () => new Map(),
    mark: true,
    deliver: (d) => ({ outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" }),
    remaining: 0,
    state: "sending",
    tally: { sent: 1, held: 0 },
    heldFor: [],
    finish: undefined,
    alert: undefined,
    ...over,
  };
  const ports = { now: () => NOW, random: () => 0, sleep: async () => undefined };
  for (const [name, answer] of Object.entries(answers))
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      if (answer instanceof Error) throw answer;
      return typeof answer === "function" ? answer(...args) : answer;
    };
  return { ports, ops: () => log.map((l) => l[0]), of: (name) => log.filter((l) => l[0] === name) };
}
const cmd = { tenantId: "t1", broadcastId: "b1", deadline: NOW + 60_000 };

test("a time booked since it was offered is taken: cancelled as the system, told once, nobody claimed, nothing sent", async () => {
  const f = fakes({ freedTimeFacts: factsWith([{ id: "appt-9", contactId: "person-2", start: START, end: END }]) });
  await sendBroadcastBatch(f.ports, cmd);
  assert.deepEqual(f.ops(), ["cancelFrom", "recordDecision", "alert"]);
  assert.deepEqual(f.of("cancelFrom")[0].slice(1), ["b1", "scheduled"]);
  const [, subject, id, verb, payload] = f.of("recordDecision")[0];
  assert.deepEqual(
    [subject, id, verb, payload.reason, payload.was],
    ["broadcast", "b1", "cancel_broadcast", "taken", "scheduled"],
  );
  const [, told] = f.of("alert")[0];
  assert.equal(told.kind, "broadcast_stopped");
  assert.equal(told.subject, "“Fill a cancellation · Tue 3:00 PM” didn’t go: Tue 3:00 PM was taken");
  assert.match(
    told.body,
    /^Tue 3:00 PM was taken before it went: someone booked it since it freed up, so nobody was offered it\./,
  );
});

test("a cancel that landed first is the row's answer: the batch sends nothing and tells nobody again", async () => {
  const f = fakes({
    freedTimeFacts: factsWith([{ id: "appt-9", contactId: "person-2", start: START, end: END }]),
    cancelFrom: false,
  });
  await sendBroadcastBatch(f.ports, cmd);
  assert.deepEqual(f.ops(), ["cancelFrom"]);
});

test("a time still free, or held only by the calendar's copy of the cancelled visit, goes as every batch does", async () => {
  for (const standing of [[], [{ id: "appt-2", contactId: "person-1", start: START, end: END }]]) {
    const f = fakes({ freedTimeFacts: factsWith(standing) });
    await sendBroadcastBatch(f.ports, cmd);
    assert.deepEqual(f.ops().slice(0, 1), ["startSending"], JSON.stringify(standing));
    assert.equal(f.of("deliver").length, 1);
    assert.deepEqual(f.of("cancelFrom"), []);
  }
});

test("the time's words are read as the send goes: approved the morning after, it says today, never the tomorrow it was made with", async () => {
  // Made Monday at 10 PM, waiting for the owner's OK; approved and sent Tuesday at 10 AM, the day the time is.
  const f = fakes({
    batch: [{ contact_id: "k1", facts: { freed_when: "tomorrow at 3:00 PM", appointment: "appt-1" } }],
  });
  const tuesday = Date.parse("2026-09-08T10:00:00Z");
  f.ports.now = () => tuesday;
  await sendBroadcastBatch(f.ports, { ...cmd, deadline: tuesday + 60_000 });
  const sent = JSON.stringify(f.of("deliver")[0]);
  assert.match(sent, /today at 3:00 PM/);
  assert.doesNotMatch(sent, /tomorrow at 3:00 PM/);
  // A batch that offers no time keeps the words its row was made with.
  const plain = fakes({
    broadcast: batchRow({ offered_start: null, offered_end: null, offered_from: null }),
    batch: [{ contact_id: "k1", facts: { freed_when: "tomorrow at 3:00 PM" } }],
  });
  await sendBroadcastBatch(plain.ports, cmd);
  assert.match(JSON.stringify(plain.of("deliver")[0]), /tomorrow at 3:00 PM/);
});

test("a batch already sending goes on, and a batch that offers no freed time never asks the record", async () => {
  const sending = fakes({
    broadcast: batchRow({ state: "sending" }),
    freedTimeFacts: new Error("a sending batch asked the record"),
  });
  await sendBroadcastBatch(sending.ports, cmd);
  assert.equal(sending.of("deliver").length, 1);
  const plain = fakes({
    broadcast: batchRow({ offered_start: null, offered_end: null, offered_from: null }),
    freedTimeFacts: new Error("a batch with no freed time asked the record"),
  });
  await sendBroadcastBatch(plain.ports, cmd);
  assert.equal(plain.of("deliver").length, 1);
});

/**
 * A campaign's run under Stop everything (core sendBroadcastBatch). Billing's pause FAILS a run and tells its owner to
 * send it again. A stop does neither: the run WAITS as it was, everyone on it still queued and nobody told, and looks
 * again a while on, so it goes on by itself once sending is resumed. Asked at the head of every batch, after the day's
 * hours; and where the stop lands in the middle of a batch, the door holds the next person (deliver.ts stopOf), who is
 * given back, and the run waits the same way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTCOME_UNKNOWN } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";

const { sendBroadcastBatch } = await importSrc("packages/core/src/messages/broadcast/batch.ts");
// The stop's own wait before a run looks again: five minutes.
const STOP_WAIT_MS = 5 * 60_000;

// Noon in UTC, inside the day's sending hours wherever the suite runs.
const NOON = Date.parse("2026-11-13T12:00:00Z");
const WRITES = new Set(["fail", "startSending", "mark", "deliver", "scheduleNext", "finish", "alert"]);
const PEOPLE = {
  k1: { id: "k1", phone_e164: "+13475550101", erased_at: null, display_name: "Ada Lovelace", wa_profile_name: null },
  k2: { id: "k2", phone_e164: "+13475550102", erased_at: null, display_name: "Bo Diaz", wa_profile_name: null },
};
const WHATSAPP_ROW = {
  id: "whatsapp-month_offer",
  channel: "whatsapp",
  name: "month_offer",
  language: "en_US",
  meta_status: "approved",
  category: "marketing",
  variables: [],
  hidden_at: null,
  title: null,
  source: "meta",
  components: [],
  body_preview: "Hi {{1}}, a spring offer from {{2}}.",
  rejected_reason: null,
};

/** The batch's ports, each answering a value or a function of its arguments; the writes are kept in order. */
function runWith(over = {}) {
  const log = [];
  const answers = {
    broadcast: {
      id: "b1",
      state: "sending",
      name: "Spring offer",
      template_name: "month_offer",
      template_language: "en_US",
      params: [{ kind: "first_name" }, { kind: "business_name" }],
      recipient_count: 2,
      playbook_id: null,
      audience: null,
    },
    workspacePaused: false,
    sendingStopped: false,
    message: [WHATSAPP_ROW],
    facts: { businessName: "Harbor Studio", bookingLink: "https://book.example/h", timezone: "UTC" },
    batch: [
      { contact_id: "k1", facts: null },
      { contact_id: "k2", facts: null },
    ],
    contacts: (ids) => new Map(ids.map((id) => [id, PEOPLE[id]])),
    target: (phone) => ({ conversationId: `c-${phone.slice(-2)}` }),
    alreadySent: () => new Map(),
    remaining: 2,
    state: "sending",
    tally: { sent: 0, held: 0 },
    wireUnavailable: null,
    offersClosed: null,
    offersUnread: null,
    byOtherChannels: false,
    heldFor: [],
    startSending: true,
    mark: true,
    // The breath between two sends: no time passes here.
    sleep: undefined,
    deliver: (d) => ({ outcome: "sent", messageId: `m-${d.contactId}`, externalId: "wamid" }),
    ...over,
  };
  const ports = { now: () => over.now ?? NOON, random: () => 0 };
  for (const [name, answer] of Object.entries(answers)) {
    if (name === "now") continue;
    ports[name] = async (...args) => {
      if (WRITES.has(name)) log.push([name, ...args]);
      return typeof answer === "function" ? answer(...args) : answer;
    };
  }
  for (const name of WRITES) ports[name] ??= async (...args) => void log.push([name, ...args]);
  return { ports, log, names: () => log.map((l) => l[0]) };
}
const batchJob = { tenantId: "t1", broadcastId: "b1", deadline: NOON + 60_000 };

test("a stopped workspace's run waits as it was: nobody is claimed, nothing fails, nobody is told, and it looks again a while on", async () => {
  const { ports, log, names } = runWith({ sendingStopped: true });
  await sendBroadcastBatch(ports, batchJob);
  assert.deepEqual(names(), ["scheduleNext"], "no claim, no send, no failure and no alert");
  assert.equal(log[0][1], "b1");
  assert.equal(log[0][2].getTime(), NOON + STOP_WAIT_MS, "the next look, after the stop's own wait");
  assert.equal(log[0][3], undefined, "a stop's wait is none of the run's own troubles: nothing is carried");
});

test("billing's pause still fails the run, stopped or not: nobody knows when it ends", async () => {
  const { ports, log } = runWith({ workspacePaused: true, sendingStopped: true });
  await sendBroadcastBatch(ports, batchJob);
  assert.deepEqual(log[0], ["fail", "b1", "paused"]);
});

test("the day's hours are asked before the stop: outside them a held run waits for the morning, like any run", async () => {
  const night = Date.parse("2026-11-13T23:30:00Z");
  const { ports, log, names } = runWith({ sendingStopped: true, now: night });
  await sendBroadcastBatch(ports, { ...batchJob, deadline: night + 60_000 });
  assert.deepEqual(names(), ["scheduleNext"]);
  assert.ok(log[0][2].getTime() > night + STOP_WAIT_MS, "placed at the next open moment, not a few minutes on");
});

test("a stop that lands mid-batch: the person the door held is given back still queued, the rest are not tried, and the run waits", async () => {
  const held = (d) => ({ outcome: "refused", reason: "stopped", messageId: null, held: true, contactId: d.contactId });
  const { ports, log, names } = runWith({ deliver: held });
  await sendBroadcastBatch(ports, batchJob);
  assert.deepEqual(names(), ["mark", "deliver", "mark", "scheduleNext"], "one person asked, then the run waits");
  assert.deepEqual(
    log.filter((l) => l[0] === "mark").map((l) => [l[2], l[3].state, l[3].reason ?? null]),
    [
      ["k1", "failed", OUTCOME_UNKNOWN],
      ["k1", "queued", "not_taken"],
    ],
    "claimed, then given back: nothing left, so they wait in the queue with everyone after them",
  );
  assert.equal(log.at(-1)[2].getTime(), NOON + STOP_WAIT_MS);
});

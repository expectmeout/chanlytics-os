/**
 * A send waits for WhatsApp (the clean list, step 5a, 15 Nov 2026).
 *
 * WhatsApp says yes to a message's words before anyone is sent them on WhatsApp. A send that met a message it was still
 * checking skipped every WhatsApp person for good, and failed a run with nobody else on it. Here the real batch runs
 * over a world that keeps its people's rows, its clock and WhatsApp's answer, one batch after another as the job would:
 * whoever a text reaches goes at once, WhatsApp's people stay queued and are asked for again, they go once WhatsApp
 * says yes, and where it does not in time each is skipped with the reason, said once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

const { sendBroadcastBatch } = await importSrc("packages/core/src/messages/broadcast/batch.ts");
const { findWhatsAppRetry, whatsappWaitEnds } = await importSrc(
  "packages/core/src/messages/broadcast/whatsapp-wait.ts",
);
const { refuseTicks } = await importSrc("packages/core/src/campaigns/message-channels.ts");
const { waitsAtTheSend } = await importSrc("packages/core/src/campaigns/paced.ts");
const {
  BROADCAST_CHUNK,
  BROADCAST_HOLD_WAIT_MS,
  HELD_REASONS,
  HELD_WHEN_COUNTED,
  broadcastFailureFix,
  broadcastFailureWords,
  campaignMessageOf,
  channelsReady,
  reachFor,
  readyForMessage,
  whatsappWaits,
} = await import("@chanlytics/contracts");

const at = (iso) => Date.parse(iso);
// A Friday, by a business on UTC: its sending hours are 9:00 to 20:59.
const FRI_NOON = at("2026-09-11T12:00:00Z");
const WORDS = "Hi {{1}}, our autumn hours start Monday.";
const NAME = "autumn_hours";

/** The message's rows as the port answers them: WhatsApp's where WhatsApp has it, and a text beside it. */
const rowsOf = (whatsapp, over = {}) =>
  [
    { channel: "whatsapp", meta_status: whatsapp, source: "meta", components: [], ...over },
    { channel: "sms", meta_status: "approved", source: "chanlytics", components: [{ type: "BODY", text: WORDS }] },
  ].map((row) => ({
    id: `${row.channel}-${NAME}`,
    name: NAME,
    language: "en_US",
    category: "utility",
    variables: [],
    hidden_at: null,
    title: null,
    body_preview: WORDS,
    rejected_reason: null,
    ...row,
  }));
const messageOf = (whatsapp, over) => campaignMessageOf(rowsOf(whatsapp, over), NAME, "en_US");

/**
 * A run and its people, kept as the database keeps them: each person's row and state, the run's state, the clock, and
 * where WhatsApp has the message. `step()` runs one batch, as the job the last one placed would.
 */
function world({ people, whatsapp = "pending", now = FRI_NOON, run = {} }) {
  const w = {
    now,
    whatsapp,
    run: {
      id: "b1",
      state: "scheduled",
      name: "Autumn hours",
      template_name: NAME,
      template_language: "en_US",
      params: [{ kind: "first_name" }],
      recipient_count: people.length,
      playbook_id: null,
      audience: null,
      scheduled_for: new Date(now).toISOString(),
      ...run,
    },
    rows: people.map(([contact_id, channel]) => ({ contact_id, channel, facts: null, state: "queued", reason: null })),
    next: null,
    went: [],
    alerts: [],
    failure: null,
  };
  const queued = () =>
    w.rows.filter((r) => r.state === "queued").sort((a, b) => a.contact_id.localeCompare(b.contact_id));
  const count = (state) => w.rows.filter((r) => r.state === state).length;
  const ports = {
    now: () => w.now,
    random: () => 0,
    broadcast: async () => ({ ...w.run }),
    workspacePaused: async () => false,
    sendingStopped: async () => false,
    facts: async () => ({ businessName: "Marisa's", bookingLink: null, timezone: "UTC" }),
    // As the database reads it (db listQueuedRecipients): in the order of their ids, `not` leaving WhatsApp's people out.
    batch: async (_id, limit, only) =>
      queued()
        .filter((r) => only?.not !== "whatsapp" || r.channel !== "whatsapp")
        .slice(0, limit)
        .map(({ contact_id, channel, facts }) => ({ contact_id, channel, facts })),
    wireUnavailable: async () => null,
    startSending: async () => {
      if (w.run.state !== "scheduled") return false;
      w.run.state = "sending";
      return true;
    },
    message: async () => rowsOf(w.whatsapp),
    byOtherChannels: async (_id, than) => w.rows.some((r) => r.channel !== than),
    contacts: async (ids) =>
      new Map(
        ids.map((id) => [
          id,
          { id, phone_e164: "+13475550101", erased_at: null, display_name: "Ada Lovelace", wa_profile_name: null },
        ]),
      ),
    alreadySent: async () => new Map(),
    target: async () => ({ conversationId: "c1" }),
    monthSent: async () => 0,
    // The claim is a compare-and-set: it takes only a person still queued.
    mark: async (_id, contactId, patch) => {
      const row = w.rows.find((r) => r.contact_id === contactId);
      if (patch.state === "failed" && row.state !== "queued") return false;
      Object.assign(row, { state: patch.state, reason: patch.reason ?? null });
      return true;
    },
    deliver: async (d) => {
      w.went.push([d.contactId, d.channel]);
      return { outcome: "sent", messageId: `m-${d.contactId}`, externalId: "x" };
    },
    remaining: async () => queued().length,
    state: async () => w.run.state,
    tally: async () => ({ sent: count("sent"), held: count("skipped") }),
    heldFor: async () => HELD_WHEN_COUNTED.filter((why) => w.rows.some((r) => r.reason === why)),
    finish: async () => {
      w.run.state = "sent";
    },
    fail: async (_id, failure) => {
      w.run.state = "failed";
      w.failure = failure;
    },
    alert: async (news) => {
      w.alerts.push(news);
    },
    scheduleNext: async (_id, dueAt) => {
      w.next = dueAt ?? new Date(w.now);
    },
    sleep: async () => undefined,
  };
  w.step = async () => {
    w.next = null;
    await sendBroadcastBatch(ports, { tenantId: "t1", broadcastId: "b1", deadline: w.now + 60_000 });
  };
  w.states = () => Object.fromEntries(w.rows.map((r) => [r.contact_id, r.reason ? `${r.state}:${r.reason}` : r.state]));
  return w;
}

test("a send by hand whose words WhatsApp is still checking: whoever a text reaches goes at once, WhatsApp's people wait queued and are asked for again, and they go once WhatsApp says yes", async () => {
  const w = world({
    people: [
      ["k1", "whatsapp"],
      ["k2", "sms"],
      ["k3", "whatsapp"],
    ],
  });
  await w.step();
  assert.deepEqual(w.went, [["k2", "sms"]], "the text goes on time");
  assert.deepEqual(w.states(), { k1: "queued", k2: "sent", k3: "queued" }, "nobody on WhatsApp is skipped");
  assert.equal(w.run.state, "sending");
  // The rest are WhatsApp's alone: the next batch finds nobody to send to, and asks again after the wait.
  await w.step();
  assert.deepEqual(w.next, new Date(FRI_NOON + BROADCAST_HOLD_WAIT_MS));
  assert.deepEqual(w.states(), { k1: "queued", k2: "sent", k3: "queued" });
  assert.deepEqual(w.alerts, [], "nothing is said of a wait that ends by itself");
  // WhatsApp says yes: the batch that asks again sends them, and the run ends as sent to everyone.
  w.whatsapp = "approved";
  w.now = w.next.getTime();
  await w.step();
  assert.deepEqual(w.went.slice(1), [
    ["k1", "whatsapp"],
    ["k3", "whatsapp"],
  ]);
  assert.equal(w.run.state, "sent");
  assert.deepEqual(
    [w.alerts[0].kind, w.alerts[0].body],
    ["broadcast_sent", "3 of 3 people got it. Replies land in the Inbox."],
  );
});

test("nobody queues behind the wait: a text person after more WhatsApp people than a batch holds, in the order of their ids, goes in the first batch", async () => {
  const many = Array.from({ length: BROADCAST_CHUNK + 5 }, (_, i) => [`k${String(i).padStart(2, "0")}`, "whatsapp"]);
  const w = world({ people: [...many, ["z1", "sms"]] });
  await w.step();
  assert.deepEqual(w.went, [["z1", "sms"]]);
  assert.equal(w.rows.filter((r) => r.state === "queued").length, BROADCAST_CHUNK + 5, "every WhatsApp person waits");
});

test("a send by hand that only WhatsApp carries stays as it was scheduled while it waits (its Stop still stops it), and goes when WhatsApp says yes", async () => {
  const w = world({ people: [["k1", "whatsapp"]] });
  await w.step();
  assert.equal(w.run.state, "scheduled", "nothing has gone, so it is not marked sending");
  assert.deepEqual(w.next, new Date(FRI_NOON + BROADCAST_HOLD_WAIT_MS));
  assert.deepEqual([w.went, w.alerts, w.states()], [[], [], { k1: "queued" }]);
  w.whatsapp = "approved";
  w.now = w.next.getTime();
  await w.step();
  assert.deepEqual([w.went, w.run.state], [[["k1", "whatsapp"]], "sent"]);
});

test("WhatsApp holding the message for a few hours waits the same; a message it asked a change to, turned off, or cannot be sent whole waits for nothing, and holds its WhatsApp people as before", async () => {
  const held = world({ people: [["k1", "whatsapp"]], whatsapp: "paused" });
  await held.step();
  assert.deepEqual([held.states(), held.run.state, !!held.next], [{ k1: "queued" }, "scheduled", true]);
  for (const status of ["rejected", "disabled"]) {
    const mixed = world({
      people: [
        ["k1", "whatsapp"],
        ["k2", "sms"],
      ],
      whatsapp: status,
    });
    await mixed.step();
    assert.deepEqual(mixed.states(), { k1: "skipped:template_not_approved", k2: "sent" }, status);
    const alone = world({ people: [["k1", "whatsapp"]], whatsapp: status });
    await alone.step();
    assert.deepEqual([alone.run.state, alone.failure], ["failed", "template_not_approved"], status);
  }
  assert.equal(whatsappWaits(messageOf("pending")), true);
  assert.equal(whatsappWaits(messageOf("paused")), true);
  assert.equal(whatsappWaits(messageOf("approved")), false);
  assert.equal(whatsappWaits(messageOf("rejected")), false);
  assert.equal(whatsappWaits(null), false, "a message that is gone waits for nothing");
  // Checking, but with a picture for a heading, which cannot be sent from here once approved either.
  const picture = { components: [{ type: "HEADER", format: "IMAGE" }] };
  assert.equal(whatsappWaits(messageOf("pending", picture)), false);
});

test("a send by hand waits through the night, until the next day's sending hours end: then each WhatsApp person is skipped with the reason, and the run's news says it once", async () => {
  const w = world({
    people: [
      ["k1", "whatsapp"],
      ["k2", "sms"],
    ],
  });
  await w.step();
  // The last minutes of Friday's hours: the next try would fall after them, so it is placed at nine on Saturday.
  w.now = at("2026-09-11T20:55:00Z");
  await w.step();
  assert.deepEqual(w.next, new Date("2026-09-12T09:00:00Z"));
  assert.deepEqual(w.states(), { k1: "queued", k2: "sent" });
  // The last minutes of Saturday's: no try fits before the wait ends, so it ends here.
  w.now = at("2026-09-12T20:55:00Z");
  await w.step();
  assert.deepEqual(w.states(), { k1: "skipped:whatsapp_wait_ended", k2: "sent" });
  assert.equal(w.run.state, "sent");
  assert.equal(w.alerts.length, 1);
  assert.match(w.alerts[0].body, /^1 of 2 people got it; 1 held back \(/);
  assert.ok(w.alerts[0].body.includes(HELD_REASONS.whatsapp_wait_ended), w.alerts[0].body);
  assert.equal(HELD_REASONS.whatsapp_wait_ended, "WhatsApp had not approved the message in time");
});

test("a send by hand with nobody else on it stops when its wait ends, and its owner is told what happened and what to do", async () => {
  const w = world({ people: [["k1", "whatsapp"]], now: at("2026-09-12T20:55:00Z") });
  w.run.scheduled_for = new Date(FRI_NOON).toISOString();
  await w.step();
  assert.deepEqual([w.run.state, w.failure, w.states()], ["failed", "whatsapp_wait_ended", { k1: "queued" }]);
  assert.deepEqual(
    [w.alerts[0].kind, w.alerts[0].subject, w.alerts[0].body],
    [
      "broadcast_stopped",
      "Campaign “Autumn hours” stopped",
      "WhatsApp was still checking the words when this run's time to send ended. Everyone on this run goes by WhatsApp, so nothing was sent. Send it again once WhatsApp has approved the message.",
    ],
  );
  // The run's own page says the same of it.
  assert.equal(broadcastFailureWords("whatsapp_wait_ended"), "WhatsApp had not approved its message in time");
  assert.equal(
    broadcastFailureFix("whatsapp_wait_ended", 0),
    "Nobody got it. Send it again once WhatsApp has approved the message.",
  );
});

test("a sequence's run waits until its day's sending hours end, no longer, and is never told to send it again: its next run reaches them", async () => {
  const sequence = {
    playbook_id: "p1",
    audience: { kind: "playbook", id: "p1", label: "Win-back", trigger: "lapsed" },
  };
  const w = world({ people: [["k1", "whatsapp"]], run: sequence });
  await w.step();
  assert.deepEqual([w.run.state, w.next], ["scheduled", new Date(FRI_NOON + BROADCAST_HOLD_WAIT_MS)]);
  w.now = at("2026-09-11T20:55:00Z");
  await w.step();
  assert.deepEqual([w.run.state, w.failure], ["failed", "whatsapp_wait_ended"]);
  assert.equal(
    w.alerts[0].body,
    "WhatsApp was still checking the words when this run's time to send ended. Everyone on this run goes by WhatsApp, so nothing was sent. It doesn't run again today · the next run reaches the people this one missed, and nobody gets it twice.",
  );
  assert.doesNotMatch(w.alerts[0].body, /send it again/i);
});

test("until when the wait lasts: a sequence's run, its day's sending hours; a send by hand, the next day's; and never past the freed time or the one visit the run is about", () => {
  const ends = (run, now = FRI_NOON, timezone = "UTC") =>
    whatsappWaitEnds({ playbook_id: null, audience: null, ...run }, timezone, now).toISOString();
  const set = "2026-09-11T12:00:00.000Z";
  assert.equal(ends({ scheduled_for: set }), "2026-09-12T21:00:00.000Z", "a send by hand: the next day's hours");
  // Counted from the time it was set for, whenever a batch asks: Saturday's batch reads the same end.
  assert.equal(ends({ scheduled_for: set }, at("2026-09-12T10:00:00Z")), "2026-09-12T21:00:00.000Z");
  assert.equal(ends({ playbook_id: "p1", scheduled_for: set }), "2026-09-11T21:00:00.000Z", "a sequence's: today's");
  // By the business's clock: 21:00 in New York is 01:00 UTC the next day.
  assert.equal(
    ends({ playbook_id: "p1", scheduled_for: set }, at("2026-09-11T15:00:00Z"), "America/New_York"),
    "2026-09-12T01:00:00.000Z",
  );
  const freed = { playbook_id: "p1", offered_start: "2026-09-11T15:00:00.000Z" };
  assert.equal(ends(freed), "2026-09-11T15:00:00.000Z", "a freed time: until it starts");
  const late = (over) => ({
    playbook_id: "p1",
    audience: { late: { appointment: "a1", start: "2026-09-11T16:00:00.000Z", day: "2026-09-11", ...over } },
  });
  assert.equal(ends(late()), "2026-09-11T16:00:00.000Z", "a late booking's reminder: until the visit starts");
  assert.equal(ends(late({ behind: true })), "2026-09-11T21:00:00.000Z", "a visit already behind ends nothing early");
});

test("a freed time's people do not wait once the time is taken, or once it has started: nobody is offered a time nobody can have", async () => {
  const offered = { start: "2026-09-11T15:00:00.000Z", end: "2026-09-11T16:00:00.000Z" };
  const run = {
    id: "b1",
    name: "A freed time",
    playbook_id: "p1",
    audience: { kind: "playbook", id: "p1", label: "Freed time", trigger: "freed_time" },
    offered_start: offered.start,
    offered_end: offered.end,
    offered_from: "a1",
  };
  const ports = (standing, now = FRI_NOON) => ({
    now: () => now,
    random: () => 0,
    freedTimeFacts: async () => ({
      row: { id: "a1", contactId: "k9", startsAt: offered.start, endsAt: offered.end, allDay: false },
      calendar: { tz: "UTC", hours: undefined, closures: undefined, standing },
    }),
  });
  const pending = messageOf("pending");
  assert.deepEqual(
    await findWhatsAppRetry(ports([]), run, pending, "UTC"),
    new Date(FRI_NOON + BROADCAST_HOLD_WAIT_MS),
    "still free: they wait",
  );
  const booked = [{ start: at(offered.start), end: at(offered.end), id: "a2", contactId: "k7" }];
  assert.equal(await findWhatsAppRetry(ports(booked), run, pending, "UTC"), null, "taken since: the wait ends");
  assert.equal(
    await findWhatsAppRetry(ports([], at("2026-09-11T14:55:00Z")), run, pending, "UTC"),
    null,
    "about to start",
  );
  assert.equal(
    await findWhatsAppRetry(ports([]), run, messageOf("approved"), "UTC"),
    null,
    "approved: nothing to wait for",
  );
});

/* ------------------------------------------------------------------------------------------- who is placed to wait */

const READY = channelsReady({
  whatsapp: { canSend: true, refusal: null },
  textLine: { sms_state: "active", reg_mock: false },
  email: { mailbox: true, domain: true },
});
const person = (over = {}) => ({
  id: "p1",
  phone: "+15550100",
  email: null,
  lastChannel: null,
  consent: {
    state: "opted_in",
    dnc: false,
    marketing: "unknown",
    channels: ["whatsapp", "sms"],
    marketingChannels: null,
    relationship: true,
  },
  ...over,
});

test("a send that waits places on WhatsApp only the people nothing else reaches: whoever a text reaches goes by text now, and a send that cannot wait holds them as before", () => {
  const ready = readyForMessage(READY, messageOf("pending"));
  assert.deepEqual(
    [ready.whatsapp.ready, ready.whatsapp.waits, ready.whatsapp.why],
    [
      false,
      true,
      "WhatsApp is checking this message. It sends by itself once approved (usually minutes, sometimes a day).",
    ],
  );
  assert.equal(readyForMessage(READY, messageOf("rejected")).whatsapp.waits, undefined, "a refusal does not wait");
  assert.equal(readyForMessage(READY, messageOf("approved")).whatsapp.waits, undefined);
  const both = { channels: ["whatsapp", "sms"], ready, about: "ours" };
  const alone = { channels: ["whatsapp"], ready, about: "ours" };
  // Someone a text reaches goes by text, on time, though WhatsApp is where they last wrote.
  assert.equal(reachFor(person({ lastChannel: "whatsapp" }), "conversational", { ...both, wait: true }).channel, "sms");
  // Someone only WhatsApp reaches is placed on it, to wait; without the wait they are held, as a run that cannot wait holds them.
  assert.deepEqual(reachFor(person(), "conversational", { ...alone, wait: true }), { channel: "whatsapp", held: null });
  assert.deepEqual(reachFor(person(), "conversational", alone), { channel: null, held: "no_channel" });
  // The wait changes nobody's answer: someone who asked to stop is still held for it.
  const stopped = person({ consent: { ...person().consent, state: "opted_out" } });
  assert.deepEqual(reachFor(stopped, "conversational", { ...alone, wait: true }), { channel: null, held: "stopped" });
});

test("the send's door keeps a tick WhatsApp is still checking only for a send that waits, and still refuses one WhatsApp refused", () => {
  const how = (status, wait) => ({
    channels: ["whatsapp"],
    ready: readyForMessage(READY, messageOf(status)),
    about: "ours",
    ...(wait ? { wait: true } : {}),
  });
  assert.doesNotThrow(() => refuseTicks(how("pending", true), "conversational"));
  assert.doesNotThrow(() => refuseTicks(how("paused", true), "conversational"));
  assert.throws(() => refuseTicks(how("pending", false), "conversational"), /WhatsApp is checking this message/);
  assert.throws(() => refuseTicks(how("rejected", true), "conversational"), /asked for a change/);
});

test("a run with no day of its own is made though WhatsApp is still checking its message, and waits at the send; the day's own run waits as a whole instead", () => {
  const pending = messageOf("pending");
  const run = (over) => ({ channels: ["whatsapp", "sms"], freed: null, late: null, occasion: null, ...over });
  assert.equal(waitsAtTheSend(run({ freed: { id: "a1" } }), pending), true, "a freed time");
  assert.equal(waitsAtTheSend(run({ late: { contactId: "k1" } }), pending), true, "a late booking's reminder");
  assert.equal(waitsAtTheSend(run({ occasion: { contactId: "k1" } }), pending), true, "an occasion's step");
  assert.equal(waitsAtTheSend(run({}), pending), false, "the day's run waits whole (waitsOnWhatsApp)");
  assert.equal(waitsAtTheSend(run({ freed: { id: "a1" } }), messageOf("rejected")), false);
  assert.equal(waitsAtTheSend(run({ freed: { id: "a1" }, channels: ["sms"] }), pending), false, "WhatsApp not ticked");
});

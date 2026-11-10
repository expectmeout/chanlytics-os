/**
 * What happens to the words (core inbound/dispatch.ts, handled.ts): the hold window, the send, a handoff that landed
 * or did not, and the stamp every way out writes.
 *
 * The verb runs for real over the receptionist's world (../_world.mjs): its gates as themselves, everything outside
 * them (the database, the memory, the runtime, the sink, the alerts, the pager, the model) as fakes handed in through
 * its ports. What is asserted is what a customer, an owner and the platform would see. Split by phase out of
 * tests/whatsapp/inbound-executed.test.mjs (the inbound review of 3 Nov 2026, D4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HANDLED_OUTCOMES } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";
import { FROM, FROM_ITS_EVENT, runtime, text, world } from "../_world.mjs";
import {
  photo,
  sure,
  handledOf,
  reply,
  never,
  refused,
  failed,
  voice,
  veto,
  floor,
  onAsk,
  unsure,
  lateText,
  carriersHold,
  overBudget,
} from "./_fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { pgSink } = await import(at("apps/edge/lib/inbound/persist.ts"));
const { handoffMessage } = await import(at("apps/edge/lib/inbound/alerts.ts"));

test("a hold that cannot be written: the veto window sends now and says so; the confidence floor sends nothing and hands the thread to a person", async () => {
  const sure = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
  const unsure = { ...sure, confidence: 0.3 };
  const model = (meta) => ({
    brain: async () => ({ generateReply: async () => ({ text: "We open at 9.", escalate: false, meta }) }),
  });
  // queueReply answers false in this world: no hold can be written.
  const veto = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "veto", limits: { reply_delay_ms: 60_000 } } } }),
  });
  await veto.run(text("when do you open?"), model(sure));
  assert.equal(veto.seen.sent.length, 1, "the veto window is a comfort: the reply goes now rather than late");
  assert.equal(veto.seen.escalations.length, 0);
  assert.equal(veto.seen.processed, 1);

  const floor = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } }),
  });
  await floor.run(text("when do you open?"), model(unsure));
  assert.equal(
    floor.seen.sent.length,
    0,
    "the floor is a policy: a reply the model is not sure of never sends itself, whatever the database did",
  );
  assert.equal(floor.seen.escalations.length, 1);
  assert.equal(floor.seen.escalations[0].reason, "policy_block");
  assert.match(floor.seen.escalations[0].details, /not sure enough/);
  assert.match(floor.seen.escalations[0].details, /could not be written/);
  assert.match(floor.seen.escalations[0].details, /when do you open/, "the customer's words travel with it");
  assert.equal(floor.seen.pauses.length, 1, "the thread is a person's for the pause window");
  assert.deepEqual(floor.seen.alerts, [], FROM_ITS_EVENT);
  assert.equal(floor.seen.processed, 1, "marked handled: the redelivery gate holds");
  const t = floor.thread();
  assert.ok(t.pausedUntil > Date.now());
  assert.deepEqual(
    t.history.map((h) => h.role),
    ["user"],
    "the unsent words are not remembered as said",
  );
  // Nor could the handoff be written: the owner is told here, that nothing was sent.
  const unwritten = world({
    escalateAnswer: "failed",
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } }),
  });
  await unwritten.run(text("when do you open?"), model(unsure));
  assert.equal(unwritten.seen.alerts.length, 1, "the owner is told");
  // Named by its key, and said in the owner's words: nothing was sent (alerts.ts OWN_WORDS).
  assert.equal(unwritten.seen.alerts[0].reason, "low confidence, not held");
  const notice = handoffMessage({
    threadId: FROM,
    userText: "when do you open?",
    botText: "-",
    reason: "low confidence, not held",
  });
  assert.match(notice.subject, /nothing was sent/);

  // Sure enough under the same floor: the reply goes (the hold was never asked for).
  const fine = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ policy: { reply: { mode: "auto", limits: { min_confidence: 0.7, reply_delay_ms: 60_000 } } } }),
  });
  await fine.run(text("when do you open?"), model(sure));
  assert.equal(fine.seen.sent.length, 1);
});

test("a handoff names the wire the customer wrote on, and promises a pause only where one happened", async () => {
  // The email hardcoded "WhatsApp" and hardcoded the pause, so an owner with
  // both wires connected opened the wrong app, and one told "the receptionist
  // is paused on this thread for 24h" by a branch that paused nothing replied
  // at their leisure and was talked over by the bot's next reply. These are the handler's own words, for a hold the
  // database refused; a written one is told from its event, whose pause line reads the thread's own pause.
  const held = world({ escalateAnswer: "failed", rt: runtime({ policy: { reply: { mode: "ask", limits: {} } } }) });
  await held.run(text("can I book Friday?"));
  assert.equal(held.seen.alerts.length, 1);
  assert.equal(held.seen.alerts[0].pauseHours, null, "'ask' never pauses the thread, so the email must not say it did");
  assert.equal(held.seen.alerts[0].channel, "whatsapp");
  assert.equal(held.seen.pauses.length, 0);

  // The escalating reply DOES pause, and says so.
  const paged = world({ escalateAnswer: "failed" });
  await paged.run(text("hi"));
  assert.equal(paged.seen.alerts[0].pauseHours, 24);
  assert.equal(paged.seen.pauses.length, 1);

  const sms = world({
    escalateAnswer: "failed",
    carrier: {
      channel: "sms",
      send: async () => ({ ok: true, wamid: "s1", status: 200 }),
      body: (t) => t,
      held: null,
    },
  });
  await sms.run(text("are you open?"));
  assert.equal(
    sms.seen.alerts[0].channel,
    "sms",
    "a text is not a WhatsApp message, and the owner opens the thread this names",
  );
});

test("each way out says what the message became, and what it was about where the model read it; every outcome the set declares is reached and none it does not", async () => {
  const live = { env: { modelKey: "sk-test" } };
  const cases = [
    ["a reply that left", world(live), text("when do you open?"), reply("We open at 9."), [["ai", "hours"]]],
    [
      "a reply that left and handed over",
      world(live),
      text("I want to speak to someone"),
      reply("A person will be in touch.", sure, true),
      [["handoff", "hours"]],
    ],
    [
      "a reply waiting out the veto window",
      world({ ...live, rt: veto, queue: true }),
      text("when do you open?"),
      reply("We open at 9."),
      [["held", "hours"]],
    ],
    [
      "a held reply that asks for a person",
      world({ ...live, rt: veto, queue: true }),
      text("I want to speak to someone"),
      reply("A person will be in touch.", sure, true),
      [["handoff", "hours"]],
    ],
    [
      "a reply the confidence floor holds",
      world({ ...live, rt: floor, queue: true }),
      text("when do you open?"),
      reply("We open at 9.", unsure),
      [["held", "hours"]],
    ],
    [
      "a floor hold that could not be written",
      world({ ...live, rt: floor }),
      text("when do you open?"),
      reply("We open at 9.", unsure),
      [["handoff", "hours"]],
    ],
    [
      "a reply the wire refused",
      world({ ...live, delivered: refused }),
      text("when do you open?"),
      reply("We open at 9."),
      [["blocked", "hours"]],
    ],
    [
      // An escalation landed, so a person was asked: the message says so. It is NOT marked processed (the deadman finishes it).
      "a reply that could not be delivered is a handoff, and the message stays unprocessed",
      world({ ...live, delivered: failed }),
      text("when do you open?"),
      reply("We open at 9."),
      [["handoff", "hours"]],
      "unprocessed",
    ],
    ["no model key: the holding message and a person", world(), text("hi"), {}, [["handoff", null]]],
    [
      "a thumbs-up",
      world(),
      {
        from: FROM,
        id: "wamid.like",
        type: "reaction",
        timestamp: String(Math.floor(Date.now() / 1000)),
        reaction: { message_id: "wamid.1", emoji: "\u{1F44D}" },
      },
      {},
      [["blocked", null]],
    ],
    ["a short code", world(), text("Your code is 482913", "wamid.3", "12345"), {}, [["blocked", null]]],
    // News, not a wait (decision 0048): nobody is asked, so it is not a handoff.
    ["STOP", world(), text("STOP"), {}, [["blocked", null]]],
    ["a yes, confirmed", world(), text("START"), {}, [["ai", null]]],
    ["a yes whose confirmation did not go", world({ delivered: failed }), text("START"), {}, [["handoff", null]]],
    ["a workspace on ask", world({ rt: onAsk }), text("can I book Friday?"), {}, [["handoff", null]]],
    ["a voice note, acknowledged and handed over", world(), voice(), {}, [["handoff", null]]],
    [
      "a photo it meant to read and could not",
      world({ rt: runtime({ features: { vision: true } }), media: null }),
      photo("wamid.pic2", "is this shade too dark?"),
      {},
      [["handoff", null]],
    ],
    [
      "the thread's turn is a newer message's",
      world({ ...live, turn: { claim: async () => false, holds: async () => true } }),
      text("when do you open?"),
      never,
      [["ai", null]],
    ],
    [
      "the turn was taken while the model answered",
      world({ ...live, turn: { claim: async () => true, holds: async () => false } }),
      text("when do you open?"),
      reply("We open at 9."),
      [["ai", "hours"]],
    ],
    [
      "the carriers' hold: a line not approved for texting",
      world({ carrier: carriersHold }),
      text("hi"),
      {},
      [["handoff", null]],
    ],
    ["a message that arrived too late to answer", world(), lateText(), {}, [["handoff", null]]],
    [
      "the day's model budget is spent",
      world({ rt: overBudget, tokensUsed: 5000 }),
      text("when do you open?"),
      never,
      [["handoff", null]],
    ],
  ];
  const reached = new Set();
  for (const [name, w, message, extra, want, unprocessed] of cases) {
    await w.run(message, extra);
    assert.deepEqual(handledOf(w), want, name);
    assert.equal(
      w.seen.processed,
      unprocessed ? 0 : want.length,
      `${name}: marked processed exactly where the way out finishes the message`,
    );
    for (const [how] of want) reached.add(how);
  }
  assert.deepEqual(
    [...reached].sort(),
    [...HANDLED_OUTCOMES].sort(),
    "every declared outcome is stamped by some way out, and none that is not declared",
  );
});

test("a handoff is an escalation that LANDED: one the database refused asked nobody, and the message says what else became of it", async () => {
  const live = { env: { modelKey: "sk-test" }, escalateAnswer: "failed" };
  const cases = [
    // The reply's own fate decides it when nobody was asked.
    [
      "a reply that left and asked for a person, the escalation refused: the receptionist answered and nobody was asked",
      world(live),
      text("I want to speak to someone"),
      reply("A person will be in touch.", sure, true),
      [["ai", "hours"]],
    ],
    [
      "a held reply that asks for a person, the escalation refused: it waits and nobody was asked",
      world({ ...live, rt: veto, queue: true }),
      text("I want to speak to someone"),
      reply("A person will be in touch.", sure, true),
      [["held", "hours"]],
    ],
    [
      "a floor hold that could not be written and an escalation that could not either: nothing went out and nobody was asked",
      world({ ...live, rt: floor }),
      text("when do you open?"),
      reply("We open at 9.", unsure),
      [["blocked", "hours"]],
    ],
    [
      "no model key, the escalation refused: the holding message left and nobody was asked",
      world({ escalateAnswer: "failed" }),
      text("hi"),
      {},
      [["ai", null]],
    ],
    [
      "STOP, the escalation refused: nothing went out and nobody was asked",
      world({ escalateAnswer: "failed" }),
      text("STOP"),
      {},
      [["blocked", null]],
    ],
    [
      "a workspace on ask, the escalation refused",
      world({ rt: onAsk, escalateAnswer: "failed" }),
      text("can I book Friday?"),
      {},
      [["blocked", null]],
    ],
    [
      "a voice note acknowledged, the escalation refused: the receptionist spoke and nobody was asked",
      world({ escalateAnswer: "failed" }),
      voice(),
      {},
      [["ai", null]],
    ],
    [
      "a yes whose confirmation did not go and whose escalation was refused: nothing went out and nobody was asked",
      world({ delivered: failed, escalateAnswer: "failed" }),
      text("START"),
      {},
      [["blocked", null]],
    ],
    [
      "a reply that could not be delivered, the escalation refused: nobody was asked, so nothing is stamped and the message stays unfinished",
      world({ ...live, delivered: failed }),
      text("when do you open?"),
      reply("We open at 9."),
      [],
      "unprocessed",
    ],
    [
      "the carriers' hold, the escalation refused: nothing was said and nobody was asked",
      world({ carrier: carriersHold, escalateAnswer: "failed" }),
      text("hi"),
      {},
      [["blocked", null]],
    ],
    [
      "a message that arrived too late, the escalation refused",
      world({ escalateAnswer: "failed" }),
      lateText(),
      {},
      [["blocked", null]],
    ],
    [
      "the day's model budget is spent, the escalation refused",
      world({ rt: overBudget, tokensUsed: 5000, escalateAnswer: "failed" }),
      text("when do you open?"),
      never,
      [["blocked", null]],
    ],
    // A hold already open is still a person asked, and so is a changed one.
    [
      "a workspace on ask, the hold refreshed",
      world({ rt: onAsk, escalateAnswer: "refreshed" }),
      text("hi"),
      {},
      [["handoff", null]],
    ],
    [
      "a workspace on ask, the hold changed",
      world({ rt: onAsk, escalateAnswer: "changed" }),
      text("hi"),
      {},
      [["handoff", null]],
    ],
  ];
  for (const [name, w, message, extra, want, unprocessed] of cases) {
    await w.run(message, extra);
    assert.deepEqual(handledOf(w), want, name);
    assert.equal(
      w.seen.processed,
      unprocessed ? 0 : want.length,
      `${name}: marked processed exactly where the way out finishes the message`,
    );
    assert.equal(
      w.seen.escalations.length,
      want.filter(([how]) => how === "handoff").length,
      `${name}: a person is asked exactly where the message is a handoff`,
    );
  }
});

test("a stamp the database refuses never costs the customer their reply: the real sink's processed, over a database without the door", async () => {
  const doors = [];
  const db = fakeDb(
    {},
    {},
    {
      mark_processed: () => {
        doors.push("mark_processed");
        return null;
      },
      message_stamp_handled: () => {
        doors.push("message_stamp_handled");
        throw new Error("connection reset");
      },
    },
  );
  const w = world({ env: { modelKey: "sk-test" }, realProcessed: (ing) => pgSink(db, "t1", ing).processed });
  await w.run(text("when do you open?"), reply("We open at 9."));
  assert.deepEqual(
    w.seen.sent.map((m) => m.body),
    ["We open at 9."],
    "the reply left",
  );
  assert.deepEqual(
    doors,
    ["mark_processed", "message_stamp_handled"],
    "processed_at was written, and the stamp was tried",
  );
});

test("a reply that could not be delivered, over the real sink: the stamp is written and processed_at is not, so the deadman sweep still finds the message", async () => {
  const doors = [];
  const db = fakeDb(
    {},
    {},
    {
      mark_processed: () => {
        doors.push("mark_processed");
        return null;
      },
      message_stamp_handled: (a) => {
        doors.push(["message_stamp_handled", a.p_handled, a.p_intent ?? null]);
        return null;
      },
    },
  );
  const w = world({ env: { modelKey: "sk-test" }, delivered: failed, forwardTo: (ing) => pgSink(db, "t1", ing) });
  await w.run(text("when do you open?"), reply("We open at 9."));
  assert.deepEqual(
    w.seen.sent.map((m) => m.body),
    ["We open at 9."],
    "the send was tried, and failed",
  );
  assert.deepEqual(
    w.seen.escalations.map((e) => e.reason),
    ["send_failed"],
    "a person was asked",
  );
  assert.deepEqual(
    doors,
    [["message_stamp_handled", "handoff", "hours"]],
    "the message says it was handed over, and was never marked processed: processed_at stays unwritten",
  );
});

test("a reply that waits to go in the owner's name tells them once, with when it goes and why it waits; one that could not wait tells nothing of a wait (decision 0064, step 2)", async () => {
  const live = { env: { modelKey: "sk-test" } };
  const before = Date.now();
  const held = world({ ...live, rt: veto, queue: true });
  await held.run(text("when do you open?"), reply("We open at 9."));
  assert.equal(held.seen.queued.length, 1, "the reply waits");
  assert.equal(held.seen.heldTold.length, 1, "and the owner is told once");
  const told = held.seen.heldTold[0];
  assert.deepEqual([told.reply, told.unsure], ["We open at 9.", false]);
  assert.ok(told.atMs >= before + 60_000 && told.atMs <= Date.now() + 60_000, "when it goes: its own wait");
  const unsureHeld = world({ ...live, rt: floor, queue: true });
  await unsureHeld.run(text("when do you open?"), reply("We open at 9.", unsure));
  assert.deepEqual(
    unsureHeld.seen.heldTold.map((n) => n.unsure),
    [true],
    "the confidence floor's wait says it was not sure",
  );
  // A hold that could not be written: the veto window's reply went now, so no wait is told.
  const sentNow = world({ ...live, rt: veto });
  await sentNow.run(text("when do you open?"), reply("We open at 9."));
  assert.deepEqual([sentNow.seen.sent.length, sentNow.seen.heldTold.length], [1, 0]);
  // Nothing held, nothing told.
  const plain = world(live);
  await plain.run(text("when do you open?"), reply("We open at 9."));
  assert.deepEqual(plain.seen.heldTold, []);
});

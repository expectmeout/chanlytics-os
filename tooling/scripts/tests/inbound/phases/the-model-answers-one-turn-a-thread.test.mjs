/**
 * The model's turn (core inbound/model-turn.ts, turn.ts): no model, a model that fails, the holding message, the
 * thread's one reply turn, and what the model is told.
 *
 * The verb runs for real over the receptionist's world (../_world.mjs): its gates as themselves, everything outside
 * them (the database, the memory, the runtime, the sink, the alerts, the pager, the model) as fakes handed in through
 * its ports. What is asserted is what a customer, an owner and the platform would see. Split by phase out of
 * tests/whatsapp/inbound-executed.test.mjs (the inbound review of 3 Nov 2026, D4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FROM, FROM_ITS_EVENT, GREETING, runtime, text, world } from "../_world.mjs";
import { photo, sure, answers, modelWorld } from "./_fixtures.mjs";

test("no model key: the workspace's greeting leaves labelled a fallback, the thread goes to a person, the platform is paged once", async () => {
  const w = world();
  await w.run(text("hi, do you have time tomorrow?"));
  assert.deepEqual(w.seen.sent, [
    { to: FROM, body: GREETING, meta: { ack: true, fallback: "no_model" }, channel: "whatsapp" },
  ]);
  assert.equal(w.seen.escalations.length, 1);
  assert.equal(w.seen.escalations[0].reason, "brain_error");
  assert.match(w.seen.escalations[0].details, /no model key/);
  assert.match(w.seen.escalations[0].details, /do you have time tomorrow/, "the customer's words travel with it");
  assert.deepEqual(w.seen.alerts, [], FROM_ITS_EVENT);
  assert.deepEqual(
    w.seen.pages.map((p) => p.key),
    ["brain_unavailable"],
  );
  // A hold the database refused is told here, by the customer's name, opening the thread it names.
  const unwritten = world({ escalateAnswer: "failed" });
  await unwritten.run(text("hi, do you have time tomorrow?"));
  assert.deepEqual(
    unwritten.seen.refused.map((e) => e.reason),
    ["brain_error"],
  );
  assert.deepEqual(
    unwritten.seen.alerts.map((a) => [a.reason, a.who, a.route]),
    [["no model", "Dana", "inbox/th-conv1"]],
  );
  assert.equal(
    unwritten.seen.alerts[0].target.slug,
    "harbor",
    "the alert's mail links the workspace's own page: its address word rides with the recipients the runtime read",
  );
  assert.equal(w.seen.pauses.length, 1, "the thread is handed over for the pause window");
  assert.equal(w.seen.processed, 1);
  const t = w.thread();
  assert.ok(t.pausedUntil > Date.now(), "the memory says a person has it");
  assert.deepEqual(
    t.history.map((h) => h.role),
    ["user", "assistant"],
  );
  // Labelled an acknowledgement, so it does not spend the cap that exists to
  // stop loops -- the same rule that keeps three photos in a morning from
  // silencing the receptionist for the day (reply-cap.test.mjs).
  assert.equal(t.replies.length, 0);
});

test("REGRESSION (S5): with no model key the greeting names the business and its booking link as they are now", async () => {
  const rt = runtime({
    brain: {
      ...runtime().brain,
      booking_link: "https://book.example/harbor",
      fallbacks: {
        ...runtime().brain.fallbacks,
        greeting: "Thanks for writing to {business}. Book at {booking link}.",
      },
    },
  });
  const w = world({ rt });
  await w.run(text("hi, do you have time tomorrow?"));
  assert.deepEqual(
    w.seen.sent.map((s) => s.body),
    ["Thanks for writing to Harbor Nails. Book at https://book.example/harbor."],
  );
});

test("REGRESSION (S5): the holding message is filled as it goes out, whether the model hands it back or fails outright", async () => {
  const rt = runtime({
    brain: {
      ...runtime().brain,
      fallbacks: { ...runtime().brain.fallbacks, error: "Sorry — {business} will reply here soon." },
    },
  });
  const handedBack = world({ rt, env: { modelKey: "k" } });
  await handedBack.run(text("are you open?"), {
    brain: async () => ({
      generateReply: async (_h, _t, _s, fallback) => ({ text: fallback, escalate: true, reason: "refusal" }),
    }),
  });
  assert.deepEqual(
    handedBack.seen.sent.map((s) => s.body),
    ["Sorry — Harbor Nails will reply here soon."],
    "handed to the model filled, so what it hands back is filled",
  );
  const failed = world({ rt, env: { modelKey: "k" } });
  await failed.run(text("are you open?", "wamid.2"), {
    brain: async () => ({
      generateReply: async () => {
        throw new Error("model down");
      },
    }),
  });
  assert.deepEqual(
    failed.seen.sent.map((s) => s.body),
    ["Sorry — Harbor Nails will reply here soon."],
  );
});

test("a message whose thread's turn a newer message holds is handled and answered by that one: the model is not asked, nothing is sent", async () => {
  const claims = [];
  const w = modelWorld({
    claim: async (_db, tenant, conversation, message) => {
      claims.push([tenant, conversation, message]);
      return false;
    },
    holds: async () => {
      throw new Error("a turn that was never held is not asked again");
    },
  });
  await w.run(text("when do you open?"), {
    brain: async () => {
      throw new Error("the model must not be asked for a message a newer one answers");
    },
  });
  assert.deepEqual(claims, [["t1", "conv1", "m-in"]], "claimed for this message, in its thread");
  assert.equal(w.seen.sent.length, 0);
  assert.equal(w.seen.escalations.length, 0, "the newer message answers both: nobody is handed a thread for this");
  assert.equal(w.seen.processed, 1, "handled, so a redelivery is the duplicate it is");
});

test("a turn a newer message took while the model was answering: the words are not sent, the tokens are counted as spent", async () => {
  const w = modelWorld({ claim: async () => true, holds: async () => false });
  await w.run(text("when do you open?"), answers("We open at 9."));
  assert.equal(w.seen.sent.length, 0, "the newer message's reply goes; this one's does not go after it");
  assert.equal(w.seen.processed, 1);
  assert.equal(w.seen.usage.length, 1, "the model was asked, and says so");
  assert.equal(w.seen.usage[0].held, "superseded", "a reply that did not go out, so no first-reply milestone");
  assert.equal(w.seen.usage[0].input_tokens, 40);
  assert.deepEqual(
    w.thread().history.map((h) => h.role),
    ["user"],
    "the unsent words are not remembered as said",
  );
});

test("a message that holds its thread's turn is answered as it always was", async () => {
  const held = [];
  const w = modelWorld({
    claim: async () => true,
    holds: async (_db, conversation, message) => {
      held.push([conversation, message]);
      return true;
    },
  });
  await w.run(text("when do you open?"), answers("We open at 9."));
  assert.deepEqual(held, [["conv1", "m-in"]], "asked again once the model had answered, before the words went out");
  assert.deepEqual(
    w.seen.sent.map((m) => m.body),
    ["We open at 9."],
  );
});

test("the turn's bookkeeping never costs a reply: a claim or a check that cannot be read, or an adapter with none, is a turn held", async () => {
  const broken = modelWorld({
    claim: async () => {
      throw new Error("claim_reply_turn: connection reset");
    },
    holds: async () => {
      throw new Error("holds_reply_turn: connection reset");
    },
  });
  await broken.run(text("when do you open?"), answers("We open at 9."));
  assert.deepEqual(
    broken.seen.sent.map((m) => m.body),
    ["We open at 9."],
  );
  assert.equal(broken.seen.processed, 1);

  const none = modelWorld(undefined);
  await none.run(text("when do you open?"), answers("We open at 9."));
  assert.equal(none.seen.sent.length, 1);
});

test("a message with a photo the receptionist looks at takes no part in the turn: its picture is seen by its own model turn only, so a newer text does not answer for it", async () => {
  const refuses = (what) => async () => {
    throw new Error(`a photo must not ${what} the thread's turn`);
  };
  const w = world({
    env: { modelKey: "sk-test" },
    rt: runtime({ features: { vision: true } }),
    media: { mime: "image/jpeg", bytes: new Uint8Array([1, 2, 3]) },
    turn: { claim: refuses("claim"), holds: refuses("ask for") },
  });
  await w.run(photo("wamid.pic9", "is this shade too dark?"), answers("A little, yes."));
  assert.equal(w.seen.media, 1, "the picture was fetched for the model");
  assert.deepEqual(
    w.seen.sent.map((m) => m.body),
    ["A little, yes."],
    "and answered, whoever else holds the thread",
  );
  assert.equal(w.seen.processed, 1);
});

test("the model is told who the person is with the conversation's channel: a text is said to be one, and is never told it has not been asked for the yes to offers", async () => {
  // A text rides this road on the WhatsApp prompt, which says WhatsApp. The ask for the yes to offers is for WhatsApp
  // alone (contracts offers-ask.ts), so the lead note carries the channel and withholds the sentence that lets it ask.
  const lead = {
    contactId: "k1",
    conversationId: "conv1",
    name: "Dana",
    returning: true,
    lastSeenAt: null,
    history: [{ role: "user", content: "hi" }],
    optedOut: false,
    marketingConsent: "unknown",
    offersAskedAt: null,
  };
  const leads = { read: async () => lead, personReplyMode: async () => null };
  const asked = async (over) => {
    const notes = [];
    const w = world({ env: { modelKey: "sk-test" }, ...over });
    await w.run(text("are you open?"), {
      leads,
      brain: async () => ({
        generateReply: async (_h, _t, _s, _f, leadNote) => {
          notes.push(leadNote);
          return { text: "We open at 9.", escalate: false, meta: sure };
        },
      }),
    });
    assert.equal(notes.length, 1, "the model was asked once");
    return notes[0];
  };
  const onWhatsApp = await asked({});
  assert.match(onWhatsApp, /Has not been asked for the yes to offers\./);
  assert.doesNotMatch(onWhatsApp, /text message/);

  const byText = await asked({
    carrier: {
      channel: "sms",
      send: async () => ({ ok: true, wamid: "s1", status: 200 }),
      body: (t) => t,
      held: null,
    },
  });
  assert.match(byText, /This conversation is by text message, not WhatsApp\./);
  assert.doesNotMatch(byText, /Has not been asked/);
});

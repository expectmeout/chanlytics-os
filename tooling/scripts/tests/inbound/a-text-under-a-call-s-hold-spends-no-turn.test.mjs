/**
 * A text that arrives while a call (or a person) holds the thread (00132) is set aside before the model is asked: the
 * send door's own question (core deliver-hold.ts heldByThread), asked in the gates (reply-gates.ts heldByTheLiveHold)
 * with the door's own answer, so no turn is spent on words the wire would refuse. The handler runs for real over the
 * world of ./_world.mjs, as whatsapp/inbound-executed.test.mjs runs it; the memory's hold comes from the world.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runtime, text, world } from "./_world.mjs";
import { linesOf } from "../_log-lines.mjs";

const live = { env: { modelKey: "sk-test" } };
const meta = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
/** A model that answers these words. */
const answers = (words) => ({
  brain: async () => ({
    generateReply: async () => ({ text: words, escalate: false, meta, usage: { input_tokens: 40 } }),
  }),
});
/** A model that must not be reached. */
const noModel = {
  brain: async () => {
    throw new Error("the model must not be asked");
  },
};
const onVeto = runtime({ policy: { reply: { mode: "veto", limits: { reply_delay_ms: 60_000 } } } });
/** What each message became, as the sink was told. */
const stamps = (w) => w.seen.handled.map((s) => [s.how, s.intent]);
/** The thread's live hold as the memory reads it: a call in progress on it, until then. */
const onCall = (until = Date.now() + 10 * 60_000) => ({
  kind: "call",
  ref: "call_1",
  until: new Date(until).toISOString(),
});

test("a text that arrives while a call holds the thread is set aside before the model is asked: the wire's own answer, a step early, and no turn spent on it", async () => {
  // The model was asked, and the wire then refused its reply as human_has_it (deliver-hold.ts heldByThread): a turn
  // spent on words that never went. The same answer, now before the model: nothing said, nobody asked (the call has
  // them), the message handled, and said as the wire says it.
  const held = world({ ...live, control: onCall() });
  const { lines } = await linesOf(() => held.run(text("are you open?"), noModel));
  assert.deepEqual(held.seen.sent, [], "nothing left");
  assert.deepEqual(held.seen.escalations, [], "nobody is asked: the call has them");
  assert.deepEqual(held.seen.usage, [], "no model turn was spent");
  assert.deepEqual(stamps(held), [["blocked", null]], "set aside, as the wire sets a refused reply aside");
  assert.equal(held.seen.processed, 1);
  assert.deepEqual(
    lines.filter((l) => l.event === "wa_refused_at_wire").map((l) => [l.reason, l.held_by]),
    [["human_has_it", "call"]],
    "the wire's own event and reason, and whose hold it was",
  );
  // A hold that has run out holds nothing: the fact expires, and the text is answered as always.
  const lapsed = world({ ...live, control: onCall(Date.now() - 1000) });
  await lapsed.run(text("are you open?", "wamid.2"), answers("We open at 9."));
  assert.equal(lapsed.seen.sent.length, 1, "a hold that ran out holds nothing");
  // A person's hold the pause did not say (the pause's gate is above this one): held the same way the wire holds it.
  const theirs = world({ ...live, control: { kind: "person", ref: null, until: onCall().until } });
  await theirs.run(text("hello?", "wamid.3"), noModel);
  assert.deepEqual([theirs.seen.sent, theirs.seen.escalations, stamps(theirs)], [[], [], [["blocked", null]]]);
  // Under the veto window too: the draft would meet the same hold at the wire, so no draft is written either.
  const drafted = world({ ...live, rt: onVeto, queue: true, control: onCall() });
  await drafted.run(text("are you open?", "wamid.4"), noModel);
  assert.deepEqual([drafted.seen.queued, drafted.seen.sent, stamps(drafted)], [[], [], [["blocked", null]]]);
});

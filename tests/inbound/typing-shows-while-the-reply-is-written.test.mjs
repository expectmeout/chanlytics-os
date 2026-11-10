/**
 * WhatsApp's "typing..." on the customer's message while the model writes (core inbound/model-turn.ts showTyping): only
 * where the answer goes at once (the mode in force is auto), only on WhatsApp, and never as a failure of the turn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runtime, text, world } from "./_world.mjs";

const meta = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
const answers = {
  brain: async () => ({ generateReply: async () => ({ text: "We open at 9.", escalate: false, meta }) }),
};
const line = {
  channel: "sms",
  send: async () => ({ ok: true, wamid: "SM1", status: 201 }),
  body: (t) => t,
  held: null,
};

/** A typing port that keeps what it was asked. */
function typing(fails = false) {
  const asked = [];
  return {
    asked,
    typing: async (cfg, id) => {
      asked.push([cfg?.phoneId ?? null, id]);
      if (fails) throw new Error("graph said no");
      return true;
    },
  };
}

test("an answer that goes at once shows typing on the customer's message, on the workspace's own number", async () => {
  const t = typing();
  const w = world({ env: { modelKey: "k" } });
  await w.run(text("when do you open?", "wamid.t1"), { ...answers, typing: t.typing });
  assert.deepEqual(t.asked, [["p1", "wamid.t1"]]);
  assert.equal(w.seen.sent.length, 1, "and the reply goes");
});

test("a reply that waits in a veto window, and a text, show nothing; a typing that fails costs the turn nothing", async () => {
  const veto = typing();
  const held = world({
    env: { modelKey: "k" },
    queue: true,
    rt: runtime({ policy: { reply: { mode: "veto", limits: { reply_delay_ms: 60_000 } } } }),
  });
  await held.run(text("when do you open?", "wamid.t2"), { ...answers, typing: veto.typing });
  assert.deepEqual(veto.asked, [], "the indicator would run out long before the held reply goes");

  const sms = typing();
  const texted = world({ env: { modelKey: "k" }, carrier: line });
  await texted.run(text("when do you open?", "SM-t3"), { ...answers, typing: sms.typing });
  assert.deepEqual(sms.asked, [], "a text's wire has no typing");

  const broken = typing(true);
  const w = world({ env: { modelKey: "k" } });
  await w.run(text("when do you open?", "wamid.t4"), { ...answers, typing: broken.typing });
  assert.equal(broken.asked.length, 1);
  assert.equal(w.seen.sent.length, 1, "the reply goes whatever became of the indicator");
});

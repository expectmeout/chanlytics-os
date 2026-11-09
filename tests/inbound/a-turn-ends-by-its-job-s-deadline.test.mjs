/**
 * A reply turn is held to an end (core inbound/context.ts): the job's deadline the ledger hands over, and never more than
 * TURN_BUDGET_MS after the turn began, whichever comes first. The end reaches the model's call (BrainCall.endsAtMs), which
 * asks for no longer than is left (tests/receptionist/brain-v2.test.mjs), so a slow model ends in the holding reply and a
 * person, never in a function killed with the customer unanswered.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECOND_MS } from "@chanlytics/contracts";
import { text, world } from "./_world.mjs";

const meta = { intent: "hours", confidence: 0.9, reason: "", facts_used: [], language: "en", model: "m" };
/** The model's port, keeping the call each turn hands it. */
function brain() {
  const calls = [];
  return {
    calls,
    brain: async () => ({
      generateReply: async (ask) => {
        calls.push(ask.call ?? null);
        return { text: "We open at 9.", escalate: false, meta, usage: { input_tokens: 40 } };
      },
    }),
  };
}

test("the job's deadline reaches the model's call when it is the sooner end", async () => {
  const deadline = Date.now() + 5 * SECOND_MS;
  const b = brain();
  const w = world({ env: { modelKey: "k" }, endsAtMs: deadline });
  await w.run(text("when do you open?"), { brain: b.brain });
  assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].endsAtMs, deadline, "the turn ends when its job must");
});

test("with no deadline, or a later one, the turn ends forty seconds after it began", async () => {
  for (const endsAtMs of [undefined, Date.now() + 10 * 60 * SECOND_MS]) {
    const b = brain();
    const began = Date.now();
    const w = world({ env: { modelKey: "k" }, endsAtMs });
    await w.run(text("when do you open?", `wamid.${endsAtMs ?? "none"}`), { brain: b.brain });
    const left = b.calls[0].endsAtMs - began;
    assert.ok(left > 39 * SECOND_MS && left <= 41 * SECOND_MS, `${endsAtMs}: ${left} ms`);
  }
});

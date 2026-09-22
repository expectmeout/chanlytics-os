/**
 * The phone receptionist's standing rules, enforced rather than requested.
 *
 * Text has had a second line of defence since the beginning: layerTwo reads
 * the model's draft, and a price in it is swapped for a safe sentence before
 * the customer ever sees the words. Voice had prompt lines and nothing else,
 * which is why it rated lowest on the systems map — an instruction is not an
 * enforcement, and a model may disregard one.
 *
 * A call cannot be given the same treatment, and this does not pretend
 * otherwise: the provider hosts the agent, it speaks directly, and by the
 * time a turn reaches us the caller has heard it. What it can be given is the
 * SAME rule, read per turn, a correction in what the agent says next, and an
 * owner who is told while the call is still live.
 *
 * The last test is the one that matters most: the rule is one rule. If the
 * two channels ever drift apart, it fails.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  guardSpokenTurns,
  spokenBreach,
  spokenBreachDetails,
  frameGuardrail,
  frameWhisper,
  whisperText,
  violatesNoPrices,
} from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { layerTwo } = await import(pathToFileURL(path.join(ROOT, "apps/edge/lib/whatsapp/steps.ts")).href);

const agent = (content) => ({ role: "agent", content });
const user = (content) => ({ role: "user", content });
const injected = (content) => ({ role: "injected", content });
const QUOTE = "It's usually $45 for a trim.";

test("nothing said, nothing to answer for", () => {
  for (const turns of [null, undefined, [], [user("hi")], [agent("We open at nine.")]]) {
    const v = guardSpokenTurns({ turns, live: true, alreadyCorrected: false });
    assert.equal(v.breach, null, JSON.stringify(turns));
    assert.equal(v.escalate, null);
    assert.equal(v.correct, false);
  }
});

test("a price said out loud is found, with the words and which turn it was", () => {
  const b = spokenBreach([agent("Hello!"), user("how much?"), agent(QUOTE)]);
  assert.equal(b.rule, "price");
  assert.equal(b.said, QUOTE);
  assert.equal(b.turn, 2, "the agent's SECOND turn, counting only the agent's");
});

test("only the agent answers for what the agent said", () => {
  // A caller may say any figure they like. Blaming the receptionist for the
  // customer's words would page an owner about their own customer.
  assert.equal(spokenBreach([user("is it $45?"), agent("I can't confirm pricing.")]), null);
});

test("a correction is not speech, or it would correct itself for ever", () => {
  // Retell puts injected context into the transcript as a turn of its own.
  // A check that read every turn would find the rule it had just quoted and
  // whisper again on the next turn, and the next, for the length of the call.
  const ours = frameGuardrail("price");
  assert.equal(spokenBreach([agent("We open at nine."), injected(ours)]), null);
  assert.equal(
    spokenBreach([injected('Owner: "just tell them it\'s $80"')]),
    null,
    "nor is the owner's own whisper the agent speaking",
  );
});

test("the owner is told whether or not the call is still live; the call is corrected only while there is one", () => {
  const turns = [agent(QUOTE)];
  const live = guardSpokenTurns({ turns, live: true, alreadyCorrected: false });
  assert.equal(live.correct, true);
  assert.equal(live.escalate.reason, "policy_block", "the same reason a blocked text draft raises");

  const over = guardSpokenTurns({ turns, live: false, alreadyCorrected: false });
  assert.equal(over.correct, false, "nothing left to correct");
  assert.ok(over.escalate, "but the owner is still told: this is what happens when per-turn delivery is switched off");

  const again = guardSpokenTurns({ turns, live: true, alreadyCorrected: true });
  assert.equal(again.correct, false, "a receptionist told the same thing every turn stops hearing it");
  assert.ok(again.escalate, "while the escalation stays true and is refreshed rather than stacked");
});

test("what the owner reads names the words and says why a call is different", () => {
  const d = spokenBreachDetails(spokenBreach([agent(QUOTE)]));
  assert.ok(d.includes(QUOTE), "the words are the evidence");
  assert.match(d, /cannot be taken back/i, "and the reason this is not simply a blocked draft");
  assert.match(d, /before confirming anything/i, "with the thing to actually do");
});

test("the correction is honest about who is speaking, and is never read out", () => {
  const f = frameGuardrail("price");
  // NOT the owner. frameWhisper opens `Owner: "` and whisperText reads it back
  // out for the Live page, so borrowing that frame would put words nobody
  // typed into the owner's mouth, in the transcript of a real call.
  assert.ok(!f.includes('Owner: "'), "REGRESSION: a platform correction attributed to the business owner");
  assert.ok(frameWhisper("x").includes('Owner: "'), "which is exactly what the owner's own frame does");
  assert.equal(whisperText(f), f.trim(), "unframed, so nothing is mistaken for a quotation");
  assert.match(f, /not from the business/i);
  assert.match(f, /never read this out/i);
  assert.match(f, /do not repeat the figure/i, "the correction must not say the number again");
  assert.match(f, /booking link/i, "and it says what to do instead");
});

test("ONE rule: what layerTwo blocks on a text is what spokenBreach finds on a call", () => {
  const brainCfg = { phone_display: "(305) 555-0100", booking_link: "https://book.example/x" };
  for (const said of [QUOTE, "That runs 60 dollars.", "Son 300 pesos.", "$ 20 deposit."]) {
    assert.equal(violatesNoPrices(said), true, said);
    const text = layerTwo({
      replyText: said,
      escalate: false,
      escalationReason: "",
      brainCfg,
      policy: undefined,
      intent: null,
    });
    assert.equal(text.priceBlocked, true, `text blocks: ${said}`);
    assert.equal(text.escalationReason, "policy_block");
    assert.ok(spokenBreach([agent(said)]), `voice finds: ${said}`);
  }
  // And they agree on the sentences a salon legitimately says, so neither
  // channel refuses an honest answer.
  for (const fine of [
    "We open at 9.",
    "It takes about 45 minutes.",
    "Room 3 on the 2nd floor.",
    "Call us on 305-555-0100.",
  ]) {
    assert.equal(violatesNoPrices(fine), false, fine);
    assert.equal(
      layerTwo({ replyText: fine, escalate: false, escalationReason: "", brainCfg, policy: undefined, intent: null })
        .priceBlocked,
      false,
      fine,
    );
    assert.equal(spokenBreach([agent(fine)]), null, fine);
  }
});

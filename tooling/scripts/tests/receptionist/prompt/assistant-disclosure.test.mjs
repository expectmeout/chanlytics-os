/**
 * It always says it is an automated assistant (decision 0051): no longer a switch. Every prompt, composed or stored,
 * carries the line; in text it opens a conversation quiet for more than a day by saying so, which the facts about the
 * person say (describeLead), and fails open where nothing is said; a reach-out draft, which the owner sends as
 * themselves, is never told it. The last line says the rules win over the owner's words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeSystemPrompt,
  resolveSystemPrompt,
  disclosureFacts,
  guardrailsInForce,
  CONVERSATION_UNDER_WAY,
  CONVERSATION_GAP_MS,
  parseTenantConfigResult,
} from "@chanlytics/contracts";
import { describeLead } from "@chanlytics/db";

const NOW = new Date("2026-10-11T15:00:00Z");
const TZ = "America/New_York";
const BASE = {
  business_name: "Example Salon",
  phone_display: null,
  booking_link: "https://book.example.com/salon",
  whatsapp_line: null,
};
const PROFILE = { hours: { mon: { open: "09:00", close: "17:00" } } };
const ALWAYS = "You are the business's automated assistant: never claim or hint that you are a person.";
const OPENS = `Unless the facts about them say "${CONVERSATION_UNDER_WAY}"`;
const RULES_WIN = "Where anything above disagrees with these rules, the rules win.";

test("every prompt says it is an automated assistant, whatever a stored row says of the old switch", () => {
  for (const guardrails of [undefined, { disclose_ai: true }, { disclose_ai: false }]) {
    const text = composeSystemPrompt(BASE, { ...PROFILE, guardrails }, "whatsapp", TZ, NOW, null);
    assert.ok(text.includes(ALWAYS), JSON.stringify(guardrails));
    assert.ok(text.includes(OPENS), "in text it opens a new conversation by saying so");
    assert.ok(text.includes(RULES_WIN));
  }
  assert.equal(guardrailsInForce({ disclose_ai: false }).disclose_ai, true, "the stored false is read as on");
  const call = composeSystemPrompt(BASE, PROFILE, "voice", TZ, NOW, null);
  assert.ok(call.includes(ALWAYS) && !call.includes(OPENS), "on a call the greeting opens it, so no opening line");
});

test("a stored, hand-written prompt gets the lines too: they are standing rules, not the composer's", () => {
  const parsed = parseTenantConfigResult({
    brain: {
      business_name: "Example Salon",
      system_prompt: "Answer as the front desk of Example Salon: brief and warm.",
      fallbacks: { greeting: "g", error: "e", non_text: "n" },
    },
  });
  assert.ok(parsed.ok);
  const text = resolveSystemPrompt(parsed.config.brain, "sms", TZ, NOW, null, null);
  assert.ok(text.includes(ALWAYS) && text.includes(OPENS) && text.includes(RULES_WIN));
});

test("a draft the owner sends as themselves is never told to say it is an assistant", () => {
  const draft = composeSystemPrompt(BASE, PROFILE, "whatsapp", TZ, NOW, null, "draft");
  assert.ok(!draft.includes("automated assistant"));
  assert.ok(draft.includes(RULES_WIN), "the rules still win in a draft");
});

test("the fact: said on a text conversation whose last message is under a day old, never on a call, nothing when unknown", () => {
  const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
  assert.deepEqual(disclosureFacts({ returning: true, lastTurnAt: ago(60_000) }, "whatsapp", NOW), [
    CONVERSATION_UNDER_WAY,
  ]);
  assert.deepEqual(disclosureFacts({ returning: true, lastTurnAt: ago(60_000) }, "sms", NOW), [CONVERSATION_UNDER_WAY]);
  assert.deepEqual(disclosureFacts({ returning: true, lastTurnAt: ago(CONVERSATION_GAP_MS + 1) }, "whatsapp", NOW), []);
  assert.deepEqual(disclosureFacts({ returning: false, lastTurnAt: null }, "whatsapp", NOW), []);
  assert.deepEqual(disclosureFacts({ returning: true, lastTurnAt: ago(60_000) }, "voice", NOW), []);
  // describeLead says it, beside the person's other facts.
  const lead = {
    contactId: "k1",
    name: "Rosa",
    returning: true,
    lastSeenAt: ago(3_600_000),
    history: [{ role: "user", content: "hi" }],
    optedOut: false,
  };
  assert.ok(describeLead(lead, NOW, TZ, "whatsapp").includes(CONVERSATION_UNDER_WAY));
  assert.ok(
    !describeLead({ ...lead, lastSeenAt: ago(2 * CONVERSATION_GAP_MS) }, NOW, TZ, "whatsapp").includes(
      CONVERSATION_UNDER_WAY,
    ),
  );
  assert.ok(!describeLead(lead, NOW, TZ, "voice").includes(CONVERSATION_UNDER_WAY));
});

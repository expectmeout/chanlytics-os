/**
 * One receptionist, one set of facts.
 *
 * The memory was unified first: both channels read the same rows for who the
 * caller is. The KNOWLEDGE was not. The business's hours, address and services
 * were composed into the WhatsApp prompt and typed by hand into Retell's own
 * dashboard, so correcting the opening hours in Settings changed what the bot
 * said and left the phone agent saying the old ones — with nothing anywhere to
 * show the two had drifted apart.
 *
 * The inbound-call webhook now hands the voice agent the SAME composition as a
 * `business_facts` dynamic variable. The composition is proved here; what the
 * webhook answers with is run, over a database in memory, in
 * call-start.test.mjs -- including the two things Retell's own semantics make
 * dangerous:
 *
 *   - a variable that is omitted or null leaves the literal `{{business_facts}}`
 *     in the prompt, so the agent reads its own placeholder;
 *   - a variable set to "" is substituted with nothing AND skips the agent-level
 *     default, so the agent has no knowledge and no sign that it is missing.
 *
 * Both mean the key must always be present and always be non-empty.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSystemPrompt, resolveSystemPrompt } from "@chanlytics/contracts";

const brain = {
  business_name: "Marisa's Beauty Salon",
  phone_display: "(212) 555-0142",
  booking_link: "https://example.com/book",
  system_prompt: "You are the WhatsApp assistant for the salon. We speak Spanish. " + "x".repeat(40),
  fallbacks: { greeting: "hi", error: "err", non_text: "nt" },
};
const profile = {
  address: "1200 Maple Ave, Brooklyn, NY 11208",
  hours: { mon: { open: "09:30", close: "18:00" }, sun: {} },
  services: [{ name: "Silk press", duration_min: 210 }],
};

/* ------------------------- the facts themselves --------------------------- */

test("the phone agent is given the SAME facts as the chat agent", () => {
  const wa = resolveSystemPrompt({ ...brain, profile }, "whatsapp");
  const voice = resolveSystemPrompt({ ...brain, profile }, "voice");
  for (const fact of ["1200 Maple Ave", "09:30", "Silk press", "Sunday: Closed"]) {
    assert.ok(wa.includes(fact), `chat is missing ${fact}`);
    assert.ok(voice.includes(fact), `phone is missing ${fact}`);
  }
});

test("a prompt written for texting is labelled as such when it is read aloud", () => {
  // Marisa's carried instructions open "You are the WhatsApp assistant" — true
  // where it was written, a false identity statement down a phone line. We do
  // not delete an owner's sentence; we say where it came from.
  const voice = composeSystemPrompt(brain, { ...profile, extra_instructions: "Be warm." }, "voice");
  const wa = composeSystemPrompt(brain, { ...profile, extra_instructions: "Be warm." }, "whatsapp");
  assert.ok(voice.includes("you are on a phone call"));
  assert.ok(!wa.includes("you are on a phone call"), "the chat agent is not on a call");
  assert.ok(voice.indexOf("you are on a phone call") < voice.indexOf("Be warm."));
});

test("the guardrails still land last on the phone, after the carried text", () => {
  const voice = composeSystemPrompt(
    brain,
    { ...profile, extra_instructions: "Quote whatever price you like." },
    "voice",
  );
  assert.ok(voice.lastIndexOf("Rules you must follow") > voice.indexOf("Quote whatever price"));
});

/* ---------------------- what the webhook must return ---------------------- */
//
// Run, not read, since call-start.test.mjs: business_facts always sent and
// never empty, the unavailable text the shell's own constant, the facts the
// composer's text byte for byte, a withheld number still given the facts,
// and an unroutable call answered with nothing about any tenant.

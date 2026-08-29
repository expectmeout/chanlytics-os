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
 * `business_facts` dynamic variable. These pin the parts that are easy to
 * regress, and the ones Retell's own semantics make dangerous:
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
import { readCode } from "./_source.mjs";

const inbound = readCode("apps/edge/api/retell-inbound.ts");

const brain = {
  business_name: "Melany's Beauty Salon",
  phone_display: "(646) 932-5775",
  booking_link: "https://example.com/book",
  system_prompt: "You are the WhatsApp assistant for the salon. We speak Spanish. " + "x".repeat(40),
  fallbacks: { greeting: "hi", error: "err", non_text: "nt" },
};
const profile = {
  address: "2581 Pitkin Ave, Brooklyn, NY 11208",
  hours: { mon: { open: "09:30", close: "18:00" }, sun: {} },
  services: [{ name: "Silk press", duration_min: 210 }],
};

/* ------------------------- the facts themselves --------------------------- */

test("the phone agent is given the SAME facts as the chat agent", () => {
  const wa = resolveSystemPrompt({ ...brain, profile }, "whatsapp");
  const voice = resolveSystemPrompt({ ...brain, profile }, "voice");
  for (const fact of ["2581 Pitkin Ave", "09:30", "Silk press", "Sunday: Closed"]) {
    assert.ok(wa.includes(fact), `chat is missing ${fact}`);
    assert.ok(voice.includes(fact), `phone is missing ${fact}`);
  }
});

test("a prompt written for texting is labelled as such when it is read aloud", () => {
  // Melany's carried instructions open "You are the WhatsApp assistant" — true
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

test("business_facts is ALWAYS sent, and never empty", () => {
  assert.ok(
    inbound.includes("business_facts: facts || FACTS_UNAVAILABLE"),
    "an omitted variable is read aloud as {{business_facts}}; an empty one is silent",
  );
  assert.ok(
    !/business_facts:\s*facts\s*[,}]/.test(inbound),
    "facts must never be sent bare — it is empty whenever the config could not be read",
  );
});

test("the unavailable text tells the agent it has nothing, rather than being nothing", () => {
  const m = inbound.match(/const FACTS_UNAVAILABLE\s*=\s*\n?\s*"([^"]+)"/);
  assert.ok(m, "FACTS_UNAVAILABLE must be a plain string literal");
  assert.ok(m[1].length > 80, "a terse fallback is one the agent will talk over");
  assert.ok(/do not state/i.test(m[1]), "it must forbid inventing the facts it lacks");
});

test("the facts are composed, not a second copy kept here", () => {
  assert.ok(inbound.includes("resolveSystemPrompt(rt.brain,"), "same composer as WhatsApp");
  assert.ok(inbound.includes('"voice"'), "asked for in its spoken form");
  for (const leak of ["Pitkin", "09:30", "Opening hours"]) {
    assert.ok(!inbound.includes(leak), `a real fact (${leak}) is hard-coded in the handler`);
  }
});

/* ------------------------------ the call path ----------------------------- */

test("facts are loaded for EVERY call, not only ones with a caller ID", () => {
  // They used to be, because the whole lookup sat inside `if (from)`. A call
  // from a withheld number needs the hours just as much as a known one.
  const guard = inbound.indexOf("if (from)");
  assert.ok(guard === -1, "the tenant lookup must not be gated on the caller's number");
  assert.ok(inbound.includes("phone ? readLeadContext"), "memory alone depends on knowing who called");
});

test("the two reads run together — Retell gives this webhook ten seconds", () => {
  const par = inbound.indexOf("Promise.all([");
  assert.ok(par > 0, "serial round trips are how a slow day becomes a dropped call");
  const block = inbound.slice(par, par + 400);
  assert.ok(block.includes("loadTenantRuntime"));
  assert.ok(block.includes("readLeadContext"));
});

test("a call we cannot route still answers, and still says nothing about a tenant", () => {
  // Unrouted means we do not know whose business this is. No facts, no memory,
  // and above all no borrowing another tenant's — but a 200, or Retell drops it.
  assert.ok(inbound.includes("inbound_ctx_unrouted"));
  assert.ok(inbound.includes("json(200,"), "a non-2xx costs the caller the call");
});

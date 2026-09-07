/**
 * Provisioning must not be a second home for the business.
 *
 * The laptop script this replaced used to carry one salon's hours, address,
 * phone number, booking link and academy in a hardcoded prompt — a frozen
 * copy of facts the product now owns. Two consequences, both real:
 *
 *   * correcting the opening hours in Settings changed what the WhatsApp
 *     receptionist said and left the phone agent saying the old ones, because
 *     its prompt lived in Retell's dashboard rather than in the product;
 *   * re-running the script would have RESTORED that copy over the top,
 *     silently undoing the fix — a landmine with no trigger date.
 *
 * These pin that what provisioning creates reads its facts at call time, and
 * that nothing here can quietly become a fact again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceLlmCreateBody, voiceAgentCreateBody, VOICE_AGENT_DEFAULTS } from "@chanlytics/channels";
import { readCode, readRaw } from "./_source.mjs";

const module_ = readRaw("packages/channels/src/voice-provision.ts");
const endpoint = readRaw("apps/edge/api/admin/voice-provision.ts");
const inbound = readCode("apps/edge/api/retell-inbound.ts");
const llm = voiceLlmCreateBody({ fnSecret: "s" });

test("no business fact is written into provisioning", () => {
  // Anything you would be tempted to add here as text is a fact, and facts
  // belong in Settings where the owner can see and change them.
  const facts = ["9:30", "Pitkin", "Booksy", "booksy", "646-932", "Melany", "Brooklyn", "Beauty Academy", "balayage"];
  for (const f of facts) {
    assert.ok(!module_.includes(f) && !endpoint.includes(f), `"${f}" is a fact and must not live in provisioning`);
  }
});

test("the provisioned prompt is a shell over the live variables", () => {
  for (const v of ["{{business_facts}}", "{{caller_context}}"]) {
    assert.ok(llm.general_prompt.includes(v), `the prompt must read ${v}`);
  }
  assert.equal(llm.begin_message, "{{greeting}}", "even the opening line is composed");
  assert.equal(llm.general_tools.find((t) => t.name === "transfer_to_staff").transfer_destination.number, "{{handoff_number}}", "the transfer dials the per-call variable, never a typed number");
});

test("what remains is the SHAPE of a call, not its content", () => {
  // Tools, silence timeout, the voice — none of which the business profile
  // can express and none of which goes stale when a business moves.
  assert.deepEqual(llm.general_tools.map((t) => t.name), ["end_call", "transfer_to_staff", "send_booking_link", "check_availability"]);
  const agent = voiceAgentCreateBody({ llmId: "llm_x", llmVersion: 0, agentName: "x" }, { fnSecret: "s" });
  assert.equal(agent.end_call_after_silence_ms, VOICE_AGENT_DEFAULTS.end_call_after_silence_ms);
  assert.equal(agent.voice_id, VOICE_AGENT_DEFAULTS.voice_id);
});

test("a second business is another request, not another copy of anything", () => {
  // The number, the agent name and the nickname come from the request and the
  // workspace's own name; the transfer target is a per-call variable.
  assert.ok(module_.includes("agent: `${st.tenant.name} front desk`"));
  assert.ok(!/NUMBER = "\+\d/.test(module_) && !/"\+1\d{10}"/.test(module_), "no hardcoded phone number");
  assert.ok(!module_.includes("VOICE_TRANSFER_TO"), "the transfer number is a per-call variable, not a setting here");
});

test("the key is never written down", () => {
  assert.ok(endpoint.includes("process.env.RETELL_API_KEY") && endpoint.includes("process.env.RETELL_FN_SECRET"));
  assert.ok(!/key_[0-9a-f]{16}/.test(module_) && !/key_[0-9a-f]{16}/.test(endpoint), "no literal Retell key");
});

/* --------------------------- the greeting variable ------------------------ */

test("the greeting is a whole sentence, not a name to interpolate", () => {
  // Retell leaves a variable it cannot fill in the prompt VERBATIM. "Thank you
  // for calling {{business_name}}" read down a phone line is worse than any
  // wording, so the webhook composes the entire line.
  assert.ok(inbound.includes("greeting: greetingFor(businessName)"));
  assert.ok(!JSON.stringify(llm).includes("{{business_name}}"), "the name alone is never a variable");
});

test("an unroutable call still greets, and names nobody", () => {
  const m = inbound.match(/function greetingFor[\s\S]*?\n\}/);
  assert.ok(m, "greetingFor must exist");
  const greetingFor = new Function(
    `${m[0].replace("function greetingFor(name: string | null): string", "function greetingFor(name)")}; return greetingFor;`,
  )();

  const named = greetingFor("Aurora Nails");
  const unknown = greetingFor(null);
  assert.ok(named.includes("Aurora Nails"));
  assert.ok(!/\{\{|\bnull\b|undefined/.test(unknown), "no placeholder or stray value is read aloud");
  // Both disclosures are promises the product makes, not settings in someone
  // else's dashboard.
  for (const g of [named, unknown]) {
    assert.ok(g.includes("may be recorded"), "recording disclosure");
    assert.ok(g.includes("automated assistant"), "AI disclosure");
  }
});

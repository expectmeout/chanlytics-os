/**
 * The provisioning script must not be a second home for the business.
 *
 * It used to carry the salon's hours, address, phone number, booking link and
 * the Beauty Academy in a hardcoded prompt — a frozen copy of facts the
 * product now owns. Two consequences, both real:
 *
 *   * correcting the opening hours in Settings changed what the WhatsApp
 *     receptionist said and left the phone agent saying the old ones, because
 *     its prompt lived in Retell's dashboard rather than in the product;
 *   * re-running this script would have RESTORED that copy over the top,
 *     silently undoing the fix — a landmine with no trigger date.
 *
 * These pin that the agent it provisions reads its facts at call time, and
 * that nothing here can quietly become a fact again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw, readCode } from "./_source.mjs";

const script = readRaw("tooling/scripts/setup_voice.py");
const inbound = readCode("apps/edge/api/retell-inbound.ts");

test("no business fact is written into the provisioning script", () => {
  // Anything you would be tempted to add here as text is a fact, and facts
  // belong in Settings where the owner can see and change them.
  const facts = [
    "9:30", "Pitkin", "Booksy", "booksy", "646-932", "Melany",
    "Brooklyn", "Beauty Academy", "balayage",
  ];
  for (const f of facts) {
    assert.ok(!script.includes(f), `"${f}" is a fact and must not live in this file`);
  }
});

test("the provisioned prompt is a shell over the live variables", () => {
  for (const v of ["{{business_facts}}", "{{caller_context}}", "{{greeting}}"]) {
    assert.ok(script.includes(v), `the prompt must read ${v}`);
  }
  assert.ok(script.includes('"begin_message": "{{greeting}}"'), "even the opening line is composed");
});

test("what remains is the SHAPE of a call, not its content", () => {
  // Tools, silence timeout, which number is bound — none of which the business
  // profile can express and none of which goes stale when a salon moves.
  for (const shape of ["end_call", "transfer_to_staff", "send_booking_link", "end_call_after_silence_ms"]) {
    assert.ok(script.includes(shape), `${shape} belongs here`);
  }
});

test("a second business is another invocation, not another copy of the file", () => {
  // The number, transfer target, agent name and voice were hardcoded to one
  // salon, so onboarding a second meant duplicating the script.
  for (const v of ["VOICE_NUMBER", "VOICE_TRANSFER_TO", "VOICE_AGENT_NAME", "VOICE_ID"]) {
    assert.ok(script.includes(v), `${v} must come from the environment`);
  }
  assert.ok(!/NUMBER = "\+\d/.test(script), "no hardcoded phone number");
});

test("the key is still never written down", () => {
  assert.ok(script.includes('os.environ["RETELL_API_KEY"]'));
  assert.ok(!/key_[0-9a-f]{16}/.test(script), "no literal Retell key");
});

/* --------------------------- the greeting variable ------------------------ */

test("the greeting is a whole sentence, not a name to interpolate", () => {
  // Retell leaves a variable it cannot fill in the prompt VERBATIM. "Thank you
  // for calling {{business_name}}" read down a phone line is worse than any
  // wording, so the webhook composes the entire line.
  assert.ok(inbound.includes("greeting: greetingFor(businessName)"));
  assert.ok(!script.includes("{{business_name}}"), "the name alone is never a variable");
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

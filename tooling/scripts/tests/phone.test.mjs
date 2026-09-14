/**
 * What the product calls a phone number, and what it says when it is given
 * something else.
 *
 * normalizePhone had no test of its own, which is how four layers came to
 * disagree about the same question without anyone noticing: the column is bare
 * `text`, the WhatsApp path writes `+${digits}` by hand, normalizePhone takes
 * eight to fifteen digits, and create_person demands ^\+[1-9][0-9]{7,14}$. The
 * product therefore stores numbers it will then refuse — a short code arriving
 * over SMS is written as `+12345` and can never be added as a person.
 *
 * The rule is NOT being tightened here. normalizePhone has five call sites
 * across both runtimes and fails OPEN in two of them: forwarding.ts skips its
 * destination guard entirely when the destination will not parse, and
 * retell-fn's `asked ?? caller` turns a refusal into a text to the caller.
 * Only the door's words change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, formatPhoneDisplay, whyNotAPhone, shortCode, EVENT_KINDS } from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

test("normalizePhone, pinned by value so the four layers can be compared", () => {
  assert.equal(normalizePhone("5551234567"), "+15551234567", "ten digits are North American");
  assert.equal(normalizePhone("+1 (555) 123-4567"), "+15551234567", "punctuation is not information");
  assert.equal(normalizePhone("447700900123"), "+447700900123");
  assert.equal(normalizePhone("12345"), null, "a short code is not a number anyone can reach");
  assert.equal(normalizePhone("5551234"), null, "seven digits is a local number, not a phone number");
  assert.equal(normalizePhone("1234567890123456"), null, "sixteen digits is not one either");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

test("the door says WHICH kind of not-a-number it was given", () => {
  // One sentence for every refusal told an owner looking at a short code on
  // their own screen that "a phone number is needed".
  assert.equal(whyNotAPhone("+15551234567"), null, "a real number has nothing to say about it");
  assert.equal(whyNotAPhone("5551234567"), null);

  const short = whyNotAPhone("12345");
  assert.match(short, /short code/, "the case the product actually stores");
  assert.match(short, /nobody can be reached/, "and why it can never be a person");
  assert.equal(whyNotAPhone("+12345"), short, "stored form or typed form, same answer");

  // Seven digits is told apart on purpose: that is a local number missing its
  // area code, and calling it a short code would be a confident wrong answer.
  assert.match(whyNotAPhone("5551234"), /area code/);
  assert.ok(!/short code/.test(whyNotAPhone("5551234")));

  assert.match(whyNotAPhone(""), /needed to add a person/, "an empty field is not an accusation");
  assert.match(whyNotAPhone("not a number"), /needed to add a person/, "no digits at all is the same");
  assert.match(whyNotAPhone("1234567890123456"), /not a phone number/);
});

test("every sentence is one an owner could act on", () => {
  for (const raw of ["", "12345", "5551234", "1234567890123456", "x"]) {
    const said = whyNotAPhone(raw);
    assert.ok(said && said.endsWith("."), `${JSON.stringify(raw)}: a sentence, ending in a full stop`);
    assert.ok(!/E\.?164|regex|validation|null/i.test(said), `${JSON.stringify(raw)}: no vocabulary from inside the machine`);
  }
});

test("the door asks, rather than deciding for itself", () => {
  const route = readCode("apps/dashboard/app/api/v1/contacts/route.ts");
  assert.ok(route.includes("whyNotAPhone(raw)"), "the words come from contracts, where the product's words live");
  assert.ok(route.includes("const phone = normalizePhone(raw);"), "and the rule is still normalizePhone's");
});

test("the shared normalizer is NOT tightened, because two of its callers fail open", () => {
  // forwarding: a destination that will not parse makes `dest` falsy, and the
  // whole guard is skipped — a line marked verified by the wrong call.
  const fwd = readCode("packages/contracts/src/forwarding.ts");
  assert.ok(fwd.includes("if (dest && call.toE164 && normalizePhone(call.toE164) !== dest) return false;"), "still guarded only when dest parses");

  // retell-fn: `asked ?? caller` turns a refusal into a text to the caller
  // instead of to the number they gave -- run in retell-fn-door.test.mjs, where
  // a short code the agent collected sends the link to the caller's own number.

  // So the rule stays as it is, and any future change to it has to answer for
  // these two first.
  assert.equal(normalizePhone("+012345678"), "+012345678", "a leading zero is still accepted, deliberately");
  assert.equal(formatPhoneDisplay("+15551234567"), "+1 (555) 123-4567");
});

test("a short code is a sender, never a person", () => {
  for (const n of ["12345", "+12345", "622622", "911", "1234"]) {
    assert.equal(shortCode(n), true, n);
  }
  // Seven digits is a local number missing its area code, not a short code.
  assert.equal(shortCode("5551234"), false);
  assert.equal(shortCode("5551234567"), false);
  assert.equal(shortCode("+15551234567"), false);
  assert.equal(shortCode(""), false, "an empty field is not a short code either");
  assert.equal(shortCode("ab"), false);
  // One definition of the range: the sentence and the predicate cannot drift.
  assert.match(whyNotAPhone("12345"), /short code/);
});

test("the receptionist records a short code and does not answer it", () => {
  // A carrier notice, a two-factor code or a bank alert lands on a business's
  // line like any other text. Nothing can be sent back to one from a ten-digit
  // number, so composing a reply spends a model call to produce a message
  // Twilio will refuse — and the failure then raises "Reply delivery failed"
  // at an owner who never wrote it.
  const inbound = readCode("apps/edge/lib/whatsapp/inbound.ts");
  assert.ok(inbound.includes("if (shortCode(from)) {"), "the guard reads the sender");

  // It gates the REPLY, not the persist: an owner should be able to see what
  // arrived on their line.
  const guard = inbound.slice(inbound.indexOf("if (shortCode(from)) {"));
  const body = guard.slice(0, guard.indexOf("return;") + "return;".length);
  assert.ok(body.includes("await recordOrSay()"), "the message is still recorded");
  assert.ok(body.includes("await sink.unreachableSender()"), "with a reason of its own");
  assert.ok(body.includes("await sink.processed()"), "and marked handled, so nothing retries it");
  assert.ok(body.includes("return;"), "and no reply is composed");

  // Before the allowlist, which is the other reply-only gate, so the two
  // cannot disagree about a sender that is both.
  assert.ok(
    inbound.indexOf("if (shortCode(from)) {") < inbound.indexOf("ports.env.allowlist"),
    "the unreachable check comes first",
  );

  assert.ok(EVENT_KINDS.includes("ingest.unreachable_sender"), "the event is one the product knows");
  const persist = readCode("apps/edge/lib/whatsapp/persist.ts");
  assert.ok(persist.includes('emitEvent(db!, tenantId!, "ingest.unreachable_sender", "ingest", "message", ing!.message_id)'));
});

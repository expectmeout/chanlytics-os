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
import {
  normalizePhone,
  formatPhoneDisplay,
  whyNotAPhone,
  whyNotAHandoff,
  whyNotForward,
  HANDOFF_FORWARDS_BACK,
  FORWARD_IS_HANDOFF,
  shortCode,
  EVENT_KINDS,
  forwardingMatch,
} from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { text, world } from "../inbound/_world.mjs";

const { pgSink } = await importSrc("apps/edge/lib/inbound/persist.ts");

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

test("a leading + is the country code, written: the digits after it are never given a +1, and only a bare ten digits is North American", () => {
  // The "+" was stripped with the punctuation before the length was read, so any ten-digit number from elsewhere
  // became an American one -- the booking link texted to a stranger in the US, a broadcast missing the person whose
  // number WhatsApp had stored whole. Sequential digits, nobody's number.
  assert.equal(normalizePhone("+4791234567"), "+4791234567", "ten digits after a + are the whole number");
  assert.equal(normalizePhone("+65 9123 4567"), "+6591234567", "however it is spaced");
  assert.equal(normalizePhone("  +4791234567 "), "+4791234567", "a + after spaces is still the first thing written");
  assert.equal(normalizePhone("4791234567"), "+14791234567", "the same ten digits bare are North American, as before");
  assert.equal(normalizePhone("+1 646 555 0175"), "+16465550175", "a + and eleven digits, as before");
  assert.equal(normalizePhone("(646) 555-0175"), "+16465550175", "a national number typed with its punctuation");
  assert.equal(normalizePhone("+12345"), null, "a + does not make a short code a number");
  assert.equal(normalizePhone("+1234567890123456"), null, "nor sixteen digits");
  // Nothing that was a number stops being one: only what a + is followed by changes, so the two callers that fail
  // open when a number will not parse (below) are handed nothing new.
  assert.equal(whyNotAPhone("+4791234567"), null);
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
    assert.ok(
      !/E\.?164|regex|validation|null/i.test(said),
      `${JSON.stringify(raw)}: no vocabulary from inside the machine`,
    );
  }
});

test("the door asks, rather than deciding for itself", async () => {
  // The people door (POST /api/v1/contacts), run as an operator adds a person: the words for a number that is not one
  // come from contracts, where the product's words live, and the rule is still normalizePhone's.
  const { setRateStore, memoryStore } = await importSrc("apps/dashboard/src/server/shared/rate-limit.ts");
  const contacts = await importSrc("apps/dashboard/app/api/v1/contacts/route.ts");
  const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const added = [];
  const ctx = () => ({
    supabase: fakeDb(
      {
        memberships: [
          {
            user_id: "u1",
            tenant_id: T,
            role: "operator",
            tenants: { slug: "harbor" },
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" }],
      },
      {},
      { create_person: (args) => (added.push(args), { contact_id: "p-new", existed: false }) },
    ),
    userId: "u1",
    email: "ops@harbor.example",
    params: {},
  });
  const add = (phone) => {
    setRateStore(memoryStore());
    return contacts.POST.run(
      new Request(`http://localhost/api/v1/contacts?workspace=${T}`, {
        method: "POST",
        body: JSON.stringify({ name: "Ana", phone }),
      }),
      ctx(),
    );
  };
  for (const raw of ["12345", "555-0142", "not a number"]) {
    await assert.rejects(add(raw), (e) => {
      assert.equal(e.code, "validation");
      assert.equal(e.message, whyNotAPhone(raw) ?? "That is not a phone number.", raw);
      return true;
    });
  }
  assert.deepEqual(added, [], "nothing is added for a number that is not one");
  await add("+1 (305) 555-0142");
  assert.deepEqual(
    added.map((a) => a.p_phone_e164),
    [normalizePhone("+1 (305) 555-0142")],
    "and a real one is kept as the rule spells it",
  );
});

test("the shared normalizer is NOT tightened, because two of its callers fail open", () => {
  // forwarding: a destination that will not parse makes `dest` falsy, and the
  // whole guard is skipped — a line marked verified by the wrong call.
  // forwardingMatch (contracts voice/forwarding.ts), run: the call must have reached the destination only when the
  // destination parses; a test window whose destination will not parse is matched by its window alone.
  const window = { test_started_at: "2026-11-26T15:00:00Z", test_until: "2026-11-26T15:10:00Z" };
  const call = (toE164) => ({ fromE164: "+13055550199", toE164, startedAtIso: "2026-11-26T15:02:00Z" });
  const at = Date.parse("2026-11-26T15:03:00Z");
  assert.equal(
    forwardingMatch({ ...window, destination_e164: "+13055550142" }, call("+13055550100"), at),
    false,
    "guarded when dest parses",
  );
  assert.equal(forwardingMatch({ ...window, destination_e164: "+13055550142" }, call("+1 305 555 0142"), at), true);
  assert.equal(
    forwardingMatch({ ...window, destination_e164: "not a number" }, call("+13055550100"), at),
    true,
    "and only then",
  );

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

test("the receptionist records a short code and does not answer it", async () => {
  // A carrier notice, a two-factor code or a bank alert lands on a business's
  // line like any other text. Nothing can be sent back to one from a ten-digit
  // number, so composing a reply spends a model call to produce a message
  // Twilio will refuse — and the failure then raises "Reply delivery failed"
  // at an owner who never wrote it.
  // The receptionist's inbound path, run over its world (inbound/_world.mjs): a text from a short code is recorded, so
  // an owner can see what arrived on their line, with a reason of its own; marked handled and set aside, so nothing
  // retries it; and no reply is composed. It is asked before the one-time code, the other set-aside, so the two cannot
  // disagree about a sender that is both: the order is inbound/the-gates-run-in-their-order.test.mjs's.
  for (const body of ["Your carrier notice: your bill is ready.", "Your code is 482913."]) {
    const w = world();
    await w.run(text(body, `wamid.short-${body.length}`, "12345"));
    assert.equal(w.seen.lines.length, 1, `${body}: recorded`);
    assert.equal(w.seen.unreachable, 1, "as an unreachable sender, said once");
    assert.deepEqual(w.seen.sent, [], "and nothing is sent back to it");
    assert.deepEqual(
      w.seen.handled.map((h) => [h.how, h.marked]),
      [["blocked", true]],
      "processed and set aside, so nothing retries it",
    );
  }
  assert.ok(EVENT_KINDS.includes("ingest.unreachable_sender"), "the event is one the product knows");
  // The edge's sink writes it (apps/edge/lib/inbound/persist.ts pgSink), about the message, once.
  const t = { events: [] };
  const sink = pgSink(fakeDb(t), "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
    conversation_id: "c1",
    contact_id: "p1",
    message_id: "m1",
  });
  await sink.unreachableSender();
  assert.deepEqual(
    t.events.map((e) => [e.kind, e.subject_type, e.subject_id]),
    [["ingest.unreachable_sender", "message", "m1"]],
  );
});

test("F2: a transfer number that forwards to the receptionist is refused, and so is forwarding the transfer number", () => {
  // Made-up numbers, all in 555-01xx: the line it answers on, and the number the business keeps and forwards to it.
  const LINE = "+13055550123";
  const KEPT = "+12125550142";
  assert.equal(whyNotAHandoff("+1 917 555 0100", LINE, KEPT), null, "a cell a person answers is fine");
  assert.equal(
    whyNotAHandoff("+1 (212) 555-0142", LINE, KEPT),
    HANDOFF_FORWARDS_BACK,
    "the number that forwards here would ring the receptionist again",
  );
  assert.match(whyNotAHandoff("+13055550123", LINE, KEPT), /own line/, "the own-line refusal is unchanged");
  assert.equal(whyNotAHandoff(KEPT, LINE, null), null, "no forwarding, no loop");
  assert.equal(whyNotAHandoff("", LINE, KEPT), null, "empty is a choice: take a message");
  assert.match(whyNotAHandoff("2125550142", LINE, KEPT), /country code/, "the country code is still asked first");
  assert.equal(whyNotForward(KEPT, "+1 212 555 0142"), FORWARD_IS_HANDOFF);
  assert.equal(whyNotForward(KEPT, "+19175550100"), null, "a different transfer number is no loop");
  assert.equal(whyNotForward(KEPT, null), null, "no transfer number, no loop");
  assert.equal(whyNotForward(null, KEPT), null);
});

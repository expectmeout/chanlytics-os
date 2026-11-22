/**
 * An ad's way in: whether AI can answer the WhatsApp chat an ad opens (contracts ads/way-in.ts adWayInOf; decision 0050,
 * call 11; the Ads plan's 5.1 and G13), and the one reading of Meta's word for whether a reply goes out that it rests
 * on (lines/number-standing.ts repliesGoOf), which Connections' row says too.
 *
 * What must hold. The fact is about the number the ad names, not that some number exists: another number connected is
 * no way in. Not known is not open: nothing read, or a word of Meta's that is none of its three, says so, and is never
 * taken for a yes. A BLOCKED number closes it; a limit or a missing card does not, since Meta still delivers a reply to
 * someone who wrote first, as the row says. AI stopped and the workspace paused close it whatever Meta says, AI's stop
 * first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "@chanlytics/contracts";

const NUMBER = "+13055550142";

/**
 * A workspace whose WhatsApp number Meta last said may send, AI running and the workspace on. Meta's word reaches the rule
 * read through repliesGoOf, as both its readers hand it (the dashboard's draft facts, the edge's ads/chat/answered.ts).
 */
const facts = (over = {}) => ({
  named: NUMBER,
  number: { e164: NUMBER, repliesGo: C.repliesGoOf("AVAILABLE") },
  paused: false,
  stopped: false,
  ...over,
});

test("Meta's word for whether a reply goes out is read one way: AVAILABLE and LIMITED yes, BLOCKED no, else not known", () => {
  assert.equal(C.repliesGoOf("AVAILABLE"), true);
  assert.equal(C.repliesGoOf("LIMITED"), true, "a limit counts the conversations a business starts, never a reply");
  assert.equal(C.repliesGoOf("BLOCKED"), false);
  assert.equal(C.repliesGoOf(null), null, "nothing read is not known");
  assert.equal(C.repliesGoOf("FLAGGED"), null, "a word of Meta's that is none of its three is not known, never a yes");
});

test("Connections' row says replies still go from the same reading: never of a BLOCKED number", () => {
  const standing = {
    can_send: "AVAILABLE",
    problems: [],
    notes: [],
    name: null,
    name_status: null,
    verification: null,
    limit: null,
    has_payment_method: false,
    owner_business_id: null,
    waba_id: null,
  };
  assert.match(C.standingRow(standing).sentence, /Replies to customers who write first still go out\./);
  assert.doesNotMatch(
    C.standingRow({ ...standing, can_send: "BLOCKED" }).sentence,
    /still go out/,
    "a number Meta blocked sends nothing, replies included",
  );
});

test("a number Meta says may send, named by the ad, AI running and the workspace on, is a way in", () => {
  assert.equal(C.adWayInOf(facts()), "open");
  assert.equal(C.adWayInOf(facts({ number: { e164: NUMBER, repliesGo: C.repliesGoOf("LIMITED") } })), "open");
  // The same number however it is written.
  assert.equal(C.adWayInOf(facts({ named: "+1 (305) 555-0142" })), "open");
});

test("the fact is about the number the ad names: none connected, another one, or none named is no way in", () => {
  assert.equal(C.adWayInOf(facts({ number: null })), "no_number", "no active WhatsApp number: off or disconnected");
  assert.equal(
    C.adWayInOf(facts({ number: { e164: "+13055550199", repliesGo: C.repliesGoOf("AVAILABLE") } })),
    "no_number",
    "another number is connected now: the ad's chats would go to a line that is not it",
  );
  assert.equal(C.adWayInOf(facts({ named: null })), "no_number");
  assert.equal(C.adWayInOf(facts({ named: "" })), "no_number");
});

test("not known is not open, and Meta stopping the number closes it", () => {
  assert.equal(C.adWayInOf(facts({ number: { e164: NUMBER, repliesGo: C.repliesGoOf(null) } })), "unread");
  assert.equal(C.adWayInOf(facts({ number: { e164: NUMBER, repliesGo: C.repliesGoOf("UNKNOWN_WORD") } })), "unread");
  assert.equal(C.adWayInOf(facts({ number: { e164: NUMBER, repliesGo: C.repliesGoOf("BLOCKED") } })), "blocked");
});

test("AI stopped and the workspace paused close it whatever Meta says, AI's stop first", () => {
  assert.equal(C.adWayInOf(facts({ paused: true })), "paused");
  assert.equal(C.adWayInOf(facts({ stopped: true })), "stopped");
  assert.equal(C.adWayInOf(facts({ stopped: true, paused: true, number: null })), "stopped");
  assert.equal(
    C.adWayInOf(facts({ paused: true, number: { e164: NUMBER, repliesGo: C.repliesGoOf("BLOCKED") } })),
    "paused",
  );
});

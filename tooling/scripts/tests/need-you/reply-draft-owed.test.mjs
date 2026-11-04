/**
 * When a thread is owed a draft, and what is checked of one (decision 0093): the one question the hold's subscriber, the job,
 * the sweep and the door ask, the one reading every page draws, and the code's own checks of what the model wrote.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_WRITING_STALE_MS,
  draftBriefOf,
  draftFailedWords,
  draftHeadroomSpent,
  draftUseOf,
  draftViewOf,
  pitchKept,
  promisesAFollowUpTime,
  REPLY_DRAFT_SOURCES,
  REPLY_DRAFT_STATES,
  replyDraftOwed,
  setAsideSentence,
  setsAside,
} from "@chanlytics/contracts";
import { SCHEMA_SETS } from "../../../../packages/contracts/src/schema-sets.generated.ts";

const NOW = new Date("2026-11-04T12:00:00Z");
const owedOf = (over = {}) =>
  replyDraftOwed({
    holdReason: "email_review",
    forMessageId: "m1",
    wire: "email",
    clocks: { whatsapp: null, instagram: null },
    optedOut: false,
    setAside: false,
    queuedReply: false,
    reachOutReply: false,
    now: NOW,
    ...over,
  });

test("where a draft stands and what asked for it are the database's closed sets", () => {
  assert.deepEqual([...REPLY_DRAFT_STATES], [...SCHEMA_SETS["conversation_drafts.state"]]);
  assert.deepEqual([...REPLY_DRAFT_SOURCES], [...SCHEMA_SETS["conversation_drafts.source"]]);
});

test("a hold that waits for a reply is owed one, for their newest message", () => {
  assert.deepEqual(owedOf(), { kind: "reply", forMessageId: "m1" });
  assert.deepEqual(owedOf({ holdReason: "human_token", wire: "sms" }), { kind: "reply", forMessageId: "m1" });
});

test("a call back is owed a brief, whatever the wire and with nothing written on it", () => {
  assert.deepEqual(owedOf({ holdReason: "callback", wire: null, forMessageId: null }), {
    kind: "brief",
    forMessageId: null,
  });
});

test("nothing is owed where nothing could be sent, or nothing asks", () => {
  assert.equal(owedOf({ holdReason: null }), null, "no hold");
  assert.equal(owedOf({ optedOut: true }), null, "they asked to stop");
  assert.equal(owedOf({ setAside: true }), null, "set aside as not a customer's");
  assert.equal(owedOf({ holdReason: "opt_out" }), null, "a hold that asks for nothing to be sent");
  assert.equal(owedOf({ holdReason: "booking_request" }), null, "the booking card writes its own, on its press");
  assert.equal(owedOf({ forMessageId: null }), null, "nothing of theirs to answer");
  assert.equal(owedOf({ reachOutReply: true }), null, "a reach-out's reading says whether to draft");
  assert.equal(owedOf({ queuedReply: true }), null, "the receptionist's own countdown is the thread's draft");
});

test("WhatsApp past its window is owed nothing: words written ahead would be words that cannot go", () => {
  const within = new Date(NOW.getTime() - 3_600_000).toISOString();
  const past = new Date(NOW.getTime() - 25 * 3_600_000).toISOString();
  assert.ok(owedOf({ wire: "whatsapp", clocks: { whatsapp: within, instagram: null } }));
  assert.equal(owedOf({ wire: "whatsapp", clocks: { whatsapp: past, instagram: null } }), null);
});

const row = (over = {}) => ({
  conversation_id: "c1",
  kind: "reply",
  for_message_id: "m1",
  words: { text: "Friday works.", subject: "", brief: null, asks: [] },
  made_at: NOW.toISOString(),
  ...over,
});
const viewOf = (kept, over = {}) =>
  draftViewOf(kept, {
    forMessageId: "m1",
    expected: true,
    askedAtMs: NOW.getTime() - 1000,
    nowMs: NOW.getTime(),
    ...over,
  });

test("one reading of a draft: each state as every page draws it", () => {
  assert.equal(viewOf(row({ state: "ready" })).state, "ready");
  assert.equal(viewOf(row({ state: "writing", words: {} })).state, "writing");
  assert.deepEqual(viewOf(row({ state: "pitch", words: { text: "", asks: [], pitch: "A vendor." } })), {
    state: "pitch",
    what: "A vendor.",
  });
  const failed = viewOf(row({ state: "failed", why_failed: "budget", words: { text: "", asks: [] } }));
  assert.deepEqual(failed, { state: "failed", why: draftFailedWords("budget").words, again: false });
});

test("a row before there was a state reads as its words say", () => {
  assert.equal(viewOf(row()).state, "ready");
  assert.equal(viewOf(row({ words: { text: "", asks: [], pitch: "A vendor." } })).state, "pitch");
  assert.deepEqual(viewOf(row({ words: { text: "", asks: ["Which day?"] } })), {
    state: "asks",
    question: "Which day?",
  });
});

test("with none kept, it is on its way for a while where one is owed, and never says so for long", () => {
  assert.equal(viewOf(null).state, "writing");
  assert.equal(viewOf(null, { expected: false }).state, "none", "none owed");
  assert.equal(
    viewOf(null, { askedAtMs: NOW.getTime() - DRAFT_WRITING_STALE_MS - 1 }).state,
    "none",
    "a draft that never came stops being said to be coming",
  );
  assert.equal(
    viewOf(row({ for_message_id: "m0" })).state,
    "writing",
    "one for an older message is none of this one's",
  );
});

test("a claim that outlived every try of its run says it could not be written, and Try again may change that", () => {
  const stale = new Date(NOW.getTime() - DRAFT_WRITING_STALE_MS - 1).toISOString();
  const view = viewOf(row({ state: "writing", made_at: stale, words: {} }));
  assert.equal(view.state, "failed");
  assert.equal(view.again, true);
});

test("a why this build does not know is said as a draft that could be tried again", () => {
  assert.deepEqual(draftFailedWords("from_a_later_build"), draftFailedWords("not_drafted"));
  assert.equal(draftFailedWords("named_money").again, true);
  assert.equal(draftFailedWords("no_receptionist").again, false);
});

test("a draft stops at the headroom, so live replies keep the last of the day's tokens", () => {
  assert.equal(draftHeadroomSpent(1000, 849), false);
  assert.equal(draftHeadroomSpent(1000, 850), true);
  assert.equal(draftHeadroomSpent(0, 999_999), false, "no cap, no headroom to keep");
});

test("a promise of our own follow-up by a time is caught; a fact about the day is not", () => {
  assert.equal(promisesAFollowUpTime("I'll get back to you today with the details.", ""), true);
  assert.equal(promisesAFollowUpTime("We will call you tomorrow to confirm.", ""), true);
  assert.equal(promisesAFollowUpTime("Someone will reply within the hour.", ""), true);
  assert.equal(promisesAFollowUpTime("We're open today until 6.", ""), false, "a fact");
  assert.equal(promisesAFollowUpTime("I'll find out and come back to you.", ""), false, "no time named");
  assert.equal(
    promisesAFollowUpTime("I'll call you tomorrow.", "say I'll call them tomorrow"),
    false,
    "the owner's own words may promise it",
  );
});

test("a sender's sentence is held to its rule in code: under 20 words, and never the verdict the page says beside it", () => {
  // Kept on 3 Nov 2026 under the rule alone: 25 words, ending in what "Not someone you serve?" had just asked.
  assert.equal(
    pitchKept(
      "Ad sales outreach from Dana Example at Example Ads, pitching a holiday campaign and a booking call; not a customer or prospect, so no reply",
    ),
    "Ad sales outreach from Dana Example at Example Ads, pitching a holiday campaign and a booking call.",
    "the verdict's clauses left out, what it is kept",
  );
  assert.equal(pitchKept("Not a customer: a vendor selling card readers."), "A vendor selling card readers.");
  assert.equal(pitchKept("A newsletter from Example Weekly — no reply needed."), "A newsletter from Example Weekly.");
  const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  assert.match(pitchKept(long), /…$/, "a first clause too long is cut, and says so");
  assert.ok(pitchKept(long).split(/\s+/).length < 20);
});

test("what sets a thread aside, and what it says with nothing read of it", () => {
  assert.deepEqual(["pitch", "notice", "person", "inquiry", "relayed"].map(setsAside), [
    true,
    true,
    false,
    false,
    false,
  ]);
  assert.equal(setAsideSentence("A vendor offering a booking app"), "A vendor offering a booking app.");
  assert.match(setAsideSentence(null), /program/);
});

test("a brief is what a call can use, or none", () => {
  assert.deepEqual(draftBriefOf({ opening: " Hi ", points: ["One", 2, ""], avoid: [], ask: "When?" }), {
    opening: "Hi",
    points: ["One"],
    avoid: [],
    ask: "When?",
  });
  assert.equal(draftBriefOf({ opening: "", points: [], avoid: [], ask: "When?" }), null);
  assert.equal(draftBriefOf(null), null);
});

test("what a reply did with the draft: sent as written, changed, or written apart from it", () => {
  const draft = "Yes, Friday at 10 works. Shall I book it?";
  assert.equal(draftUseOf(draft, ` ${draft} `), "as_written");
  assert.equal(draftUseOf(draft, "Yes, Friday at 11 works. Shall I book it?"), "edited");
  assert.equal(draftUseOf(draft, "Sorry, we're away that week."), "not_used");
});

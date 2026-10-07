/**
 * What the Inbox says of a reply to a reach-out (Reach out Part 5, PR 7; contracts reach-out-reply-words.ts): the strip
 * above the composer for each intent, an undone no, a reply not read yet and one read at last; the row's chip; the
 * composer's line of where an answer goes out from (C15, N5); a sent reply's line when it went from the mailbox; and
 * the notice's sentence for a no.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  replyStripOf,
  replyChipOf,
  replyFromLineOf,
  replyLeftAsOf,
  replyNoticeWords,
  REPLY_REREADS,
} from "@chanlytics/contracts";

const TZ = "America/New_York";
const NOW = Date.parse("2026-09-29T15:00:00.000Z");
const reading = (over = {}) => ({
  message_id: "m1",
  conversation_id: "c1",
  read_at: "2026-09-29T14:06:00.000Z",
  intent: "interested",
  claim: "person",
  summary: "Wants more details",
  named_day: null,
  refer_to: null,
  unread: null,
  reread: false,
  rereads: 0,
  undone: false,
  can_undo: false,
  draft: null,
  draft_state: "none",
  draft_why: null,
  business: "Brightwater & Co.",
  chain: "Reach out · Movers",
  step: 1,
  reply_from: { from: "mailbox", because: null },
  said_no: null,
  step_day: null,
  until_at: null,
  ...over,
});
const strip = (over) => replyStripOf(reading(over), NOW, TZ);

test("interested and a question: talking now, and the draft is in the reply box", () => {
  assert.deepEqual(strip({ draft: "Thank you for writing.", draft_state: "written" }), {
    title: "Wrote back · interested",
    said: "“Wants more details”",
    did: "Talking now. The receptionist drafted an answer: it's in the reply box.",
    doors: ["use_draft"],
  });
  const q = strip({ intent: "question", summary: "Asks the price" });
  assert.deepEqual([q.title, q.did, q.doors], ["Wrote back · a question", "Talking now.", []]);
  assert.equal(strip({ draft_state: "waiting" }).did, "Talking now. The receptionist is drafting an answer.");
  assert.equal(strip({ draft_state: "not_written" }).did, "Talking now.", "a draft not written says nothing");
});

test("not now: the step's day on Today, and the line of thanks", () => {
  const s = strip({
    intent: "not_now",
    named_day: "2027-01-04",
    step_day: "2027-01-04",
    draft: "Thanks, Sam",
    draft_state: "written",
  });
  assert.equal(s.title, "Wrote back · not now");
  assert.equal(
    s.did,
    "A step is on Today for Jan 4, 2027. The receptionist drafted a line of thanks: it's in the reply box.",
  );
  assert.equal(strip({ intent: "not_now", step_day: "2026-10-12" }).did, "A step is on Today for Oct 12.");
});

test("no: what it stopped, the domain when it was theirs, and the undo while the door allows it", () => {
  const no = { intent: "no", summary: "Asks to be taken off the list", can_undo: true };
  assert.deepEqual(strip({ ...no, said_no: { address: "office@example.com", domain: null } }), {
    title: "Said no",
    said: "“Asks to be taken off the list”",
    did: "Nothing more will be written to office@example.com.",
    doors: ["undo"],
  });
  assert.equal(
    strip({ ...no, said_no: { address: "office@example.com", domain: "example.com" } }).did,
    "Nothing more will be written to office@example.com or anyone at example.com.",
  );
  assert.equal(
    strip({ ...no, claim: "auto_reply" }).did,
    "Their automatic reply asked to be taken off your list. Nothing more will be written to them.",
  );
  assert.deepEqual(strip({ ...no, can_undo: false }).doors, [], "past its seven days, no door");
});

test("an undone no says what stands now: a person wrote back; an automatic reply lets the reach-out go on", () => {
  const undone = { intent: "no", undone: true, can_undo: false };
  assert.deepEqual(strip(undone), {
    title: "Wrote back",
    said: "“Wants more details”",
    did: "Read as no, then undone. The reach-out stays stopped: they wrote back.",
    doors: [],
  });
  assert.equal(
    strip({ ...undone, claim: "auto_reply" }).did,
    "Read as no, then undone. It was an automatic reply, so the reach-out goes on.",
  );
});

test("away: an automatic reply's day back, or their own words' step", () => {
  assert.equal(
    strip({ intent: "away", claim: "auto_reply", until_at: "2026-10-05T13:00:00.000Z" }).did,
    "Away until Oct 5 (an automatic reply). The reach-out goes on after that.",
  );
  assert.equal(
    strip({ intent: "away", named_day: "2026-10-12", step_day: "2026-10-12" }).did,
    "Away until Oct 12. A step is on Today for that day.",
  );
});

test("wrong person, other, and a reply not read yet", () => {
  assert.equal(
    strip({ intent: "wrong_person", refer_to: "their office manager" }).did,
    "Not the right person. They said to write to their office manager. A step is on Today.",
  );
  assert.deepEqual(strip({ intent: "other", summary: null }), {
    title: "Wrote back",
    said: null,
    did: null,
    doors: [],
  });
  const unread = { intent: "other", summary: null, unread: "model_failed" };
  assert.equal(strip(unread).did, "We couldn't read it yet: we'll try again.");
  assert.equal(strip({ ...unread, rereads: REPLY_REREADS }).did, "We couldn't read it.", "after the last try");
});

test("the row's chip: what it was read as, and Wrote back when it was not or was undone", () => {
  const chips = ["interested", "question", "not_now", "no", "wrong_person", "away", "other"].map((intent) =>
    replyChipOf({ intent, unread: null, undone: false }),
  );
  assert.deepEqual(chips, ["Interested", "Question", "Not now", "Said no", "Wrong person", "Away", "Wrote back"]);
  assert.equal(replyChipOf({ intent: "no", unread: null, undone: true }), "Wrote back");
  assert.equal(replyChipOf({ intent: "other", unread: "day_spent", undone: false }), "Wrote back");
});

test("the composer's line: the own address, or why it goes from the mailbox; nothing for any other reply", () => {
  const box = "hello@mail.example.com";
  assert.equal(
    replyFromLineOf({ from: "own", address: "sam@owndomain.example.com" }, box),
    "Goes from sam@owndomain.example.com.",
  );
  assert.equal(
    replyFromLineOf({ from: "mailbox", because: "domain_held", own: "sam@owndomain.example.com" }, box),
    "sam@owndomain.example.com is held, so this goes from hello@mail.example.com.",
  );
  assert.equal(
    replyFromLineOf({ from: "mailbox", because: "domain_removed", own: "sam@owndomain.example.com" }, box),
    "sam@owndomain.example.com was removed, so this goes from hello@mail.example.com.",
  );
  assert.equal(replyFromLineOf({ from: "mailbox", because: null }, box), null);
});

test("a sent reply that went from the mailbox says so; one that went as frozen says nothing", () => {
  const meta = (left_as, left_as_why) => ({
    email: {
      left_as,
      left_as_why,
      request: { from: '"Harbor" <hello@mail.example.com>' },
      own_request: { from: '"Sam at Harbor" <sam@owndomain.example.com>' },
    },
  });
  assert.equal(
    replyLeftAsOf(meta("mailbox")),
    "Went from hello@mail.example.com: sam@owndomain.example.com could not send it.",
  );
  assert.equal(
    replyLeftAsOf(meta("mailbox", "domain_held")),
    "Went from hello@mail.example.com: sam@owndomain.example.com's domain is held.",
    "a domain held between the freeze and the send says so",
  );
  assert.equal(replyLeftAsOf(meta("own")), null);
  assert.equal(replyLeftAsOf({ email: { request: { from: "hello@mail.example.com" } } }), null);
  assert.equal(replyLeftAsOf(null), null);
});

test("the notice for a no says it can be undone on the thread, and nothing else does", () => {
  const n = (intent) =>
    replyNoticeWords({
      intent,
      business: "Brightwater & Co.",
      summary: "x",
      quote: "",
      draft: null,
      unread: null,
      automatic: false,
      reread: false,
    });
  assert.match(n("no").body, /If that's a misreading, undo it on the thread within seven days\./);
  assert.doesNotMatch(n("interested").body, /undo/);
  assert.doesNotMatch(n("no").redacted, /undo/);
});

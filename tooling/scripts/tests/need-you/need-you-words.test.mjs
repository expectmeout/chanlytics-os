/**
 * Today's Need you, with Ask (decision 0071): what its words and clocks say, run as contracts runs them. Not now offers
 * times on the business's clock, never the device's; a send's grace is counted in whole seconds and never reads 0 while
 * it can still be stopped; Ask's one line says what it prepared and the one thing that cannot wait; a kept draft is
 * current only for the customer's newest message.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NEED_YOU_WORDS,
  SEND_GRACE_MS,
  draftHasWords,
  draftIsCurrent,
  needYouSay,
  notNowChoices,
  replyDraftAbout,
  sendCountdown,
} from "@chanlytics/contracts";

const TZ = "America/Chicago";
/** Friday 23 October 2026, at a wall-clock hour in Chicago (CDT, five hours behind UTC). */
const chicago = (hour, minute = 0) => Date.UTC(2026, 9, 23, hour + 5, minute);

test("Not now in the morning: in an hour, this afternoon at two, tomorrow at nine, Monday at nine, on the business's clock", () => {
  const c = notNowChoices(TZ, chicago(10, 30));
  assert.deepEqual(
    c.map((x) => [x.key, x.label, x.when]),
    [
      ["hour", "In 1 hour", "11:30 AM"],
      ["afternoon", "This afternoon", "2:00 PM"],
      ["tomorrow", "Tomorrow", "9:00 AM"],
      ["week", "Next week", "Mon 9:00 AM"],
    ],
  );
  assert.equal(c[1].until, "2026-10-23T19:00:00.000Z", "2 PM in Chicago, as the snooze's door takes it");
  assert.equal(c[2].until, "2026-10-24T14:00:00.000Z", "Saturday at nine");
  assert.equal(c[3].until, "2026-10-26T14:00:00.000Z", "the Monday after the next morning");
  assert.equal(c[2].back, "tomorrow at 9:00 AM");
  assert.equal(c[3].back, "Mon at 9:00 AM");
});

test("Not now in the afternoon offers the evening; after five it offers neither, never a time already gone", () => {
  assert.deepEqual(
    notNowChoices(TZ, chicago(15, 10)).map((x) => x.key),
    ["hour", "evening", "tomorrow", "week"],
  );
  assert.equal(notNowChoices(TZ, chicago(15, 10))[1].when, "6:00 PM");
  assert.deepEqual(
    notNowChoices(TZ, chicago(17, 40)).map((x) => x.key),
    ["hour", "tomorrow", "week"],
  );
  // Sunday: the next week's Monday is tomorrow's, so Not now offers the one after it, never the same morning twice.
  const sunday = Date.UTC(2026, 9, 25, 15);
  const week = notNowChoices(TZ, sunday).find((x) => x.key === "week");
  assert.equal(week.until, "2026-11-02T15:00:00.000Z", "Monday 2 November at nine, CST after the clocks go back");
});

test("a send's grace is counted in whole seconds from its receipt, and never reads 0 while it can be stopped", () => {
  const pressed = 1_000_000;
  const until = pressed + SEND_GRACE_MS;
  assert.deepEqual(sendCountdown(pressed, until, pressed), { seconds: 15, share: 1 });
  assert.deepEqual(sendCountdown(pressed, until, until - 1), { seconds: 1, share: 1 / SEND_GRACE_MS });
  assert.deepEqual(sendCountdown(pressed, until, until), { seconds: 0, share: 0 });
  assert.deepEqual(
    sendCountdown(pressed, until, until + 5_000),
    { seconds: 0, share: 0 },
    "a receipt in the past is gone",
  );
  // A row drawn partway through counts from where it was first seen, so the bar never starts part-empty.
  assert.equal(sendCountdown(pressed + 9_000, until, pressed + 9_000).share, 1);
});

test("the countdown says seconds under a minute and minutes from one up", () => {
  assert.equal(NEED_YOU_WORDS.sendingIn(12), "Sending in 12s");
  assert.equal(NEED_YOU_WORDS.sendingIn(60), "Sending in 1:00");
  assert.equal(NEED_YOU_WORDS.held.sendsIn(582), "Sends in 9:42");
  assert.equal(NEED_YOU_WORDS.review.postingIn(9), "Posting in 9s");
});

test("the head's sentence after the count: what Ask prepared, then the one thing that cannot wait; nothing when nothing is", () => {
  const none = { replies: 0, briefs: 0, writing: 0, firstWindow: null, held: null };
  assert.equal(needYouSay(none), null);
  assert.equal(needYouSay({ ...none, replies: 1 }), "Ask drafted a reply.");
  assert.equal(needYouSay({ ...none, replies: 2, briefs: 1 }), "Ask drafted 2 replies and a call brief.");
  // The redesign of 1 Nov 2026: one sentence, said by the head after how many need you, with the window's own time.
  assert.equal(
    needYouSay({ ...none, replies: 3, firstWindow: { who: "Dana", at: "11:52 AM" } }),
    "Ask drafted 3 replies, and Dana's reply window closes at 11:52 AM.",
  );
  assert.equal(
    needYouSay({ ...none, firstWindow: { who: "Dana", at: "11:52 AM" } }),
    "Dana's reply window closes at 11:52 AM.",
    "a window alone, with nothing drafted",
  );
  assert.equal(
    needYouSay({ ...none, replies: 1, firstWindow: { who: "Sam", at: "5:10 PM" }, held: { who: "Priya" } }),
    "Your receptionist answers Priya on its own unless you stop it. Ask drafted a reply, and Sam's reply window closes at 5:10 PM.",
    "a reply that goes on its own in minutes comes before a window that closes in hours",
  );
  assert.equal(needYouSay({ ...none, writing: 2 }), "Ask is drafting your replies.", "writing, with nothing ready yet");
});

test("a thread's draft is written from its hold, asks the owner nothing, and is current only for their newest message", () => {
  const reply = replyDraftAbout("reply", { reason: "Asked for a person", details: null });
  assert.match(reply, /Reply to what they wrote last/);
  assert.match(reply, /because: Asked for a person\./);
  assert.match(reply, /Do not ask me anything/);
  const brief = replyDraftAbout("brief", { reason: null, details: "Wants to move Thursday." });
  assert.match(brief, /^Call them back\. The phone receptionist left this for the call: Wants to move Thursday\./);
  assert.equal(draftIsCurrent({ for_message_id: "m2" }, "m2"), true);
  assert.equal(draftIsCurrent({ for_message_id: "m1" }, "m2"), false, "they have said more since: written again");
  const words = (text, brief = null) => ({ text, subject: "", brief, asks: [] });
  assert.equal(draftHasWords({ kind: "reply", words: words("Friday works.") }), true);
  assert.equal(draftHasWords({ kind: "reply", words: words("  ") }), false, "only a question Ask could not answer");
  assert.equal(
    draftHasWords({ kind: "brief", words: words("", { opening: "Hi", points: [], avoid: [], ask: "" }) }),
    true,
  );
});

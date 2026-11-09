/**
 * What the moment asks of a row (his call D6, 9 Nov 2026), and the words a row and a sheet say of it: a call reads the clock and
 * what they said; a reply that never reached them offers what can work; a reply to a reach-out says what was already done.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEED_YOU_OLD_MS, failedWayOf, frameDraftChange, otherTimeWords, slotNear } from "@chanlytics/contracts";
import {
  callMomentOf,
  callWhoOf,
  dayStripOf,
  readingMomentOf,
  sheetSubOf,
} from "../../apps/dashboard/src/surfaces/today/need-you/sheet/moment.ts";
import { needYouLineOf, reviewRowOf } from "../../apps/dashboard/src/surfaces/today/need-you/sheet/row-line.ts";

const TZ = "America/New_York";
// Monday, 9 Nov 2026, in New York.
const at = (hh, mm = 0) => Date.UTC(2026, 10, 9, hh + 5, mm);
const OPEN = { start: 9, end: 18, closedToday: false, nextOpenIn: 1 };
const row = (over = {}) => ({
  sentence: "About the winter offer.",
  phone: "+16095550142",
  waitedMs: 3_600_000,
  ...over,
});

test("a call: free after a time still to come waits for it, and once it has come says call", () => {
  const free = row({ sentence: "About two offices; she's free after 4 PM." });
  const waits = callMomentOf(free, { nowMs: at(9, 41), tz: TZ, open: OPEN });
  assert.equal(waits.lead, "wait");
  assert.equal(waits.back, "Back at 4 PM");
  assert.equal(Date.parse(waits.until), at(16));
  assert.equal(callMomentOf(free, { nowMs: at(16, 5), tz: TZ, open: OPEN }).lead, "call", "it is past 4: call");
  // "after 4" with no half is the afternoon; a span of days is no time.
  assert.equal(
    callMomentOf(row({ sentence: "Try after 4." }), { nowMs: at(9), tz: TZ, open: OPEN }).back,
    "Back at 4 PM",
  );
  assert.equal(
    callMomentOf(row({ sentence: "Back after 3 days away." }), { nowMs: at(10), tz: TZ, open: OPEN }).lead,
    "call",
  );
});

test("a call outside the business's hours waits for its next opening, and with no hours known says call", () => {
  const night = callMomentOf(row(), { nowMs: at(22, 41), tz: TZ, open: OPEN });
  assert.equal(night.lead, "wait");
  assert.equal(night.back, "Back at 9 AM");
  assert.equal(Date.parse(night.until), at(24 + 9));
  assert.equal(
    callMomentOf(row(), { nowMs: at(7), tz: TZ, open: OPEN }).back,
    "Back at 9 AM",
    "before it opens: today",
  );
  const weekend = callMomentOf(row(), { nowMs: at(22), tz: TZ, open: { ...OPEN, nextOpenIn: 2 } });
  assert.equal(weekend.back, "Back Wed at 9 AM", "its next open day, said by name");
  assert.equal(callMomentOf(row(), { nowMs: at(22), tz: TZ, open: null }).lead, "call");
});

test("a call past a week, or from someone selling, may be let go; with no number the thread is what is left", () => {
  assert.equal(
    callMomentOf(row({ waitedMs: NEED_YOU_OLD_MS + 1 }), { nowMs: at(10), tz: TZ, open: OPEN }).lead,
    "mark",
  );
  assert.equal(callMomentOf(row(), { nowMs: at(10), tz: TZ, open: OPEN, selling: true }).lead, "mark");
  assert.equal(callMomentOf(row({ phone: null }), { nowMs: at(10), tz: TZ, open: OPEN }).lead, "open");
  assert.equal(callWhoOf("Priya Shah"), "Priya");
  assert.equal(callWhoOf("+1 (609) 555-0177"), "them", "a number is called as them");
});

test("a reply that never arrived offers what can work, in plain words, and never its error number", () => {
  const way = (code, channel = "whatsapp") => failedWayOf({ code }, channel);
  assert.equal(way(131026).way, "call", "a template cannot reach a number that is not on WhatsApp");
  assert.match(way(131026).plain, /template wouldn't get through/);
  assert.equal(way(131047).way, "template", "the closed window is the one a template can open");
  assert.equal(way(130429).way, "later");
  assert.equal(way(131050).way, "done", "they chose to stop: nothing more goes");
  assert.equal(way(21610, "sms").way, "done");
  assert.equal(way(30006, "sms").way, "call", "a landline takes a call");
  for (const code of [131026, 131047, 130429, 131050, 21610, 30006])
    assert.doesNotMatch(way(code).plain, /\d{4,}|error/i, "the number stays in Health");
  assert.equal(way(131000).way, "again", "anything else goes again as written");
  assert.equal(failedWayOf(null, "whatsapp").way, "again");
});

test("a reach-out's reply says what was done and offers only what is left", () => {
  const read = (over) => ({
    intent: "other",
    claim: "person",
    step_day: null,
    refer_to: null,
    until_at: null,
    ...over,
  });
  const moment = (over) => readingMomentOf(read(over));
  assert.equal(moment({ intent: "interested" }).reply, "send");
  assert.equal(moment({ intent: "question" }).did, "Your sequence has stopped for them.");
  const later = moment({ intent: "not_now", step_day: "2027-01-05" });
  assert.equal(later.did, "Your sequence has stopped. A to-do to write again is set for Jan 5.");
  assert.equal(later.reply, "door", "Reply now, quiet: letting it go leads");
  assert.equal(moment({ intent: "no" }).reply, "none", "REGRESSION: Send under someone who said no");
  assert.match(moment({ intent: "wrong_person", refer_to: "Dana" }).did, /write to Dana/);
  assert.match(moment({ intent: "away", step_day: "2026-11-16" }).did, /Nov 16, when they are back/);
  const auto = moment({ claim: "auto_reply", intent: "other" });
  assert.equal(auto.notAPerson, true);
  assert.equal(auto.did, "An automatic reply. No person wrote this.");
  assert.equal(moment({ intent: "other" }), null, "any other reply is any other row");
  assert.equal(readingMomentOf(null), null);
});

test("a to-do's row leads with the job, whose and how late; a booking's says what for; a sheet's line says how it came", () => {
  const step = {
    kind: "step",
    who: "Bianca Adeyemi",
    sentence: "Chase the signed agreement",
    quoted: false,
    status: ["Overdue since Thu"],
    when: "",
    warn: true,
  };
  assert.deepEqual(needYouLineOf(step), {
    name: "Chase the signed agreement",
    sentence: "Bianca Adeyemi · overdue since Thu",
    quoted: false,
    tone: "warn",
  });
  assert.equal(
    needYouLineOf({ ...step, status: ["Due today", "For Dana"], warn: false }).sentence,
    "Bianca Adeyemi · due today · For Dana",
  );
  const asked = {
    kind: "handoff",
    who: "Omar",
    sentence: "Asked for tomorrow at 3:00 PM",
    quoted: false,
    status: [],
    when: "",
    warn: false,
    request: { conversationId: "c", service: "Discovery call" },
  };
  assert.equal(needYouLineOf(asked).sentence, "Asked for tomorrow at 3:00 PM · Discovery call");
  assert.equal(
    needYouLineOf({
      kind: "handoff",
      who: "Derek",
      sentence: "Didn't reach",
      quoted: false,
      status: [],
      when: "",
      warn: false,
      failed: {},
    }).tone,
    "danger",
  );
  assert.equal(sheetSubOf({ ...step, channel: "Next step" }), "To do · overdue since Thu");
  assert.equal(
    sheetSubOf({ kind: "callback", who: "P", phone: "+16095550142", channel: "Phone", when: "waited 1h", status: [] }),
    "+1 (609) 555-0142 · waited 1h",
  );
  assert.equal(
    sheetSubOf({
      kind: "reply",
      who: "I",
      channel: "Email",
      via: "Reach-out: Your spa",
      when: "waited 11d",
      status: [],
    }),
    "Email · Your spa · waited 11d",
  );
  const review = reviewRowOf({
    id: "r1",
    author: " Marcus Webb ",
    rating: 2,
    body: "Nobody called me back.",
    published_at: "2026-11-06T12:00:00Z",
  });
  assert.equal(review.who, "Marcus Webb");
  assert.equal(review.kind, "review");
  assert.equal(sheetSubOf(review, Date.parse("2026-11-09T12:00:00Z")), "Google · 3d ago");
});

test("another time's words, and a slot as near as a person would say it", () => {
  assert.equal(slotNear(at(15), TZ, at(9)), "today at 3:00 PM");
  assert.equal(slotNear(at(24 + 15), TZ, at(9)), "tomorrow at 3:00 PM");
  assert.equal(slotNear(at(72 + 11), TZ, at(9)), "Thursday at 11:00 AM");
  assert.equal(
    otherTimeWords("tomorrow at 3:00 PM", ["4:30 PM tomorrow", "10:00 AM on Wed, Nov 11"]),
    "Tomorrow at 3:00 PM has gone, sorry. Would 4:30 PM tomorrow or 10:00 AM on Wed, Nov 11 work instead?",
  );
  assert.match(otherTimeWords("today at 3:00 PM", []), /What other time suits you\?$/);
});

test("the day's strip: what stands there and the time asked for, as shares of the business's hours, cut to them", () => {
  const strip = dayStripOf(
    { start: 8, end: 18 },
    [
      { t: 7, dur: 120 },
      { t: 12, dur: 60 },
      { t: 20, dur: 60 },
    ],
    { start: 15, end: 15.5 },
  );
  assert.deepEqual(strip.busy, [
    { from: 0, width: 10 },
    { from: 40, width: 10 },
  ]);
  assert.deepEqual(strip.slot, { from: 70, width: 5 });
});

test("what the owner says to a draft is theirs to give, a figure included, and gives none of its own", () => {
  const framed = frameDraftChange("Tell them it's $45");
  assert.match(framed, /Owner: "Tell them it's \$45"/);
  assert.match(framed, /theirs to give/);
  assert.match(framed, /Give no price or figure the owner did not state/);
  assert.match(framed, /automated assistant, never a person/, "the one rule no message of theirs changes");
  assert.doesNotMatch(
    framed,
    /rules in your instructions still hold/,
    "REGRESSION: the model dropped the owner's own figure",
  );
});

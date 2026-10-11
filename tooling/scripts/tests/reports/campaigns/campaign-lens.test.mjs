/**
 * The Campaigns lens's own fold, EXECUTED (contracts reports/campaigns/campaign-lens.ts, with the words of
 * campaign-words.ts): the page-only fold that says every sentence the lens draws from its three reads -- the sends' report
 * (campaign_series), the ledger the route answers (campaign_ledger and campaign_stuck, judged) and the reach-outs -- the
 * head, the five figures against the period before, the funnel, what was held back, what stopped and why sends failed, each
 * message's rate, how long a reply and an approval took, and what is stuck now. The world is the one of Task 9
 * (_campaign-world.mjs): every expectation here is derived from it as it stands (240 messages to 180 people over 14 runs,
 * 48 of them wrote back), never from a round example. Run it under TEST_TZ=Pacific/Auckland too: the fold reads a day
 * only through the workspace's own zone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPORT_MIN_N, failureWordsOf, isUncounted, toCampaignLensVM, toCampaignReportVM } from "@chanlytics/contracts";
import { CAMPAIGNS, CAMPAIGNS_QUIET, NOW, NUMBER, QUIET, SERIES, STUCK_NOW, dtoWith } from "./_campaign-world.mjs";

/* ---------------------------------------------------------------- the world, varied */

const copy = (v) => structuredClone(v);
const fold = (over = {}) =>
  toCampaignLensVM({ campaigns: CAMPAIGNS, ledger: dtoWith(), reachOuts: undefined, ...over }, NOW);
const tile = (t) => [t.id, t.metric, t.label, t.value, t.meta, t.compare];
const rows = (part) => part.rows.map((r) => [r.id, r.label, r.value]);
/** The sentence the Runs that stopped card ends on, and what the stuck figure of failed runs adds: the two counts differ by kind alone. */
const REACH_OUTS_UNDER = "A reach-out's runs are not counted here.";
const STEP_COUNTS = "a reach-out's step counts too";

const dayRow = (day, over = {}) => ({
  day,
  sent: 0,
  delivered: 0,
  read: 0,
  replied: 0,
  opt_ins: 0,
  opt_outs: 0,
  ...over,
});

/** The sends' report with the period before replaced by `before` (its first day carries it), and this period as it was. */
const campaignsBefore = (before) => ({
  ...CAMPAIGNS,
  series: CAMPAIGNS.series.map((d, i) => (i < 30 ? dayRow(d.day, i === 0 ? before : {}) : d)),
});

/** The sends' report for a period of `sent` messages, `delivered` of them delivered and `replied` answered, in one run and one channel. */
const campaignsOf = ({ sent, delivered = sent, replied = 0, opt_ins = 0, opt_outs = 0, channel = "sms" }) => ({
  ...CAMPAIGNS,
  series: CAMPAIGNS.series.map((d, i) =>
    i === 30 ? dayRow(d.day, { sent, delivered, replied, opt_ins, opt_outs }) : dayRow(d.day),
  ),
  sources: [{ ...CAMPAIGNS.sources[0], runs: 1, sent, delivered, read: 0, replied }],
  by_channel: [{ channel, sent, delivered, read: 0, replied }],
});

/** The ledger for the window, with parts of it replaced. */
const ledgerWith = (over, stuck = STUCK_NOW) => dtoWith(over, stuck);
const peopleOf = (now, before = SERIES.people.before) => ({
  people: { now: { ...SERIES.people.now, ...now }, before },
});

/** A report of what the reach-outs wrote: `written` emails (to `businesses` businesses where the database counts them). */
const reachOutReport = (written, businesses) => ({
  timezone: "America/New_York",
  days: 30,
  today: "2026-09-04",
  since: "2026-08-06",
  has_reach_out: true,
  totals: {
    written,
    delivered: written,
    bounced: 0,
    wrote_back: 0,
    interested: 0,
    booked: 0,
    said_no: 0,
    handed: 0,
    ...(businesses === undefined ? {} : { businesses }),
  },
  series: [],
  chains: [],
  angles: [],
  other_angles: { written: 0, businesses: 0, wrote_back: 0 },
  no_angle: 0,
  domains: [],
});

/** Every string the fold's own parts hold (the sends' report and the reach-outs' fold are tested where they live). */
const stringsOf = (v) =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(stringsOf) : [];
const deepFreeze = (v) => {
  if (v && typeof v === "object") for (const x of Object.values(v)) deepFreeze(x);
  return Object.freeze(v);
};

/* ---------------------------------------------------------------- the head */

test("the head: how many messages to how many people over how many runs, and how many wrote back", () => {
  // 240 messages (the days' counts) to 180 people over 12 + 2 runs, 48 of the 180 wrote back, 41 the 30 days before.
  assert.equal(fold().head, "240 messages to 180 people over 14 runs; 48 of 180 wrote back (41 the 30 days before).");
  const before = (sent_to, wrote_back) => ({ sent_to, wrote_back });
  // Nobody was sent to the period before: no parenthesis; sent to but none wrote back: "none".
  assert.equal(
    fold({ ledger: ledgerWith(peopleOf({}, before(0, 0))) }).head,
    "240 messages to 180 people over 14 runs; 48 of 180 wrote back.",
  );
  assert.equal(
    fold({ ledger: ledgerWith(peopleOf({}, before(150, 0))) }).head,
    "240 messages to 180 people over 14 runs; 48 of 180 wrote back (none the 30 days before).",
  );
  // Fewer than five people: a share of them is never said, so the clause and its parenthesis are not.
  assert.equal(
    fold({ ledger: ledgerWith(peopleOf({ sent_to: 4, wrote_back: 2 })) }).head,
    "240 messages to 4 people over 14 runs.",
  );
  assert.equal(
    fold({ ledger: ledgerWith(peopleOf({ sent_to: REPORT_MIN_N, wrote_back: 1 })) }).head,
    "240 messages to 5 people over 14 runs; 1 of 5 wrote back (41 the 30 days before).",
  );
  // One of each is singular; a window of one day says "the day before".
  const one = fold({
    campaigns: campaignsOf({ sent: 1 }),
    ledger: ledgerWith({
      ...peopleOf({ sent_to: 1, wrote_back: 0 }),
      runs: { now: { moment: 1, broadcast: 0 }, before: SERIES.runs.before },
    }),
  });
  assert.equal(one.head, "1 message to 1 person over 1 run.");
  assert.equal(
    fold({ ledger: ledgerWith({ days: 1 }) }).head,
    "240 messages to 180 people over 14 runs; 48 of 180 wrote back (41 the day before).",
  );
});

test("the head without the ledger says the sends alone", () => {
  // The sources' runs (12 + 2) and the days' answered messages (50); the ledger's people are not there to say.
  const alone = "240 messages over 14 runs; people wrote back to 50 of them.";
  assert.equal(fold({ ledger: null }).head, alone, "the ledger failed");
  assert.equal(fold({ ledger: dtoWith(null) }).head, alone, "the database has no campaign_ledger");
  // Under five messages, a share of them is not said.
  assert.equal(
    fold({ ledger: null, campaigns: campaignsOf({ sent: REPORT_MIN_N - 1, replied: 2 }) }).head,
    "4 messages over 1 run.",
  );
  assert.equal(
    fold({ ledger: null, campaigns: campaignsOf({ sent: REPORT_MIN_N, replied: 2 }) }).head,
    "5 messages over 1 run; people wrote back to 2 of them.",
  );
});

test("a period that sent nothing says so, and what the reach-outs wrote if only they did", () => {
  const quiet = { campaigns: CAMPAIGNS_QUIET, ledger: ledgerWith(QUIET) };
  assert.equal(fold(quiet).head, "Nothing went out in this period.");
  assert.equal(
    fold({ ...quiet, reachOuts: reachOutReport(12, 9) }).head,
    "Nothing went out in this period. Your reach-outs wrote 12 emails to 9 businesses.",
  );
  assert.equal(
    fold({ ...quiet, reachOuts: reachOutReport(1, 1) }).head,
    "Nothing went out in this period. Your reach-outs wrote 1 email to 1 business.",
  );
  // A database that does not count businesses yet (before 00398) says the emails alone; a reach-out that wrote none says nothing.
  assert.equal(
    fold({ ...quiet, reachOuts: reachOutReport(12, undefined) }).head,
    "Nothing went out in this period. Your reach-outs wrote 12 emails.",
  );
  assert.equal(fold({ ...quiet, reachOuts: reachOutReport(0, 0) }).head, "Nothing went out in this period.");
  // The reach-outs are not in a head where campaigns went out: the head is the sends'.
  assert.equal(
    fold({ reachOuts: reachOutReport(12, 9) }).head,
    "240 messages to 180 people over 14 runs; 48 of 180 wrote back (41 the 30 days before).",
  );
});

test("where the sends could not be read there is no head, whatever else was", () => {
  assert.equal(fold({ campaigns: null }).head, null);
  assert.equal(fold({ campaigns: null, reachOuts: reachOutReport(12, 9) }).head, null);
});

/* ---------------------------------------------------------------- the strip */

test("the strip: people, the share delivered, the people who wrote back, the yeses and the stops, each against the period before", () => {
  const { strip } = fold();
  assert.deepEqual(strip.map(tile), [
    ["people-sent-to", "people_sent_to", "People sent to", "180", "240 messages over 14 runs", "up from 150"],
    [
      "delivered",
      "delivered_share",
      "Delivered",
      "92%",
      "220 of 240 · each channel's own receipts",
      "was 88% the 30 days before",
    ],
    [
      "wrote-back",
      "people_wrote_back",
      "Wrote back",
      "27%",
      "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
      "was 27% the 30 days before",
    ],
    ["said-yes", "said_yes", "Said yes", "14", "after a message of yours, within 3 days", "up from 11"],
    ["asked-to-stop", "asked_to_stop", "Asked to stop", "3", "after a message of yours, within 3 days", "up from 2"],
  ]);
  // A share carries the count it is of, for the kit to grey it under five; a count carries none.
  assert.deepEqual(
    strip.map((t) => [t.n, t.minN]),
    [
      [undefined, undefined],
      [240, REPORT_MIN_N],
      [180, REPORT_MIN_N],
      [undefined, undefined],
      [undefined, undefined],
    ],
  );
  // Plain ink: no tone, and no door, on any.
  assert.deepEqual(
    strip.map((t) => [t.tone, t.door]),
    strip.map(() => [undefined, undefined]),
  );
});

test("a reply still coming is said whenever the database counts one: the clock's rule, not the calendar's", () => {
  const wrote = (over) => fold({ ledger: ledgerWith(over) }).strip.at(2).meta;
  assert.equal(
    wrote({}),
    "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
    "a window that ends today",
  );
  assert.equal(
    wrote({ end: "2026-09-04", today: "2026-09-04" }),
    "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
  );
  assert.equal(
    wrote({ end: undefined }),
    "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
  );
  // Days a member picked that ended yesterday still have sends under 72 hours old: the database (00399 `mature`, by the clock)
  // counts them, and so the strip says so, as the By message line does (one maturity rule, not a calendar day's).
  assert.equal(
    wrote({ end: "2026-09-03" }),
    "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
    "a window that ended yesterday",
  );
  assert.equal(
    wrote({ end: "2026-09-02" }),
    "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
    "the database counts nine: the strip says nine",
  );
  // Once every send is mature the database answers 0, and that is the only thing that silences the words.
  assert.equal(wrote({ end: "2026-08-20", ...peopleOf({ counting: 0 }) }), "48 of 180 people within 3 days");
  assert.equal(
    wrote({ end: "2026-09-05" }),
    "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
    "a window is not over before its day, whatever the end says",
  );
  assert.equal(
    wrote({ end: "" }),
    "48 of 180 people within 3 days, 9 sent to in the last 3 days may still answer",
    "no end is today",
  );
  assert.equal(wrote(peopleOf({ counting: 0 })), "48 of 180 people within 3 days", "nobody is counting");
  const noCounting = copy(SERIES.people.now);
  delete noCounting.counting;
  assert.equal(wrote({ people: { now: noCounting, before: SERIES.people.before } }), "48 of 180 people within 3 days");
});

test("a share of fewer than five carries its n, and is never set beside the period before as a share", () => {
  const few = fold({
    campaigns: campaignsOf({ sent: 4, delivered: 3, replied: 1 }),
    ledger: ledgerWith(peopleOf({ sent_to: 4, wrote_back: 1, counting: 0 })),
  });
  const [, delivered, wrote] = few.strip;
  assert.deepEqual(
    [delivered.value, delivered.n, delivered.minN, wrote.value, wrote.n, wrote.minN],
    ["75%", 4, REPORT_MIN_N, "25%", 4, REPORT_MIN_N],
    "the share is said with the count it is of, and the kit greys it",
  );
  assert.equal(few.strip.at(2).meta, "1 of 4 people within 3 days");
  const one = fold({ ledger: ledgerWith(peopleOf({ sent_to: 1, wrote_back: 1, counting: 0 })) });
  assert.equal(one.strip.at(2).meta, "1 of 1 person within 3 days", "one person, singular");
  // The period before of fewer than five is a count, never a share (D9); none, or nothing now, is no comparison.
  const delivery = (before) => fold({ campaigns: campaignsBefore(before) }).strip.at(1).compare;
  assert.equal(delivery({ sent: 3, delivered: 2 }), "was 2 of 3 the 30 days before");
  assert.equal(delivery({ sent: 1, delivered: 0 }), "was 0 of 1 the 30 days before");
  assert.equal(delivery({ sent: 4, delivered: 4 }), "was 4 of 4 the 30 days before");
  assert.equal(delivery({ sent: 5, delivered: 4 }), "was 80% the 30 days before", "five is enough");
  assert.equal(delivery({ sent: 0, delivered: 0 }), null, "nothing sent before: nothing to set it against");
  assert.equal(
    fold({ campaigns: campaignsBefore({ sent: 3, delivered: 2 }) }).strip.at(0).compare,
    "up from 150",
    "people sent to are the ledger's, so the report's period before does not enter",
  );
  const wrotePast = (before) => fold({ ledger: ledgerWith(peopleOf({}, before)) }).strip.at(2).compare;
  assert.equal(wrotePast({ sent_to: 3, wrote_back: 1 }), "was 1 of 3 the 30 days before");
  assert.equal(wrotePast({ sent_to: 4, wrote_back: 0 }), "was 0 of 4 the 30 days before");
  assert.equal(wrotePast({ sent_to: 5, wrote_back: 1 }), "was 20% the 30 days before");
  assert.equal(wrotePast({ sent_to: 0, wrote_back: 0 }), null);
  assert.equal(
    fold({ ledger: ledgerWith(peopleOf({ sent_to: 0, wrote_back: 0, counting: 0 })) }).strip.at(2).compare,
    null,
    "nobody sent to now: a dash, and nothing to set it against",
  );
  // The whole strip, for a period before of three: no percentage of three anywhere.
  const small = fold({
    campaigns: campaignsBefore({ sent: 3, delivered: 2, replied: 1, opt_ins: 1 }),
    ledger: ledgerWith(peopleOf({}, { sent_to: 3, wrote_back: 1 })),
  }).strip;
  assert.deepEqual(
    small.map((t) => t.compare),
    [
      "up from 3",
      "was 2 of 3 the 30 days before",
      "was 1 of 3 the 30 days before",
      "up from 1",
      "none the 30 days before",
    ],
  );
  assert.doesNotMatch(JSON.stringify(small.map((t) => t.compare)), /%/);
});

test("the strip says a zero as 0 and a share of nothing as a dash, with words", () => {
  const nothing = fold({ campaigns: CAMPAIGNS_QUIET, ledger: ledgerWith(QUIET) });
  assert.deepEqual(nothing.strip.map(tile), [
    ["people-sent-to", "people_sent_to", "People sent to", "0", "no message went out in this period", null],
    ["delivered", "delivered_share", "Delivered", "—", "nothing sent", null],
    ["wrote-back", "people_wrote_back", "Wrote back", "—", "nobody was sent a message in this period", null],
    ["said-yes", "said_yes", "Said yes", "0", "nobody in this period", null],
    ["asked-to-stop", "asked_to_stop", "Asked to stop", "0", "nobody in this period", null],
  ]);
});

test("the yeses and the stops are compared in counts against the period before, where it was lived in", () => {
  // The period before had sends, yeses and stops: counts, "up from", "down from", "same as", "none".
  const answers = (before) =>
    fold({ campaigns: campaignsBefore(before) })
      .strip.slice(3)
      .map((t) => t.compare);
  assert.deepEqual(answers({ sent: 190, opt_ins: 14, opt_outs: 5 }), ["same as the 30 days before", "down from 5"]);
  assert.deepEqual(answers({ sent: 190, opt_ins: 20, opt_outs: 0 }), ["down from 20", "none the 30 days before"]);
  // A period before nobody sent in and nobody answered in is not one to compare with.
  assert.deepEqual(answers({}), [null, null]);
  // The words of the yes and the stop when there are none.
  const none = fold({ campaigns: campaignsOf({ sent: 10, delivered: 9 }) }).strip.slice(3);
  assert.deepEqual(
    none.map((t) => [t.value, t.meta]),
    [
      ["0", "nobody in this period"],
      ["0", "nobody in this period"],
    ],
  );
  // The report carries the period before for the strip to read (the Campaigns home reads the same fold).
  assert.deepEqual(fold().report.before, { sent: 190, delivered: 168, replied: 44, optIns: 11, optOuts: 2 });
});

test("without the ledger the strip is three figures, and with only the ledger it is two", () => {
  const ids = (vm) => vm.strip.map((t) => t.metric);
  assert.deepEqual(ids(fold({ ledger: dtoWith(null) })), ["delivered_share", "said_yes", "asked_to_stop"]);
  assert.deepEqual(ids(fold({ ledger: null })), ["delivered_share", "said_yes", "asked_to_stop"]);
  assert.deepEqual(ids(fold({ campaigns: null })), ["people_sent_to", "people_wrote_back"]);
  assert.deepEqual(ids(fold({ campaigns: null, ledger: null })), []);
  // The sends failing leaves no messages to count: the people sent to are said over their runs.
  assert.equal(fold({ campaigns: null }).strip.at(0).meta, "14 runs");
});

/* ---------------------------------------------------------------- the window's mixes */

test("the funnel: sent, delivered, read where WhatsApp sent, and answered, with its own sentence", () => {
  const { funnel } = fold();
  assert.deepEqual(rows(funnel), [
    ["sent", "Sent", 240],
    ["delivered", "Delivered", 220],
    ["read", "Read", 31],
    ["replied", "Answered", 50],
  ]);
  // The funnel counts messages and the strip's Wrote back counts people (48 of 180): no row of the funnel bears the strip's name.
  assert.equal(
    funnel.rows.some((r) => r.label === "Wrote back"),
    false,
  );
  assert.equal(fold().strip.find((t) => t.metric === "people_wrote_back").label, "Wrote back");
  // The sentence counts the messages as its last row does: answered, never "wrote back" (that is the strip's people).
  assert.equal(
    funnel.line,
    "92% were delivered, 26% of WhatsApp's were read and 21% were answered within 3 days, of 240 messages.",
  );
  assert.equal(funnel.empty, null);
  // The bars measure against the largest.
  assert.deepEqual(
    funnel.rows.map((r) => r.share),
    [1, 220 / 240, 31 / 240, 50 / 240],
  );
  // No WhatsApp send, no read: a text or an email keeps no receipt, so there is no row and no clause.
  const texts = fold({ campaigns: campaignsOf({ sent: 40, delivered: 36, replied: 8 }) }).funnel;
  assert.deepEqual(
    texts.rows.map((r) => r.id),
    ["sent", "delivered", "replied"],
  );
  assert.equal(texts.line, "90% were delivered and 20% were answered within 3 days, of 40 messages.");
  // One number on two pages (R1): the funnel's four values are the sends' fold's own totals, the Home's.
  const totals = toCampaignReportVM(CAMPAIGNS).totals;
  assert.deepEqual(Object.fromEntries(funnel.rows.map((r) => [r.id, r.value])), {
    sent: totals.sent,
    delivered: totals.delivered,
    read: totals.read,
    replied: totals.replied,
  });
  // A read is a share of WhatsApp's own sends alone: the clause is said from five of them, and the Read row keeps the count.
  const whatsapp = (sent, read) => ({
    ...CAMPAIGNS,
    by_channel: [
      { channel: "whatsapp", sent, delivered: sent, read, replied: 0 },
      { channel: "sms", sent: 240 - sent, delivered: 220 - sent, read: 0, replied: 50 },
    ],
  });
  const three = fold({ campaigns: whatsapp(3, 2) }).funnel;
  assert.equal(three.line, "92% were delivered and 21% were answered within 3 days, of 240 messages.");
  assert.doesNotMatch(three.line, /read/);
  assert.deepEqual(rows(three).at(2), ["read", "Read", 2], "the Read row keeps the count");
  const four = fold({ campaigns: whatsapp(REPORT_MIN_N - 1, 1) }).funnel;
  assert.doesNotMatch(four.line, /read/);
  const five = fold({ campaigns: whatsapp(REPORT_MIN_N, 2) }).funnel;
  assert.equal(
    five.line,
    "92% were delivered, 40% of WhatsApp's were read and 21% were answered within 3 days, of 240 messages.",
  );
  // Under five messages, no share; and each count takes its own verb: one was, none or two were.
  const few = fold({ campaigns: campaignsOf({ sent: 4, delivered: 3, replied: 1 }) }).funnel;
  assert.equal(few.line, "Of 4 messages, 3 were delivered and 1 was answered.");
  assert.equal(
    fold({ campaigns: campaignsOf({ sent: 1 }) }).funnel.line,
    "Of 1 message, 1 was delivered and 0 were answered.",
  );
  assert.equal(
    fold({ campaigns: campaignsOf({ sent: 2 }) }).funnel.line,
    "Of 2 messages, 2 were delivered and 0 were answered.",
  );
  assert.equal(
    fold({ campaigns: campaignsOf({ sent: 2, delivered: 1, replied: 1 }) }).funnel.line,
    "Of 2 messages, 1 was delivered and 1 was answered.",
  );
  assert.doesNotMatch(few.line, /wrote back/, "the messages are answered; the people write back");
  assert.deepEqual(fold({ campaigns: CAMPAIGNS_QUIET }).funnel, {
    rows: [],
    line: null,
    empty: "No message went out in this period.",
  });
});

test("what was held back, by reason in the owner's words, and the line that says how many of those planned", () => {
  const { held } = fold();
  assert.deepEqual(rows(held), [
    ["opted_out", "Asked to stop", 5],
    ["no_phone", "No number", 3],
    ["send_failed", "The provider refused it", 3],
    ["other", "Another reason", 1],
  ]);
  assert.equal(held.line, "12 of the 252 messages planned were held back or could not be sent.");
  assert.equal(held.empty, null);
  // One held is "was", and a single message planned is no plural: the line agrees with its count, not with the plan.
  const heldOf = (total, sent) =>
    fold({
      campaigns: campaignsOf({ sent }),
      ledger: ledgerWith({ held: { total, skipped: total, failed: 0, by_reason: { opted_out: total } } }),
    }).held.line;
  assert.equal(heldOf(1, 2), "1 of the 3 messages planned was held back or could not be sent.");
  assert.equal(heldOf(2, 1), "2 of the 3 messages planned were held back or could not be sent.");
  assert.equal(heldOf(1, 0), "1 of the 1 message planned was held back or could not be sent.");
  // A reason that is none of ours folds into "other", summed (the database sends any word that is lower case and underscored).
  const reasons = (by_reason, total) =>
    fold({ ledger: ledgerWith({ held: { total, skipped: total, failed: 0, by_reason } }) }).held;
  assert.deepEqual(rows(reasons({ opted_out: 2, zz_new_reason: 3, constructor: 1, other: 1 }, 7)), [
    ["other", "Another reason", 5],
    ["opted_out", "Asked to stop", 2],
  ]);
  assert.deepEqual(rows(reasons({ not_opted_in: 1 }, 1)), [["not_opted_in", "No recorded yes", 1]]);
  assert.deepEqual(fold({ ledger: ledgerWith(QUIET) }).held, {
    rows: [],
    line: null,
    empty: "Nobody was held back in this period.",
  });
});

test("the runs that stopped, by why, and the ones that were canceled", () => {
  const { stopped } = fold();
  assert.deepEqual(rows(stopped), [
    ["canceled", "Canceled", 1],
    ["paused", "The workspace was paused", 1],
    ["wire_unavailable:sms", "The texting provider could not be reached", 1],
  ]);
  assert.equal(stopped.line, `2 runs failed and 1 was canceled. ${REACH_OUTS_UNDER}`);
  const by = (failed, canceled, by_failure) =>
    fold({ ledger: ledgerWith({ stopped: { failed, canceled, by_failure } }) }).stopped;
  // A code nobody wrote words for yet, and "other", are one row.
  assert.deepEqual(rows(by(3, 0, { made_up_code: 2, other: 1 })), [["other", "It could not finish", 3]]);
  assert.equal(by(1, 2, { paused: 1 }).line, `1 run failed and 2 were canceled. ${REACH_OUTS_UNDER}`);
  assert.equal(by(0, 2, {}).line, `0 runs failed and 2 were canceled. ${REACH_OUTS_UNDER}`);
  assert.deepEqual(rows(by(0, 2, {})), [["canceled", "Canceled", 2]]);
  assert.deepEqual(fold({ ledger: ledgerWith(QUIET) }).stopped, {
    rows: [],
    line: null,
    empty: `No run failed or was canceled in this period. ${REACH_OUTS_UNDER}`,
  });
});

test("why sends failed, in the words the Inbox's thread uses for the same row", () => {
  const { failedWhy } = fold();
  // The code and the channel are the row's; the words are failureWordsOf's, without their full stop.
  const sentence = (channel, key) => failureWordsOf(channel, key).replace(/\.$/, "");
  assert.deepEqual(
    failedWhy.rows.map((r) => [r.label, r.value]),
    [
      [sentence("whatsapp", { code: 131049, kind: null }), 4],
      ["The email bounced: their address didn't accept it", 2],
    ],
  );
  assert.equal(failedWhy.line, "6 messages failed after they were sent, for the provider's own reason.");
  const why = (by_code) =>
    fold({ ledger: ledgerWith({ failed_sends: { total: by_code.reduce((t, c) => t + c.n, 0), by_code } }) }).failedWhy;
  // A code in no table is said by the provider and the number; a send the provider never answered may have gone.
  assert.deepEqual(
    why([
      { channel: "whatsapp", code: 999999, kind: null, n: 4 },
      { channel: "whatsapp", code: null, kind: "outcome_unknown", n: 2 },
      { channel: "sms", code: null, kind: "unknown", n: 2 },
      { channel: "email", code: null, kind: "unknown", n: 1 },
    ]).rows.map((r) => [r.label, r.value]),
    [
      ["WhatsApp didn't deliver it (error 999999)", 4],
      ["Reason not recorded", 3],
      ["The provider didn't answer in time, so it may have gone: check the thread before sending it again", 2],
    ],
  );
  // The same words from two channels are one row, summed: a settled send is said alike on every wire.
  const settled = why([
    { channel: "whatsapp", code: null, kind: "never_delivered", n: 3 },
    { channel: "sms", code: null, kind: "never_delivered", n: 2 },
    { channel: "email", code: null, kind: "bounced", n: 1 },
  ]);
  assert.deepEqual(
    settled.rows.map((r) => [r.label, r.value]),
    [
      ["It was never sent: the job that would have sent it never ran", 5],
      ["The email bounced: their address didn't accept it", 1],
    ],
  );
  assert.equal(
    why([{ channel: "sms", code: null, kind: "unknown", n: 1 }]).line,
    "1 message failed after it was sent, for the provider's own reason.",
  );
  assert.deepEqual(fold({ ledger: ledgerWith(QUIET) }).failedWhy, {
    rows: [],
    line: null,
    empty: "No sent message failed in this period.",
  });
});

test("each message's rate: the share who wrote back of the sends that have had their time", () => {
  const { byMessage } = fold();
  assert.deepEqual(
    byMessage.rows.map((r) => [r.id, r.label, r.value, r.display]),
    [
      ["winback_offer:en_US", "Win-back (earlier)", 27, "30 of 110 were answered  27%"],
      ["spring_note:en_US", "Spring note", 15, "18 of 120 were answered  15%"],
    ],
  );
  assert.equal(
    byMessage.line,
    "A reply is counted only for messages sent more than 3 days ago, so each has had its time. 10 sent since are not counted yet.",
  );
  assert.equal(byMessage.empty, null);
  const messages = (by_message) => fold({ ledger: ledgerWith({ by_message }) }).byMessage;
  // Under five mature sends carries no percentage (the bar is still drawn); with none it is too new to say.
  const thin = messages([
    { name: "spring_note", language: "en_US", sent: 9, mature: 4, replied: 1 },
    { name: "new_offer", language: "en_US", sent: 6, mature: 0, replied: 0 },
    { name: "old_offer", language: "en_US", sent: 5, mature: 5, replied: 0 },
  ]);
  assert.deepEqual(
    thin.rows.map((r) => [r.label, r.value, r.display]),
    [
      ["Spring note", 25, "1 of 4 was answered"],
      ["New offer", 0, "6 sent in the last 3 days, too new to say"],
      ["Old offer", 0, "0 of 5 were answered  0%"],
    ],
  );
  // The fewest that say anything is the lens's one (isThinShare): four sends say the count, five add the share; the verb agrees with
  // the count, and the sends are answered (the strip's people are the ones who write back).
  const rate = (mature, replied) =>
    messages([{ name: "spring_note", language: "en_US", sent: mature, mature, replied }]).rows.at(0).display;
  assert.deepEqual(
    [rate(4, 0), rate(4, 1), rate(4, 2), rate(5, 0), rate(5, 1), rate(5, 2)],
    [
      "0 of 4 were answered",
      "1 of 4 was answered",
      "2 of 4 were answered",
      "0 of 5 were answered  0%",
      "1 of 5 was answered  20%",
      "2 of 5 were answered  40%",
    ],
  );
  assert.doesNotMatch(
    JSON.stringify([byMessage.rows, thin.rows]),
    /wrote back/,
    "a send is answered, a person writes back",
  );
  // A bar carries the sends it is a share of, with the fewest that say anything, so the page can grey one of fewer than five (D9).
  assert.deepEqual(
    thin.rows.map((r) => [r.n, r.minN]),
    [
      [4, REPORT_MIN_N],
      [0, REPORT_MIN_N],
      [5, REPORT_MIN_N],
    ],
  );
  assert.deepEqual(
    byMessage.rows.map((r) => [r.n, r.minN]),
    [
      [110, REPORT_MIN_N],
      [120, REPORT_MIN_N],
    ],
  );
  // A title that two rows share says its language (the words message-languages gives it), so no two rows read alike.
  const twice = messages([
    { name: "spring_note", language: "en_US", sent: 40, mature: 40, replied: 4 },
    { name: "spring_note", language: "es", sent: 30, mature: 30, replied: 9 },
    { name: "old_offer", language: "en_US", sent: 20, mature: 20, replied: 2 },
  ]);
  assert.deepEqual(
    twice.rows.map((r) => [r.id, r.label, r.value]),
    [
      ["spring_note:en_US", "Spring note (English)", 10],
      ["spring_note:es", "Spring note (Spanish)", 30],
      ["old_offer:en_US", "Old offer", 10],
    ],
  );
  // Two codes that read alike are told apart by the place WhatsApp's list gives them.
  const alike = messages([
    { name: "spring_note", language: "en_US", sent: 40, mature: 40, replied: 4 },
    { name: "spring_note", language: "en", sent: 30, mature: 30, replied: 9 },
  ]);
  assert.equal(new Set(alike.rows.map((r) => r.label)).size, 2, "two rows, two labels");
  // A row with no language cannot be told from another: it is not drawn.
  const noLanguage = messages([
    { name: "spring_note", sent: 40, mature: 40, replied: 4 },
    { name: "old_offer", language: "en_US", sent: 20, mature: 20, replied: 2 },
  ]);
  assert.deepEqual(
    noLanguage.rows.map((r) => r.id),
    ["old_offer:en_US"],
  );
  assert.equal(JSON.stringify(noLanguage).includes("undefined"), false);
  // Five of the first (9 sent, 4 mature), six of the second and none of the third have not had their time.
  assert.match(thin.line, / 11 sent since are not counted yet\.$/);
  // A window that ended has had every reply's time: nothing to add. One new is singular.
  const aged = messages([{ name: "spring_note", language: "en_US", sent: 50, mature: 50, replied: 5 }]);
  assert.equal(aged.line, "A reply is counted only for messages sent more than 3 days ago, so each has had its time.");
  assert.match(
    messages([{ name: "spring_note", language: "en_US", sent: 11, mature: 10, replied: 5 }]).line,
    / 1 sent since is not counted yet\.$/,
  );
  assert.deepEqual(messages([]), { rows: [], line: null, empty: "No message went out in this period." });
});

test("the runs behind the sends, said once", () => {
  assert.equal(fold().runsLine, "From 12 campaign runs and 2 one-off broadcasts.");
  const runs = (moment, broadcast) =>
    fold({ ledger: ledgerWith({ runs: { now: { moment, broadcast }, before: SERIES.runs.before } }) }).runsLine;
  assert.equal(runs(1, 0), "From 1 campaign run.");
  assert.equal(runs(0, 1), "From 1 one-off broadcast.");
  assert.equal(runs(0, 0), null);
  assert.equal(fold({ ledger: null }).runsLine, null);
});

test("how soon the first reply came, a distribution whose empty buckets stay", () => {
  const { firstReply } = fold();
  assert.deepEqual(rows(firstReply), [
    ["m15", "Within 15 minutes", 8],
    ["h1", "Within an hour", 14],
    ["h4", "Within 4 hours", 12],
    ["h24", "Within a day", 11],
    ["h72", "Within 3 days", 5],
  ]);
  assert.equal(firstReply.line, "The middle one was answered 1h 30m after it was sent, of 50 answered messages.");
  const reply = (n, median_s, buckets) =>
    fold({
      ledger: ledgerWith({
        first_reply: { n, median_s, buckets: { m15: 0, h1: 0, h4: 0, h24: 0, h72: 0, ...buckets } },
      }),
    }).firstReply;
  // A middle is said of five or more; under that the words say there are too few.
  const five = reply(5, 600, { m15: 5 });
  assert.equal(five.line, "The middle one was answered 10m after it was sent, of 5 answered messages.");
  assert.deepEqual(
    five.rows.map((r) => r.value),
    [5, 0, 0, 0, 0],
    "the empty buckets are rows too",
  );
  assert.equal(reply(4, 600, { m15: 4 }).line, "4 messages have been answered so far: too few for a middle.");
  assert.equal(reply(1, 600, { h1: 1 }).line, "1 message has been answered so far: too few for a middle.");
  assert.deepEqual(reply(0, null, {}), { rows: [], line: null, empty: "No message was answered in this period." });
});

test("how long an approval waited, in the same shape", () => {
  const { approval } = fold();
  assert.deepEqual(rows(approval), [
    ["h1", "An hour or less", 1],
    ["h4", "Up to 4 hours", 1],
    ["h24", "Up to a day", 1],
    ["over", "More than a day", 1],
  ]);
  assert.equal(approval.line, "4 runs you approved: too few for a middle.");
  const wait = (n, median_s, buckets) =>
    fold({ ledger: ledgerWith({ approval: { n, median_s, buckets: { h1: 0, h4: 0, h24: 0, over: 0, ...buckets } } }) })
      .approval;
  assert.equal(wait(5, 7200, { h4: 5 }).line, "The middle wait for your OK was 2h, over 5 runs you approved.");
  assert.equal(wait(1, 600, { h1: 1 }).line, "1 run you approved: too few for a middle.");
  assert.deepEqual(wait(0, null, {}), { rows: [], line: null, empty: "No run waited for your OK in this period." });
});

/* ---------------------------------------------------------------- what is stuck now */

const stuckWith = (over) => fold({ ledger: dtoWith({}, { ...STUCK_NOW, ...over }) }).stuck;
const stuckTile = (t) => [t.id, t.metric, t.label, t.value, t.tone, t.door, t.meta];

test("what is stuck now: five figures, each with the tone it earns and the page it opens", () => {
  const { stuck } = fold();
  assert.deepEqual(stuck.map(stuckTile), [
    [
      "runs-waiting",
      "runs_waiting",
      "Runs waiting for you",
      "3",
      "warn",
      "campaigns",
      "1 past their day (skip those), 2 can still be approved",
    ],
    [
      "runs-failed",
      "runs_failed",
      "Failed runs",
      "1",
      "fail",
      "broadcasts",
      `the latest: Spring note, the workspace was paused · ${STEP_COUNTS}`,
    ],
    [
      "replies-waiting",
      "campaign_replies_waiting",
      "Replies waiting on you",
      "2",
      "warn",
      "inbox",
      "people who answered a campaign in the last 30 days and wait for a person",
    ],
    [
      "templates-paused",
      "templates_paused",
      "Messages Meta stopped",
      "2",
      "fail",
      "messages",
      "Win-back (earlier) paused, Spring note rejected",
    ],
    [
      "number-health",
      "number_health",
      "Your WhatsApp number",
      "Good",
      undefined,
      "admin/integrations",
      "Number quality: good · up to 1,000 new conversations a day · checked today",
    ],
  ]);
  for (const t of stuck)
    assert.deepEqual([t.compare, t.n, t.minN], [null, undefined, undefined], `${t.id}: a count, set against nothing`);
});

test("runs waiting say how many can still be approved and how many are past their day", () => {
  const waiting = (n, late) => stuckTile(stuckWith({ waiting: { n, late, oldest_at: null, capped: false } }).at(0));
  assert.deepEqual(waiting(2, 0).slice(3), ["2", "warn", "campaigns", "they can still be approved"]);
  assert.deepEqual(waiting(1, 0).slice(3), ["1", "warn", "campaigns", "it can still be approved"]);
  assert.deepEqual(waiting(2, 2).slice(3), ["2", "warn", "campaigns", "they are past their day: skip them"]);
  assert.deepEqual(waiting(1, 1).slice(3), ["1", "warn", "campaigns", "it is past its day: skip it"]);
  assert.deepEqual(waiting(5, 2).slice(3), [
    "5",
    "warn",
    "campaigns",
    "2 past their day (skip those), 3 can still be approved",
  ]);
  // Nothing waiting is a zero with no tone.
  assert.deepEqual(waiting(0, 0).slice(3), ["0", undefined, "campaigns", "nothing is waiting for your OK"]);
  // A list cut at what the database lists is a floor: "500+".
  const capped = stuckTile(stuckWith({ waiting: { n: 500, late: 0, oldest_at: null, capped: true } }).at(0));
  assert.equal(capped[3], "500+");
});

test("the quiet side of each figure has no tone, and says so in words", () => {
  const quiet = stuckWith({
    waiting: { n: 0, late: 0, oldest_at: null, capped: false },
    failed: { n: 0, latest: null, capped: false },
    replies: { n: 0, oldest_at: null, capped: false },
    templates: { n: 0, items: [] },
  });
  assert.deepEqual(
    quiet.map((t) => [t.value, t.tone, t.meta]),
    [
      ["0", undefined, "nothing is waiting for your OK"],
      ["0", undefined, "no run failed in the last 30 days"],
      ["0", undefined, "nobody who answered a campaign is waiting"],
      ["0", undefined, "every WhatsApp message is approved"],
      ["Good", undefined, "Number quality: good · up to 1,000 new conversations a day · checked today"],
    ],
  );
  // The lists the database cut are floors.
  const cut = stuckWith({
    failed: {
      n: 500,
      latest: { name: "Spring note", failure: "wire_unavailable:email", at: "2026-09-02T15:00:00.000Z" },
      capped: true,
    },
    replies: { n: 37, oldest_at: null, capped: true },
  });
  assert.deepEqual(
    [cut.at(1).value, cut.at(1).meta, cut.at(2).value],
    ["500+", `the latest: Spring note, the mail provider could not be reached · ${STEP_COUNTS}`, "37+"],
  );
});

test("two counts of failed runs, told apart in words: the stuck figure counts a reach-out's step, the window's card leaves it to Reach-outs", () => {
  const failedMeta = (failed) => stuckWith({ failed }).at(1).meta;
  // Of the runs that failed in the last 30 days (any kind), with the newest named or not; none says nothing to qualify.
  assert.equal(failedMeta({ n: 3, latest: null, capped: false }), `3 runs failed in the last 30 days · ${STEP_COUNTS}`);
  assert.equal(failedMeta({ n: 1, latest: null, capped: false }), `1 run failed in the last 30 days · ${STEP_COUNTS}`);
  assert.equal(failedMeta({ n: 0, latest: null, capped: false }), "no run failed in the last 30 days");
  // The window's card says where the reach-outs are counted, with runs and without.
  assert.match(fold().stopped.line, new RegExp(`${REACH_OUTS_UNDER}$`));
  assert.match(fold({ ledger: ledgerWith(QUIET) }).stopped.empty, new RegExp(`${REACH_OUTS_UNDER}$`));
});

test("the messages Meta stopped name up to two, and say how each was stopped", () => {
  const items = (...statuses) => statuses.map((status, i) => ({ name: `offer_${i}`, language: "en_US", status }));
  const meta = (list) => stuckWith({ templates: { n: list.length, items: list.slice(0, 3) } }).at(3);
  assert.equal(meta(items("disabled")).meta, "Offer 0 turned off");
  assert.equal(meta(items("paused", "rejected")).meta, "Offer 0 paused, Offer 1 rejected");
  const three = meta(items("paused", "rejected", "disabled"));
  assert.deepEqual([three.value, three.meta, three.tone], ["3", "Offer 0 paused, Offer 1 rejected", "fail"]);
});

test("your WhatsApp number: how it is rated, and the two states with no number to rate", () => {
  const number = (n) => stuckTile(stuckWith({ number: n }).at(4)).slice(3);
  const read = (tone, over = {}) => ({ ...NUMBER, tone, label: `a ${tone} number`, ...over });
  assert.deepEqual(number(read("ok")), ["Good", undefined, "admin/integrations", "a ok number · checked today"]);
  assert.deepEqual(number(read("warn")), ["Medium", "warn", "admin/integrations", "a warn number · checked today"]);
  assert.deepEqual(number(read("danger")), [
    "Flagged",
    "fail",
    "admin/integrations",
    "a danger number · checked today",
  ]);
  assert.deepEqual(number(read("unknown")), [
    "Not reported",
    undefined,
    "admin/integrations",
    "a unknown number · checked today",
  ]);
  // When it was last checked is said as the workspace's own days say it; unchecked says nothing of it.
  assert.equal(number(read("ok", { checked_at: "2026-09-03T10:00:00.000Z" })).at(3), "a ok number · checked yesterday");
  assert.equal(number(read("ok", { checked_at: "2026-08-31T14:00:00.000Z" })).at(3), "a ok number · checked Mon");
  assert.equal(number(read("ok", { checked_at: null })).at(3), "a ok number");
  assert.equal(number(read("ok", { checked_at: "not a time" })).at(3), "a ok number");
  assert.deepEqual(number({ state: "none" }), [
    "—",
    undefined,
    "admin/integrations",
    "no WhatsApp number is connected",
  ]);
  assert.deepEqual(number({ state: "unread" }), [
    "—",
    undefined,
    "admin/integrations",
    "this number could not be read",
  ]);
});

/* ---------------------------------------------------------------- a period with nothing in it */

test("nothing in the period: one quiet lens, every window part with its words, and no NaN", () => {
  const stuckAlone = fold({ campaigns: CAMPAIGNS_QUIET, ledger: ledgerWith(QUIET) });
  assert.equal(stuckAlone.quiet, true);
  assert.equal(stuckAlone.head, "Nothing went out in this period.");
  assert.deepEqual(
    [
      stuckAlone.funnel,
      stuckAlone.held,
      stuckAlone.stopped,
      stuckAlone.failedWhy,
      stuckAlone.firstReply,
      stuckAlone.approval,
    ].map((p) => [p.rows, p.line, p.empty]),
    [
      [[], null, "No message went out in this period."],
      [[], null, "Nobody was held back in this period."],
      [[], null, `No run failed or was canceled in this period. ${REACH_OUTS_UNDER}`],
      [[], null, "No sent message failed in this period."],
      [[], null, "No message was answered in this period."],
      [[], null, "No run waited for your OK in this period."],
    ],
  );
  assert.deepEqual(stuckAlone.byMessage, { rows: [], line: null, empty: "No message went out in this period." });
  assert.equal(stuckAlone.runsLine, null);
  // What is stuck is as of now, not of the period: it still draws.
  assert.equal(stuckAlone.stuck.length, 5);
  const said = stringsOf({ ...stuckAlone, report: null, reachOuts: null });
  assert.ok(said.length > 30, "the whole fold was read");
  assert.deepEqual(
    said.filter((s) => /NaN|undefined|Infinity|null|%/.test(s)),
    [],
    "no value is a share of nothing",
  );
  // The reach-outs alone keep the period quiet and say what they wrote.
  const reachOnly = fold({ campaigns: CAMPAIGNS_QUIET, ledger: ledgerWith(QUIET), reachOuts: reachOutReport(12, 9) });
  assert.equal(reachOnly.quiet, true);
  assert.equal(reachOnly.head, "Nothing went out in this period. Your reach-outs wrote 12 emails to 9 businesses.");
  assert.equal(reachOnly.reachOuts.present, true);
  assert.equal(reachOnly.reachOuts.totals.written, 12);
});

test("a period is quiet only when nothing went out, nothing was held or stopped and nobody answered", () => {
  const quiet = { campaigns: CAMPAIGNS_QUIET, ledger: ledgerWith(QUIET) };
  assert.equal(fold(quiet).quiet, true);
  assert.equal(fold().quiet, false, "a workspace that sent");
  assert.equal(fold({ ...quiet, ledger: null }).quiet, true, "the ledger is not read: the sends alone decide");
  assert.equal(
    fold({
      ...quiet,
      ledger: ledgerWith({ ...QUIET, held: { total: 2, skipped: 2, failed: 0, by_reason: { opted_out: 2 } } }),
    }).quiet,
    false,
    "someone was held back",
  );
  assert.equal(
    fold({ ...quiet, ledger: ledgerWith({ ...QUIET, stopped: { failed: 1, canceled: 0, by_failure: { paused: 1 } } }) })
      .quiet,
    false,
    "a run failed",
  );
  assert.equal(
    fold({ ...quiet, ledger: ledgerWith({ ...QUIET, stopped: { failed: 0, canceled: 1, by_failure: {} } }) }).quiet,
    false,
    "a run was canceled",
  );
  const yes = {
    ...CAMPAIGNS_QUIET,
    series: CAMPAIGNS_QUIET.series.map((d, i) => (i === 31 ? dayRow(d.day, { opt_ins: 1 }) : d)),
  };
  assert.equal(fold({ ...quiet, campaigns: yes }).quiet, false, "someone said yes");
  assert.equal(fold({ campaigns: null }).quiet, false, "the sends could not be read: that is not a quiet period");
});

/* ---------------------------------------------------------------- each read alone */

test("each read alone: a ledger a database lacks is missing, and says nothing", () => {
  const vm = fold({ ledger: dtoWith(null) });
  assert.deepEqual(vm.reads, { campaigns: "ok", ledger: "missing", stuck: "ok", reachOuts: "none" });
  assert.deepEqual(vm.failed, []);
  assert.equal(vm.strip.length, 3, "the people the runs reached are not said");
  assert.deepEqual(
    [vm.held, vm.stopped, vm.failedWhy, vm.byMessage, vm.firstReply, vm.approval].map((p) => [p.rows, p.line, p.empty]),
    Array.from({ length: 6 }, () => [[], null, null]),
    "no card for a read that is not there, and no empty words either",
  );
  assert.equal(vm.runsLine, null);
  assert.equal(vm.funnel.rows.length, 4, "the sends' own parts stand");
  assert.equal(vm.stuck.length, 5, "and what is stuck stands");
  assert.equal(vm.quiet, false);
});

test("each read alone: a ledger that failed is one failure, and says what still stands", () => {
  const vm = fold({ ledger: null });
  assert.deepEqual(vm.reads, { campaigns: "ok", ledger: "failed", stuck: "failed", reachOuts: "none" });
  assert.deepEqual(vm.failed, [
    { part: "ledger", what: "who it reached and what is stuck", body: "The rest of this page is current." },
  ]);
  assert.equal(vm.strip.length, 3);
  assert.deepEqual(vm.stuck, []);
  assert.deepEqual(vm.byMessage, { rows: [], line: null, empty: null });
  assert.equal(vm.funnel.rows.length, 4);
  assert.notEqual(vm.head, null, "the head is the sends'");
});

test("each read alone: the stuck read failing fails what is stuck now alone", () => {
  const vm = fold({ ledger: { ...dtoWith(), stuck: null, stuck_failed: true } });
  assert.deepEqual(vm.reads, { campaigns: "ok", ledger: "ok", stuck: "failed", reachOuts: "none" });
  assert.deepEqual(vm.failed, [
    { part: "stuck", what: "what is stuck now", body: "The rest of this page is current." },
  ]);
  assert.deepEqual(vm.stuck, []);
  assert.equal(vm.strip.length, 5, "the window stands");
  // A stuck read a database lacks is missing: no failure.
  const lacks = fold({ ledger: { ...dtoWith(), stuck: null } });
  assert.deepEqual(lacks.reads, { campaigns: "ok", ledger: "ok", stuck: "missing", reachOuts: "none" });
  assert.deepEqual([lacks.failed, lacks.stuck], [[], []]);
  // A read that failed has nothing to judge, whatever was passed with it; and a ledger the database lacks can still fail its stuck half.
  const both = fold({ ledger: { ...dtoWith(), stuck_failed: true } });
  assert.deepEqual([both.reads.stuck, both.stuck, both.failed.map((f) => f.part)], ["failed", [], ["stuck"]]);
  const apart = fold({ ledger: { ...dtoWith(null), stuck: null, stuck_failed: true } });
  assert.deepEqual(apart.reads, { campaigns: "ok", ledger: "missing", stuck: "failed", reachOuts: "none" });
  assert.deepEqual(apart.failed, [
    { part: "stuck", what: "what is stuck now", body: "The rest of this page is current." },
  ]);
});

test("each read alone: the sends failing fails the sends and keeps the ledger's parts", () => {
  const vm = fold({ campaigns: null });
  assert.deepEqual(vm.reads, { campaigns: "failed", ledger: "ok", stuck: "ok", reachOuts: "none" });
  assert.deepEqual(vm.failed, [
    { part: "campaigns", what: "the campaign numbers", body: "The rest of this page is current." },
  ]);
  assert.deepEqual([vm.head, vm.report], [null, null]);
  assert.deepEqual([vm.funnel, vm.quiet], [{ rows: [], line: null, empty: null }, false]);
  // What the ledger says alone is still said: why runs stopped and sends failed, the messages' rates, the waits, what is stuck.
  assert.equal(vm.stopped.line, `2 runs failed and 1 was canceled. ${REACH_OUTS_UNDER}`);
  assert.equal(vm.failedWhy.rows.length, 2);
  assert.equal(vm.byMessage.rows.length, 2);
  assert.equal(vm.firstReply.rows.length, 5);
  assert.equal(vm.runsLine, "From 12 campaign runs and 2 one-off broadcasts.");
  assert.equal(vm.stuck.length, 5);
  // What was held is said, but not as a share of what was planned: the messages sent are not known.
  assert.deepEqual([vm.held.rows.length, vm.held.line], [4, null]);
});

test("each read alone: the reach-outs undefined are none, failed are one failure, read are the fold's", () => {
  assert.equal(fold().reads.reachOuts, "none");
  assert.equal(fold().reachOuts, null);
  const failed = fold({ reachOuts: null });
  assert.equal(failed.reads.reachOuts, "failed");
  assert.deepEqual(failed.failed, [
    { part: "reach_outs", what: "the reach-out numbers", body: "The rest of this page is current." },
  ]);
  assert.equal(failed.reachOuts, null);
  const read = fold({ reachOuts: reachOutReport(12, 9) });
  assert.equal(read.reads.reachOuts, "ok");
  assert.deepEqual(
    [read.reachOuts.present, read.reachOuts.totals.written, read.reachOuts.totals.businesses],
    [true, 12, 9],
  );
  assert.deepEqual(read.failed, []);
  // A server before the report existed answers with nothing in it: a reach-out read, with nothing to draw, never a throw.
  const bare = fold({ reachOuts: {} });
  assert.deepEqual([bare.reads.reachOuts, bare.reachOuts.present, bare.failed], ["ok", false, []]);
});

test("when more than one read failed, each failure says what could still be read", () => {
  const two = fold({ campaigns: null, reachOuts: null });
  assert.deepEqual(two.failed, [
    {
      part: "campaigns",
      what: "the campaign numbers",
      body: "Only who it reached and what is stuck now could be read.",
    },
    {
      part: "reach_outs",
      what: "the reach-out numbers",
      body: "Only who it reached and what is stuck now could be read.",
    },
  ]);
  const stuckAndSends = fold({
    campaigns: null,
    ledger: { ...dtoWith(), stuck: null, stuck_failed: true },
    reachOuts: reachOutReport(3, 3),
  });
  assert.deepEqual(
    stuckAndSends.failed.map((f) => [f.part, f.body]),
    [
      ["campaigns", "Only who it reached and the reach-outs could be read."],
      ["stuck", "Only who it reached and the reach-outs could be read."],
    ],
  );
  const one = fold({ campaigns: null, ledger: dtoWith(null), reachOuts: null });
  assert.deepEqual(
    one.failed.map((f) => [f.part, f.body]),
    [
      ["campaigns", "Only what is stuck now could be read."],
      ["reach_outs", "Only what is stuck now could be read."],
    ],
    "a ledger the database lacks is not failed, and its stuck half stands",
  );
  const sendsOnly = fold({ ledger: null, reachOuts: null });
  assert.deepEqual(
    sendsOnly.failed.map((f) => [f.part, f.body]),
    [
      ["ledger", "Only the sends and their channels could be read."],
      ["reach_outs", "Only the sends and their channels could be read."],
    ],
  );
  const all = fold({ campaigns: null, ledger: null, reachOuts: null });
  assert.deepEqual(
    all.failed.map((f) => [f.part, f.body]),
    [
      ["campaigns", "Nothing else on this page could be read either."],
      ["ledger", "Nothing else on this page could be read either."],
      ["reach_outs", "Nothing else on this page could be read either."],
    ],
  );
  assert.deepEqual(
    [all.head, all.report, all.strip, all.stuck, all.reachOuts, all.quiet],
    [null, null, [], [], null, false],
  );
});

/* ---------------------------------------------------------------- a leaf that is not there is not said */

test("a count the ledger did not send is not said as a zero", () => {
  const without = (path, series = SERIES) => {
    const s = copy(series);
    let at = s;
    for (const key of path.slice(0, -1)) at = at[key];
    delete at[path.at(-1)];
    return fold({ ledger: ledgerWith(s) });
  };
  // The people who wrote back: no clause in the head, no figure.
  const noWrote = without(["people", "now", "wrote_back"]);
  assert.equal(noWrote.head, "240 messages to 180 people over 14 runs.");
  assert.deepEqual(
    noWrote.strip.map((t) => t.metric),
    ["people_sent_to", "delivered_share", "said_yes", "asked_to_stop"],
  );
  // The people sent to: the sends alone are said.
  const noSentTo = without(["people", "now", "sent_to"]);
  assert.equal(noSentTo.head, "240 messages over 14 runs; people wrote back to 50 of them.");
  assert.ok(!noSentTo.strip.some((t) => t.metric === "people_sent_to" || t.metric === "people_wrote_back"));
  // The period before's people: nothing to set this one against.
  const noBefore = without(["people", "before", "wrote_back"]);
  assert.equal(noBefore.head, "240 messages to 180 people over 14 runs; 48 of 180 wrote back.");
  assert.equal(noBefore.strip.at(2).compare, null);
  // What was held, stopped or failed: a part that cannot say its total says nothing, not "nobody was held back".
  assert.deepEqual(without(["held", "total"]).held, { rows: [], line: null, empty: null });
  assert.deepEqual(without(["stopped", "canceled"]).stopped, { rows: [], line: null, empty: null });
  assert.deepEqual(without(["failed_sends", "total"]).failedWhy, { rows: [], line: null, empty: null });
  // A distribution missing a bucket is not one with an empty bucket.
  assert.deepEqual(without(["first_reply", "buckets", "h4"]).firstReply, { rows: [], line: null, empty: null });
  assert.deepEqual(without(["approval", "n"]).approval, { rows: [], line: null, empty: null });
  // That shape is one predicate for whoever says the parts in words of their own (Ask): not counted is told from counted nothing.
  const left = [
    without(["held", "total"]).held,
    without(["stopped", "canceled"]).stopped,
    without(["failed_sends", "total"]).failedWhy,
    without(["first_reply", "buckets", "h4"]).firstReply,
    without(["approval", "n"]).approval,
    fold({ ledger: null }).held,
    fold({ ledger: null }).byMessage,
    fold({ campaigns: null }).funnel,
  ];
  assert.deepEqual(left.map(isUncounted), Array(left.length).fill(true));
  const said = [
    fold().held,
    fold().byMessage,
    fold().funnel,
    fold({ ledger: ledgerWith(QUIET) }).held,
    fold({ campaigns: CAMPAIGNS_QUIET }).funnel,
  ];
  assert.deepEqual(said.map(isUncounted), Array(said.length).fill(false), "counted, or counted none and said so");
  // The runs: neither kind is a zero.
  assert.equal(without(["runs", "now", "broadcast"]).runsLine, null);
  // A message's own counts: a row that cannot say its sends is not drawn.
  const rowsLeft = fold({
    ledger: ledgerWith({
      by_message: [{ name: "winback_offer", language: "en_US", sent: 120, replied: 30 }, SERIES.by_message.at(1)],
    }),
  }).byMessage;
  assert.deepEqual(
    rowsLeft.rows.map((r) => r.label),
    ["Spring note"],
  );
  // None of it is a NaN or an undefined, anywhere.
  for (const vm of [noWrote, noSentTo, noBefore, rowsLeft])
    assert.deepEqual(
      stringsOf(vm).filter((s) => /NaN|undefined|Infinity/.test(s)),
      [],
    );
});

/* ---------------------------------------------------------------- the fold as a function */

test("the fold writes nothing into what it is given, and says the same thing twice", () => {
  const input = deepFreeze(copy({ campaigns: CAMPAIGNS, ledger: dtoWith(), reachOuts: reachOutReport(12, 9) }));
  const first = toCampaignLensVM(input, NOW);
  assert.deepEqual(toCampaignLensVM(input, NOW), first);
  assert.equal(first.reads.reachOuts, "ok");
});

/**
 * Reviews, drawn from what is stored (contracts reports/review-report.ts): the window the counts are made over, which reviews
 * are the Business Profile's, the counts of a period and the one before it, the mix, who answered and how fast, what waits,
 * and every sentence the lens, its head and Ask say, character for character. EXECUTED over the rows the one bounded read
 * returns (the world's Harbor Studio, Fri Sep 4, 2026, New York): the real functions, no page.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REVIEWS_WAITING_SHOWN,
  lensAnswerOf,
  metricWordsOf,
  reviewsReadSince,
  reviewsWindowOf,
  toGoogleVM,
  toReviewsReportVM,
} from "@chanlytics/contracts";
import {
  REVIEWS_NOW,
  googleConnection,
  googleListing,
  googleReview,
  reviewsDto,
  reviewsGoogle,
  reviewsLedger,
  writtenReview,
} from "../_report-world.mjs";

const vmOf = (dto) => toReviewsReportVM(dto, { nowMs: REVIEWS_NOW });
/** A figure as a person reads it, by its id. */
const tile = (vm, id) => vm.tiles.find((t) => t.id === id);
const said = (t) => ({ value: t.value, meta: t.meta, compare: t.compare });
/** The profile's reviews of one period, the whole record on hand: `written` rows, each also waiting when it has no reply. */
const ledgerOf = (written, over = {}) => {
  const waiting = written
    .filter((r) => !r.has_reply)
    .map((r) => googleReview(r.id, r.published_at, { rating: r.rating }));
  return reviewsLedger({ written, waiting, waiting_total: waiting.length, replies: [], held: [], ...over });
};
/** A listing with its reviews counted, the profile synced; `google` holds what the page's own read does. */
const dtoOf = (ledger, google = {}) => reviewsDto({ ledger, google: reviewsGoogle(google) });

const at = (day, hour = 14) => `${day}T${String(hour).padStart(2, "0")}:00:00Z`;

test("the window: a period ends today, the one before it as long, and the one read starts a day wider than both", () => {
  assert.deepEqual(reviewsWindowOf("2026-09-04", 30), { since: "2026-08-06", priorSince: "2026-07-07" });
  assert.deepEqual(reviewsWindowOf("2026-09-04", 7), { since: "2026-08-29", priorSince: "2026-08-22" });
  assert.deepEqual(
    reviewsWindowOf("2026-10-01", 1),
    { since: "2026-10-01", priorSince: "2026-09-30" },
    "Month on the 1st",
  );
  assert.deepEqual(
    reviewsWindowOf("2026-03-02", 5),
    { since: "2026-02-26", priorSince: "2026-02-21" },
    "across a month's end",
  );
  assert.equal(reviewsReadSince("2026-09-04", 30), "2026-07-06T00:00:00.000Z");
  assert.equal(reviewsReadSince("2026-09-04", 7), "2026-08-21T00:00:00.000Z");
  assert.equal(REVIEWS_WAITING_SHOWN, 5);
});

test("the Business Profile's reviews are the source only once a sync has stored them", () => {
  const places = [googleReview("p1", at("2026-09-03"), { origin: "places" })];
  const before = { connection: googleConnection({ last_synced_at: null }), reviews: places };
  assert.equal(
    toGoogleVM(reviewsGoogle(before), 30, REVIEWS_NOW).source,
    "the one Google shows first",
    "a location is chosen, nothing synced: the rows are still the public five",
  );
  const pending = { connection: googleConnection({ location_name: null, last_synced_at: null }), reviews: places };
  assert.equal(toGoogleVM(reviewsGoogle(pending), 30, REVIEWS_NOW).source, "the one Google shows first");
  assert.equal(toGoogleVM(reviewsGoogle(), 30, REVIEWS_NOW).source, "every review, from your Business Profile");
  const early = vmOf(reviewsDto({ google: reviewsGoogle(before) }));
  assert.equal(early.source, "places", "the report draws no count over five reviews Google picked");
  assert.equal(early.figures, null);
  assert.equal(early.google.source, "the one Google shows first");
  assert.equal(vmOf(reviewsDto()).source, "profile");
  assert.equal(vmOf(reviewsDto()).google.source, "every review, from your Business Profile");
});

test("a synced profile with some reviews answered: the counts, the mix, the speed, the weeks and every sentence", () => {
  const vm = vmOf(reviewsDto());
  assert.deepEqual(
    vm.tiles.map((t) => [t.id, t.metric, t.label]),
    [
      ["rating", "rating", "Rating on Google"],
      ["reviews", "reviews", "Reviews on Google"],
      ["written", "reviews_written", "New in 30 days"],
      ["answered", "reviews_answered", "Answered"],
      ["reply_time", "review_reply_time", "Time to reply"],
    ],
  );
  assert.deepEqual(said(tile(vm, "rating")), {
    value: "4.8",
    meta: "213 reviews · checked 3h ago",
    compare: "up from 4.7",
  });
  assert.deepEqual(said(tile(vm, "reviews")), {
    value: "213",
    meta: "as Google counts them, with or without words",
    compare: null,
  });
  assert.deepEqual(said(tile(vm, "written")), { value: "6", meta: "with words or without", compare: "up from 3" });
  assert.deepEqual(said(tile(vm, "answered")), {
    value: "3 of 6",
    meta: "1 by the receptionist, 2 by you",
    compare: null,
  });
  assert.deepEqual(said(tile(vm, "reply_time")), { value: "6h", meta: "the middle of 3 replies", compare: null });
  assert.deepEqual(
    tile(vm, "written").spark,
    Array.from({ length: 30 }, (_, i) => ([0, 6, 8, 14, 26, 28].includes(i) ? 1 : 0)),
    "one point per day, Aug 6 to Sep 4",
  );
  for (const t of vm.tiles)
    assert.equal(t.delta, null, `${t.id}: a count against the period before, never a percentage`);
  assert.deepEqual(vm.figures, {
    written: 6,
    prior: 3,
    answered: 3,
    receptionist: 1,
    timed: 3,
    replySeconds: 21_600,
  });
  assert.deepEqual(vm.stars.rows, [
    { id: "5", label: "5 stars", value: 3, display: "3 · 50%" },
    { id: "4", label: "4 stars", value: 2, display: "2 · 33%" },
    { id: "3", label: "3 stars", value: 0, display: "0 · 0%" },
    { id: "2", label: "2 stars", value: 1, display: "1 · 17%" },
    { id: "1", label: "1 star", value: 0, display: "0 · 0%" },
  ]);
  assert.equal(vm.stars.rated, 6);
  assert.deepEqual(vm.stars.table, {
    columns: ["Stars", "Reviews", "Share"],
    rows: [
      ["5 stars", 3, "50%"],
      ["4 stars", 2, "33%"],
      ["3 stars", 0, "0%"],
      ["2 stars", 1, "17%"],
      ["1 star", 0, "0%"],
    ],
  });
  assert.deepEqual(
    vm.weekly.points.map((w) => [w.day, w.label, w.short, w.written]),
    [
      ["2026-08-06", "Aug 6", "6", 1],
      ["2026-08-10", "Aug 10", "10", 2],
      ["2026-08-17", "Aug 17", "17", 1],
      ["2026-08-24", "Aug 24", "24", 0],
      ["2026-08-31", "Aug 31", "31", 2],
    ],
    "Monday to Sunday, the first week from the period's first day and the last up to today",
  );
  assert.equal(vm.weekly.total, 6);
  assert.equal(vm.weekly.max, 2);
  assert.deepEqual(vm.lines, {
    head: "4.8 on Google from 213 reviews; 6 new in the last 30 days, 3 answered.",
    mix: "5 of the 6 reviews written in the last 30 days are 4 or 5 stars.",
    weekly: "6 written over 5 weeks",
    history: null,
    connect: null,
  });
  assert.equal(vm.empty, false);
  assert.ok(!/NaN|undefined|null\./.test(JSON.stringify(vm)), "no sentence reads a missing value aloud");
});

test("the period asked for is the period said: seven days, and Month's one day on the 1st", () => {
  const week = vmOf(reviewsDto({ days: 7 }));
  assert.deepEqual(said(tile(week, "written")), {
    value: "2",
    meta: "with words or without",
    compare: "none the 7 days before",
  });
  assert.equal(tile(week, "written").label, "New in 7 days");
  assert.equal(week.lines.head, "4.8 on Google from 213 reviews; 2 new in the last 7 days, all answered.");
  assert.equal(week.lines.mix, "2 of the 2 reviews written in the last 7 days are 4 or 5 stars.");
  assert.equal(week.lines.weekly, "2 written over 2 weeks");
  assert.deepEqual(
    week.weekly.points.map((w) => [w.day, w.written]),
    [
      ["2026-08-29", 0],
      ["2026-08-31", 2],
    ],
  );
  const day = vmOf(reviewsDto({ days: 1 }));
  assert.equal(day.days, 1, "the fold reads the period off the read it folds");
  assert.equal(tile(day, "written").label, "New in 1 day");
  assert.equal(day.lines.head, "4.8 on Google from 213 reviews; none new today.");
  assert.equal(day.lines.mix, "No review written in this period.");
});

test("what waits: the oldest reviews with no reply, the reply the receptionist held, and none drawn twice", () => {
  const vm = vmOf(reviewsDto());
  assert.equal(vm.waiting.total, 4);
  assert.deepEqual(
    vm.waiting.rows.map((r) => [r.id, r.rating, r.held]),
    [
      ["old", 3, null],
      ["f", 4, null],
      ["e", 5, null],
      ["d", 2, "The receptionist wrote a reply and held it: it named a price."],
    ],
  );
  assert.equal(vm.waiting.rows[0].author, "Ana P.", "each is a review as the page draws one");
  assert.equal(vm.waiting.rows[0].fromProfile, true);
  assert.deepEqual(
    vm.latest.map((r) => r.id),
    ["a", "b", "c"],
    "the newest, less the ones already waiting",
  );
  assert.deepEqual(vm.latestTable.columns, ["Reviewer", "Stars", "Written", "Words"]);
  assert.equal(vm.latestTable.rows.length, vm.latest.length);
  assert.equal(
    vm.latestTable.rows.length,
    vm.google.table.rows.length - vm.waiting.rows.length,
    "Google's own table lists the waiting ones too: the newest twenty",
  );
  for (const [row, r] of vm.latestTable.rows.map((row, i) => [row, vm.latest[i]]))
    assert.deepEqual(row, [r.author, r.rating ?? "—", r.when || "—", r.text || "—"]);
  const money = reviewsLedger({
    held: [
      { review_id: "d", why: "money" },
      { review_id: "e", why: "tone" },
    ],
  });
  const rows = vmOf(reviewsDto({ ledger: money })).waiting.rows;
  assert.equal(rows[3].held, "The receptionist wrote a reply and held it: it named money.");
  assert.equal(rows[2].held, null, "a reason this set does not hold is never guessed");
  const many = Array.from({ length: 7 }, (_, i) => googleReview(`w${i}`, at(`2026-05-0${i + 1}`)));
  const capped = vmOf(reviewsDto({ ledger: reviewsLedger({ waiting: many, waiting_total: 9 }) })).waiting;
  assert.equal(capped.total, 9, "how many wait is the read's count");
  assert.equal(capped.rows.length, REVIEWS_WAITING_SHOWN, "the list shows the oldest few");
  assert.deepEqual(
    capped.rows.map((r) => r.id),
    ["w0", "w1", "w2", "w3", "w4"],
  );
});

test("a profile review none of which was answered", () => {
  const written = [
    writtenReview("n1", at("2026-09-03"), 5),
    writtenReview("n2", at("2026-08-30"), 4),
    writtenReview("n3", at("2026-08-10"), 5),
  ];
  const vm = vmOf(dtoOf(ledgerOf(written)));
  assert.deepEqual(said(tile(vm, "written")), {
    value: "3",
    meta: "with words or without",
    compare: "none the 30 days before",
  });
  assert.deepEqual(said(tile(vm, "answered")), { value: "0 of 3", meta: "none answered yet", compare: null });
  assert.deepEqual(said(tile(vm, "reply_time")), { value: "—", meta: "no replies yet", compare: null });
  assert.deepEqual(vm.lines, {
    head: "4.8 on Google from 213 reviews; 3 new in the last 30 days, none answered yet.",
    mix: "3 of the 3 reviews written in the last 30 days are 4 or 5 stars.",
    weekly: "3 written over 5 weeks",
    history: null,
    connect: null,
  });
  assert.equal(vm.waiting.total, 3);
  assert.deepEqual(vm.figures.receptionist, 0);
  assert.equal(vm.figures.replySeconds, null);
});

test("two replies say how many there are; the third gives the middle", () => {
  const answered = (id, day, afterH) => writtenReview(id, at(day, 10), 5, at(day, 10 + afterH));
  const two = vmOf(dtoOf(ledgerOf([answered("x1", "2026-09-03", 1), answered("x2", "2026-08-30", 2)])));
  assert.deepEqual(said(tile(two, "answered")), { value: "2 of 2", meta: "2 by you", compare: null });
  assert.deepEqual(said(tile(two, "reply_time")), {
    value: "—",
    meta: "2 replies so far; the middle needs 3",
    compare: null,
  });
  assert.equal(two.lines.head, "4.8 on Google from 213 reviews; 2 new in the last 30 days, all answered.");
  assert.equal(two.figures.timed, 2);
  assert.equal(two.figures.replySeconds, null, "under three, no middle");
  const one = vmOf(dtoOf(ledgerOf([answered("x1", "2026-09-03", 1), writtenReview("x2", at("2026-08-30"), 5)])));
  assert.equal(tile(one, "reply_time").meta, "1 reply so far; the middle needs 3");
  const three = vmOf(
    dtoOf(
      ledgerOf([answered("x1", "2026-09-03", 1), answered("x2", "2026-08-30", 2), answered("x3", "2026-08-25", 5)]),
    ),
  );
  assert.deepEqual(said(tile(three, "reply_time")), { value: "2h", meta: "the middle of 3 replies", compare: null });
  const four = vmOf(
    dtoOf(
      ledgerOf([
        answered("x1", "2026-09-03", 1),
        answered("x2", "2026-08-30", 2),
        answered("x3", "2026-08-25", 5),
        answered("x4", "2026-08-20", 8),
      ]),
    ),
  );
  assert.equal(tile(four, "reply_time").value, "3h 30m", "an even count takes the middle of the two between");
});

test("who answered: the latest reply Chanlytics recorded under a review, and every other reply is the owner's", () => {
  const written = [
    writtenReview("r1", at("2026-09-03"), 5, at("2026-09-03", 16)),
    writtenReview("r2", at("2026-09-02"), 5, at("2026-09-02", 16)),
    writtenReview("r3", at("2026-09-01"), 5, at("2026-09-01", 16)),
    writtenReview("r4", at("2026-08-31"), 5, at("2026-08-31", 16)),
  ];
  const replies = [
    { review_id: "r1", by: "receptionist", at: at("2026-09-03", 16) },
    // r2: the receptionist replied, then the owner replaced it: the owner's, though events arrive in any order
    { review_id: "r2", by: null, at: at("2026-09-02", 18) },
    { review_id: "r2", by: "receptionist", at: at("2026-09-02", 16) },
    // r3: the owner's, then the receptionist's own: the receptionist's
    { review_id: "r3", by: "receptionist", at: at("2026-09-01", 18) },
    { review_id: "r3", by: null, at: at("2026-09-01", 16) },
    // r4 has none: written on Google, so the owner's
    // another workspace's review, or one outside the period, is no part of the count
    { review_id: "elsewhere", by: "receptionist", at: at("2026-09-01", 16) },
  ];
  const vm = vmOf(dtoOf(ledgerOf(written, { replies })));
  assert.equal(tile(vm, "answered").meta, "2 by the receptionist, 2 by you");
  assert.equal(vm.figures.receptionist, 2);
  const none = vmOf(dtoOf(ledgerOf(written, { replies: [] })));
  assert.equal(tile(none, "answered").meta, "4 by you");
  const all = vmOf(
    dtoOf(
      ledgerOf(written, { replies: written.map((r) => ({ review_id: r.id, by: "receptionist", at: r.replied_at })) }),
    ),
  );
  assert.equal(tile(all, "answered").meta, "4 by the receptionist");
});

test("a period with no review in it: a real zero where the history is known, and the period before beside it", () => {
  const written = [writtenReview("g", at("2026-07-20"), 5, at("2026-07-21")), writtenReview("h", at("2026-07-10"), 3)];
  const vm = vmOf(dtoOf(ledgerOf(written)));
  assert.deepEqual(said(tile(vm, "written")), { value: "0", meta: "none in this period", compare: "down from 2" });
  assert.deepEqual(said(tile(vm, "answered")), { value: "—", meta: "nothing to answer", compare: null });
  assert.deepEqual(said(tile(vm, "reply_time")), { value: "—", meta: "nothing to answer", compare: null });
  assert.deepEqual(vm.lines, {
    head: "4.8 on Google from 213 reviews; none new in the last 30 days.",
    mix: "No review written in this period.",
    weekly: "No review written in this period.",
    history: null,
    connect: null,
  });
  assert.equal(vm.stars, null);
  assert.equal(vm.weekly, null);
  assert.equal(vm.figures.written, 0);
  const quiet = vmOf(dtoOf(ledgerOf([])));
  assert.equal(tile(quiet, "written").compare, null, "nothing against nothing says nothing");
});

test("the workspace's day decides which period a review is in, at the edge of each", () => {
  // New York is four hours behind UTC: 04:00Z is its midnight.
  const written = [
    writtenReview("pe", "2026-08-06T03:59:00Z", 5), // Aug 5, 23:59 there: the period before
    writtenReview("se", "2026-08-06T04:00:00Z", 5), // Aug 6, 00:00: the period's first day
    writtenReview("te", "2026-09-05T03:59:00Z", 5), // Sep 4, 23:59: today
    writtenReview("fu", "2026-09-05T04:00:00Z", 5), // Sep 5, 00:00: tomorrow, in neither
    writtenReview("bp", "2026-07-07T04:00:00Z", 5), // Jul 7, 00:00: the period before's first day
    writtenReview("ba", "2026-07-07T03:59:00Z", 5), // Jul 6, 23:59: before both
  ];
  const vm = vmOf(dtoOf(ledgerOf(written)));
  assert.equal(vm.figures.written, 2);
  assert.equal(vm.figures.prior, 2);
  assert.deepEqual(
    vm.weekly.points.map((w) => [w.day, w.written]),
    [
      ["2026-08-06", 1],
      ["2026-08-10", 0],
      ["2026-08-17", 0],
      ["2026-08-24", 0],
      ["2026-08-31", 1],
    ],
  );
  // The same instants in Auckland (twelve hours ahead) fall on other days: both of Aug 6's are in the period, Sep 5's in none.
  const auckland = vmOf({ ...dtoOf(ledgerOf(written)), timezone: "Pacific/Auckland" });
  assert.equal(auckland.figures.written, 2);
  assert.deepEqual(
    auckland.weekly.points.map((w) => [w.day, w.written]),
    [
      ["2026-08-06", 2],
      ["2026-08-10", 0],
      ["2026-08-17", 0],
      ["2026-08-24", 0],
      ["2026-08-31", 0],
    ],
  );
});

test("a review with no date is in no period, and one with no stars is in no mix", () => {
  const written = [
    writtenReview("d1", at("2026-09-03"), 5),
    writtenReview("d2", at("2026-09-02"), null, at("2026-09-02", 16)),
    writtenReview("d3", null, 5),
    writtenReview("d4", "not a date", 4),
    writtenReview("d5", at("2026-09-01"), 0),
  ];
  const vm = vmOf(dtoOf(ledgerOf(written)));
  assert.equal(vm.figures.written, 3, "d1, d2 and d5: the ones with a day");
  assert.equal(vm.stars.rated, 1, "only d1 has one of the five stars");
  assert.equal(
    vm.lines.mix,
    "1 of the 1 rated review written in the last 30 days is 4 or 5 stars.",
    "a review of one is said in the singular",
  );
  assert.equal(vm.figures.answered, 1);
  const mixed = [
    writtenReview("m1", at("2026-09-03"), 5),
    writtenReview("m2", at("2026-09-02"), null),
    writtenReview("m3", at("2026-09-01"), 2),
  ];
  assert.equal(
    vmOf(dtoOf(ledgerOf(mixed))).lines.mix,
    "1 of the 2 rated reviews written in the last 30 days are 4 or 5 stars.",
    "the count it says is of the rated ones, and it says so",
  );
  const unrated = vmOf(dtoOf(ledgerOf([writtenReview("u1", at("2026-09-03"), null)])));
  assert.equal(unrated.lines.mix, "No star rating among the reviews written in the last 30 days.");
  assert.equal(unrated.stars, null);
  // a reply with no time, or one dated before its review, answers it but says nothing of speed
  const odd = [
    writtenReview("o1", at("2026-09-03"), 5, null, { has_reply: true }),
    writtenReview("o2", at("2026-09-02", 12), 5, at("2026-09-02", 8)),
  ];
  const timed = vmOf(dtoOf(ledgerOf(odd)));
  assert.equal(timed.figures.answered, 2);
  assert.equal(timed.figures.timed, 0);
  assert.equal(tile(timed, "reply_time").meta, "no reply has a time on record");
});

test("history that does not reach the period is a dash and says where it starts, never a zero", () => {
  const written = [
    writtenReview("a", at("2026-09-03"), 5, at("2026-09-03", 16)),
    writtenReview("b", at("2026-09-01"), 4),
    writtenReview("c", at("2026-08-25"), 5),
    writtenReview("old", at("2026-08-20"), 3),
  ];
  // 40 of Google's 213 are on record, the oldest written Aug 20: the period began Aug 6
  const short = vmOf(
    dtoOf(ledgerOf(written, { on_record: { profile: 40, places: 0, oldest_at: at("2026-08-20", 12) } })),
  );
  const startsAug20 = "history on record starts Aug 20";
  for (const id of ["written", "answered", "reply_time"]) {
    assert.deepEqual(said(tile(short, id)), { value: "—", meta: startsAug20, compare: null }, id);
  }
  assert.deepEqual(short.figures, {
    written: null,
    prior: null,
    answered: null,
    receptionist: null,
    timed: null,
    replySeconds: null,
  });
  assert.equal(short.stars, null, "a mix of the part of a period on record is no mix of the period");
  assert.deepEqual(short.lines, {
    head: `4.8 on Google from 213 reviews; ${startsAug20}.`,
    mix: null,
    weekly: "3 written over 2 weeks",
    history: startsAug20,
    connect: null,
  });
  assert.deepEqual(
    short.weekly.points.map((w) => w.day),
    ["2026-08-24", "2026-08-31"],
    "only the weeks the record covers from their first day: Aug 20 is mid-week in the week of Aug 17",
  );
  assert.equal(short.weekly.total, 3);
  // the record reaches the period but not the one before it: the count is exact, its comparison is not made
  const reaches = vmOf(
    dtoOf(ledgerOf(written, { on_record: { profile: 40, places: 0, oldest_at: at("2026-07-30", 12) } })),
  );
  assert.deepEqual(said(tile(reaches, "written")), { value: "4", meta: "with words or without", compare: null });
  assert.equal(reaches.figures.prior, null);
  assert.equal(reaches.lines.history, "history on record starts Jul 30");
  assert.equal(reaches.lines.head, "4.8 on Google from 213 reviews; 4 new in the last 30 days, 1 answered.");
  assert.equal(reaches.lines.mix, "3 of the 4 reviews written in the last 30 days are 4 or 5 stars.");
  // none of it dated: the record exists in name only
  const nothing = vmOf(dtoOf(ledgerOf([], { on_record: { profile: 0, places: 0, oldest_at: null } })));
  assert.equal(tile(nothing, "written").meta, "no review history on record yet");
  assert.equal(nothing.lines.head, "4.8 on Google from 213 reviews; no review history on record yet.");
  // the record is complete when the workspace holds as many as Google counts, or more (a review Google later removed)
  const whole = vmOf(
    dtoOf(ledgerOf(written, { on_record: { profile: 214, places: 0, oldest_at: at("2026-08-20", 12) } })),
  );
  assert.equal(whole.figures.written, 4);
  assert.equal(whole.lines.history, null);
});

test("with no review on Google the sentence says so, and the figures are the listing's", () => {
  const none = { listing: googleListing({ rating: null, review_count: 0 }), reviews: [], days: [] };
  const empty = {
    written: [],
    waiting: [],
    waiting_total: 0,
    replies: [],
    held: [],
    on_record: { profile: 0, places: 0, oldest_at: null },
  };
  const vm = vmOf(dtoOf(reviewsLedger(empty), none));
  assert.equal(vm.lines.head, "No reviews on Google yet.");
  assert.deepEqual(
    vm.tiles.map((t) => [t.id, t.value, t.meta]),
    [
      ["rating", "—", "0 reviews · checked 3h ago"],
      ["reviews", "0", "as Google counts them, with or without words"],
      ["written", "0", "none in this period"],
      ["answered", "—", "nothing to answer"],
      ["reply_time", "—", "nothing to answer"],
    ],
  );
  assert.equal(vm.lines.mix, "No review written in this period.");
  assert.equal(vm.stars, null);
  assert.equal(vm.empty, false, "a listing with no reviews is not an empty lens");
  // Places leaves the count out of a listing nobody has rated: a read that succeeded says none; one that did not says nothing
  const uncounted = reviewsDto({
    google: reviewsGoogle({ ...none, listing: googleListing({ rating: null, review_count: null }), connection: null }),
    ledger: null,
  });
  assert.equal(vmOf(uncounted).lines.head, "No reviews on Google yet.");
  const unread = reviewsDto({
    google: reviewsGoogle({
      listing: googleListing({ rating: null, review_count: null, checked_at: null }),
      reviews: [],
      days: [],
      connection: null,
    }),
    ledger: null,
  });
  assert.equal(vmOf(unread).lines.head, "Not read yet.");
  const failed = reviewsDto({
    google: reviewsGoogle({
      listing: googleListing({ rating: null, review_count: null, checked_at: null, check_error: "boom" }),
      reviews: [],
      days: [],
      connection: null,
    }),
    ledger: null,
  });
  assert.equal(vmOf(failed).lines.head, "Google could not be read yet — read again once a day.");
});

const placesOnly = (days, over = {}) =>
  reviewsDto({
    google: reviewsGoogle({
      connection: null,
      ready: { places: true, profile: true },
      reviews: [googleReview("p1", at("2026-09-03"), { origin: "places", author: "Ben R." })],
      days,
      ...over,
    }),
    ledger: null,
  });

test("a listing with the five public reviews: Google's four figures with the period before beside them, and what the profile adds", () => {
  const vm = vmOf(
    placesOnly([
      { day: "2026-07-06", rating: 4.6, review_count: 190 },
      { day: "2026-08-05", rating: 4.7, review_count: 205 },
      { day: "2026-09-04", rating: 4.8, review_count: 213 },
    ]),
  );
  assert.equal(vm.source, "places");
  assert.deepEqual(
    vm.tiles.map((t) => [t.id, t.metric, t.value]),
    [
      ["rating", "rating", "4.8"],
      ["reviews", "reviews", "213"],
      ["gained", "ratings_gained", "8"],
      ["newest", "newest_review", "1d ago"],
    ],
  );
  assert.equal(tile(vm, "rating").compare, "up from 4.7");
  assert.equal(tile(vm, "reviews").compare, null);
  assert.equal(tile(vm, "gained").compare, "down from 15");
  for (const t of vm.tiles) assert.equal(t.delta, null, `${t.id}: the percentage the house took out`);
  assert.deepEqual(vm.lines, {
    head: "4.8 on Google from 213 reviews; 8 ratings gained in the last 30 days.",
    mix: null,
    weekly: null,
    history: null,
    connect: "Connect your Business Profile to see every review, who answered, and how fast.",
  });
  assert.equal(vm.figures, null, "no count, no mix, no answered share, no weeks from five reviews Google picked");
  assert.equal(vm.stars, null);
  assert.equal(vm.weekly, null);
  assert.deepEqual(vm.waiting, { total: 0, rows: [] });
  assert.deepEqual(vm.latest, vm.google.latest);
  assert.deepEqual(vm.latestTable, vm.google.table, "from the five public reviews, the listing's own table");
  assert.equal(vm.latest.length, 1);
  assert.equal(vm.latest[0].author, "Ben R.");
  const same = vmOf(
    placesOnly([
      { day: "2026-08-05", rating: 4.8, review_count: 213 },
      { day: "2026-09-04", rating: 4.8, review_count: 213 },
    ]),
  );
  assert.equal(tile(same, "rating").compare, "same as the 30 days before");
  assert.equal(same.lines.head, "4.8 on Google from 213 reviews; none gained in the last 30 days.");
  assert.equal(tile(same, "gained").compare, null, "nothing against nothing");
  const down = vmOf(
    placesOnly([
      { day: "2026-08-05", rating: 4.9, review_count: 200 },
      { day: "2026-09-04", rating: 4.8, review_count: 201 },
    ]),
  );
  assert.equal(tile(down, "rating").compare, "down from 4.9");
  assert.equal(down.lines.head, "4.8 on Google from 213 reviews; 1 rating gained in the last 30 days.");
  // a count that fell says so, and is measured against the period before only where that one held a count to measure by
  const fell = vmOf(
    placesOnly([
      { day: "2026-07-06", rating: 4.8, review_count: 190 },
      { day: "2026-08-05", rating: 4.8, review_count: 205 },
      { day: "2026-09-04", rating: 4.8, review_count: 201 },
    ]),
  );
  assert.equal(tile(fell, "gained").value, "-4");
  assert.equal(tile(fell, "gained").compare, "down from 15");
  assert.equal(fell.lines.head, "4.8 on Google from 213 reviews; down 4 ratings in the last 30 days.");
  const fellAgain = vmOf(
    placesOnly([
      { day: "2026-07-06", rating: 4.8, review_count: 210 },
      { day: "2026-08-05", rating: 4.8, review_count: 205 },
      { day: "2026-09-04", rating: 4.8, review_count: 204 },
    ]),
  );
  assert.equal(tile(fellAgain, "gained").value, "-1");
  assert.equal(tile(fellAgain, "gained").compare, null, "the period before fell too: no count to say 'up from' by");
  assert.equal(fellAgain.lines.head, "4.8 on Google from 213 reviews; down 1 rating in the last 30 days.");
  const one = vmOf(placesOnly([{ day: "2026-09-04", rating: 4.8, review_count: 213 }]));
  assert.equal(one.lines.head, "4.8 on Google from 213 reviews; what changed needs a second day of reading.");
  assert.equal(tile(one, "gained").value, "—");
  assert.equal(tile(one, "rating").compare, null, "no day before the period to compare the rating with");
  assert.equal(
    vmOf({ ...placesOnly([]), days: 7 }).lines.head,
    "4.8 on Google from 213 reviews; what changed needs a second day of reading.",
  );
  assert.equal(
    vmOf(
      placesOnly(
        [
          { day: "2026-09-03", rating: null, review_count: 200 },
          { day: "2026-09-04", rating: 4.8, review_count: 213 },
        ],
        {},
      ),
      7,
    ).tiles[0].spark.length,
    1,
    "a day with no rating is no point on the line, not a zero",
  );
});

test("a profile connected but not yet synced is the public five, with the connection's own words beside them", () => {
  const pending = vmOf(
    placesOnly([], {
      connection: googleConnection({ location_name: null, last_synced_at: null }),
    }),
  );
  assert.equal(pending.source, "places");
  assert.equal(pending.lines.connect, null, "already connected: nothing to offer");
  assert.equal(pending.google.connection.words, "Connected as owner@example.com · choose the location to finish");
  assert.equal(pending.google.connection.pending, true);
  const unsynced = vmOf(placesOnly([], { connection: googleConnection({ last_synced_at: null }) }));
  assert.equal(unsynced.source, "places");
  assert.equal(unsynced.google.connection.words, "Connected as owner@example.com · not synced yet");
  assert.equal(unsynced.lines.connect, null);
  const failing = vmOf(
    reviewsDto({ google: reviewsGoogle({ connection: googleConnection({ sync_error: "PERMISSION_DENIED" }) }) }),
  );
  assert.equal(failing.source, "profile", "the stored figures stay while a later sync fails");
  assert.match(failing.google.connection.words, /could not sync since 3h ago/);
});

test("no listing: nothing is drawn but the door, and the head says nothing", () => {
  const dto = reviewsDto({
    google: reviewsGoogle({ listing: null, connection: null, reviews: [], days: [] }),
    ledger: null,
  });
  const vm = vmOf(dto);
  assert.equal(vm.empty, true);
  assert.deepEqual(vm.tiles, []);
  assert.deepEqual(vm.waiting, { total: 0, rows: [] });
  assert.deepEqual(vm.latest, []);
  assert.deepEqual(vm.latestTable, { columns: ["Reviewer", "Stars", "Written", "Words"], rows: [] });
  assert.deepEqual(vm.lines, { head: null, mix: null, weekly: null, history: null, connect: null });
  assert.equal(lensAnswerOf("reviews", { vm: null, campaigns: null, deals: null, reviews: vm }), undefined);
});

test("the head is the sentence the report made: read through the lens's one answer", () => {
  const vm = vmOf(reviewsDto());
  const parts = { vm: null, campaigns: null, deals: null, reviews: null };
  assert.equal(lensAnswerOf("reviews", { ...parts, reviews: vm }), vm.lines.head);
  assert.equal(lensAnswerOf("reviews", parts), undefined, "the read has not landed");
  assert.equal(
    lensAnswerOf("reviews", { ...parts, reviews: vmOf(placesOnly([])) }),
    "4.8 on Google from 213 reviews; what changed needs a second day of reading.",
  );
});

test("the three figures say what they count", () => {
  for (const m of ["reviews_written", "reviews_answered", "review_reply_time"]) {
    const words = metricWordsOf(m);
    assert.ok(words.length > 40 && words.endsWith("."), `${m}: a sentence of words`);
  }
  assert.equal(
    metricWordsOf("reviews_written"),
    "Reviews written in this period, with words or without, by the day Google dates them, from your Business Profile. A review Google later removes stays on record and is still counted.",
  );
  assert.equal(
    metricWordsOf("reviews_answered"),
    "Of the reviews written in this period, how many have a reply on Google, from you or the receptionist. A review with no reply yet is not answered. A reply counts as the receptionist's where the last reply Chanlytics recorded under the review was its own; every other reply is yours, written here or on Google.",
  );
  assert.equal(
    metricWordsOf("review_reply_time"),
    "The middle time from a review being written to its reply, over this period's reviews that have one. A reply you changed later counts from the change. It needs three replies to be said.",
  );
});

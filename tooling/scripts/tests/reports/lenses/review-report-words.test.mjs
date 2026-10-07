/**
 * The Reviews fold's words and shape (contracts reports/review-report.ts): the sentence a gain is said in, the same for the
 * head and the figure; the weeks' line and where the history starts; every sentence the cards make, which the page only
 * draws; what the lens says in each state; a waiting review dated in the workspace's own year and zone; and the properties
 * of the fold: the head's numbers are the figures', the rows' order is not the answer's, and a frozen read folds.
 * EXECUTED over rows (the world's Harbor Studio, Fri Sep 4, 2026, New York): the real functions, no page. The counts
 * are held by review-report.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toReviewsReportVM } from "@chanlytics/contracts";
import {
  REVIEWS_NOW,
  googleConnection,
  googleReview,
  reviewsDto,
  reviewsGoogle,
  reviewsLedger,
  waitingReview,
  writtenReview,
} from "../_report-world.mjs";

const vmOf = (dto, nowMs = REVIEWS_NOW) => toReviewsReportVM(dto, { nowMs });
const tile = (vm, id) => vm.tiles.find((t) => t.id === id);
const at = (day, hour = 14) => `${day}T${String(hour).padStart(2, "0")}:00:00Z`;

/** The five public reviews of a listing no profile is connected to, and the counts Google gave on these days. */
const placesDto = (days, over = {}) =>
  reviewsDto({
    google: reviewsGoogle({
      connection: null,
      reviews: [googleReview("p1", at("2026-09-03"), { origin: "places", author: "Ben R." })],
      days,
    }),
    ledger: null,
    ...over,
  });
const count = (day, review_count) => ({ day, rating: 4.8, review_count });

test("a gain is said once: the head's clause is the figure's, and a second day of reading is said in one place", () => {
  // two readings a day apart: the count is known from Sep 3, so the gain is since then, never "in the last 30 days"
  const young = vmOf(placesDto([count("2026-09-03", 210), count("2026-09-04", 213)]));
  assert.equal(young.lines.head, "4.8 on Google from 213 reviews; 3 ratings gained since Sep 3.");
  assert.deepEqual(
    [tile(young, "gained").value, tile(young, "gained").meta],
    ["3", "since Sep 3, the first day on record"],
  );
  // a period that reaches back past the first reading says the period
  const old = vmOf(placesDto([count("2026-07-01", 190), count("2026-09-03", 210), count("2026-09-04", 213)]));
  assert.equal(old.lines.head, "4.8 on Google from 213 reviews; 23 ratings gained in the last 30 days.");
  assert.deepEqual([tile(old, "gained").value, tile(old, "gained").meta], ["23", "new ratings, words or not"]);
  assert.equal(
    vmOf(placesDto([count("2026-07-01", 213), count("2026-09-04", 213)])).lines.head,
    "4.8 on Google from 213 reviews; none gained in the last 30 days.",
  );
  assert.equal(
    vmOf(placesDto([count("2026-07-01", 212), count("2026-09-04", 213)])).lines.head,
    "4.8 on Google from 213 reviews; 1 rating gained in the last 30 days.",
  );
  // one day: "today", and the day before beside it in words
  const today = vmOf(placesDto([count("2026-09-03", 210), count("2026-09-04", 213)], { days: 1 }));
  assert.equal(today.lines.head, "4.8 on Google from 213 reviews; 3 ratings gained today.");
  assert.equal(tile(today, "gained").label, "Gained in 1 day");
  // a reading that stopped: the count says up to when it was read, not "the last 30 days" it did not see
  const stopped = vmOf(placesDto([count("2026-07-01", 190), count("2026-08-29", 213)]));
  assert.equal(stopped.lines.head, "4.8 on Google from 213 reviews; 23 ratings gained in the 30 days to Aug 29.");
  assert.equal(tile(stopped, "gained").meta, "new ratings to Aug 29, words or not");
  const stoppedDay = vmOf(placesDto([count("2026-08-28", 210), count("2026-08-29", 213)], { days: 1 }));
  assert.equal(stoppedDay.lines.head, "4.8 on Google from 213 reviews; 3 ratings gained on Aug 29.");
  const yesterday = vmOf(placesDto([count("2026-07-01", 190), count("2026-09-03", 213)]));
  assert.equal(
    yesterday.lines.head,
    "4.8 on Google from 213 reviews; 23 ratings gained in the last 30 days.",
    "read yesterday is read: the daily reading has not come round yet today",
  );
  // one reading cannot say what changed; the head, the figure and the card say so in one phrase
  const first = vmOf(placesDto([count("2026-09-04", 213)]));
  assert.equal(first.lines.head, "4.8 on Google from 213 reviews; what changed needs a second day of reading.");
  assert.deepEqual([tile(first, "gained").value, tile(first, "gained").meta], ["—", "needs a second day of reading"]);
  assert.equal(first.lines.gained, "Needs a second day of reading.");
  assert.equal(
    first.lines.gainedEmpty,
    "The count is read once a day; the first difference shows after the second read.",
  );
  assert.equal(first.google.gained.total, null);
  assert.equal(old.lines.gained, null, "days to draw: nothing to explain");
  assert.equal(old.lines.gainedEmpty, null);
});

test("a count that fell is said as a fall, in the figure and in the head, and never as a minus sign", () => {
  const fell = vmOf(placesDto([count("2026-07-06", 190), count("2026-08-05", 205), count("2026-09-04", 201)]));
  assert.deepEqual(
    [tile(fell, "gained").value, tile(fell, "gained").meta, tile(fell, "gained").compare],
    ["down 4", "Google's count fell", "down from 15"],
  );
  assert.equal(fell.lines.head, "4.8 on Google from 213 reviews; down 4 ratings in the last 30 days.");
  const fellAgain = vmOf(placesDto([count("2026-07-06", 210), count("2026-08-05", 205), count("2026-09-04", 204)]));
  assert.equal(tile(fellAgain, "gained").value, "down 1");
  assert.equal(tile(fellAgain, "gained").compare, null, "the period before fell too: no count to say 'up from' by");
  assert.equal(fellAgain.lines.head, "4.8 on Google from 213 reviews; down 1 rating in the last 30 days.");
  const fellSince = vmOf(placesDto([count("2026-09-03", 215), count("2026-09-04", 213)]));
  assert.equal(fellSince.lines.head, "4.8 on Google from 213 reviews; down 2 ratings since Sep 3.");
  assert.equal(tile(fellSince, "gained").meta, "since Sep 3, the first day on record");
  for (const vm of [fell, fellAgain, fellSince])
    assert.ok(!JSON.stringify(vm.tiles).includes('"-'), "no figure of the lens opens with a minus sign");
});

test("the period before is 'the day before' where the period is one day, and its count never reads '1 day before'", () => {
  const rows = [count("2026-09-03", 213), count("2026-09-04", 213)];
  const same = vmOf(placesDto(rows, { days: 1 }));
  assert.equal(tile(same, "rating").compare, "same as the day before");
  const none = vmOf(
    reviewsDto({
      days: 1,
      ledger: reviewsLedger({ written: [writtenReview("t", at("2026-09-04", 10), 5)], waiting: [], waiting_total: 0 }),
    }),
  );
  assert.equal(tile(none, "written").compare, "none the day before");
  const week = vmOf(reviewsDto({ days: 7 }));
  assert.equal(tile(week, "written").compare, "none the 7 days before", "and a longer period is named as it was");
});

test("the weeks' line says how many were written over the days the weeks cover, and is null where they hold none", () => {
  const month = vmOf(reviewsDto());
  assert.equal(month.lines.weekly, "6 written in the last 30 days");
  assert.equal(vmOf(reviewsDto({ days: 7 })).lines.weekly, "2 written in the last 7 days");
  const oneDay = vmOf(
    reviewsDto({
      days: 1,
      ledger: reviewsLedger({ written: [writtenReview("t", at("2026-09-04", 10), 5)], waiting: [], waiting_total: 0 }),
    }),
  );
  assert.equal(oneDay.lines.weekly, "1 written today");
  // the record begins mid-period: the weeks it covers are added up, and the line says from when
  const began = (day) => ({ connection: googleConnection({ connected_at: at(day, 12) }) });
  const partial = { profile: 40, places: 0, complete: false };
  const written = [writtenReview("a", at("2026-09-03"), 5), writtenReview("c", at("2026-08-25"), 5)];
  const covered = vmOf(
    reviewsDto({
      ledger: reviewsLedger({ written, waiting: [], waiting_total: 0, on_record: partial }),
      google: reviewsGoogle(began("2026-08-20")),
    }),
  );
  assert.equal(covered.lines.weekly, "2 written since Aug 24");
  // the weeks the record covers hold none: no chart, and no "0 written" in its place, but where the history starts
  const barren = vmOf(
    reviewsDto({
      ledger: reviewsLedger({
        written: [writtenReview("x", at("2026-08-20"), 5)],
        waiting: [],
        waiting_total: 0,
        on_record: partial,
      }),
      google: reviewsGoogle(began("2026-08-20")),
    }),
  );
  assert.equal(barren.weekly, null);
  assert.equal(barren.lines.weekly, null);
  assert.equal(barren.lines.history, "history on record starts Aug 20");
  assert.equal(barren.lines.historyTitle, "History on record starts Aug 20.");
  // a clipped first week with nothing in it is still a week of the period, drawn as a zero
  const clipped = vmOf(reviewsDto({ days: 7 }));
  assert.deepEqual(
    clipped.weekly.points.map((w) => [w.day, w.written]),
    [
      ["2026-08-29", 0],
      ["2026-08-31", 2],
    ],
  );
});

test("the cards' own sentences are the fold's: who waits, what the latest lists, and what a card says with nothing to draw", () => {
  const vm = vmOf(reviewsDto());
  assert.deepEqual(
    [vm.lines.waiting, vm.lines.waitingEmpty, vm.lines.latestEmpty],
    [null, null, null],
    "rows to draw: no sentence in their place",
  );
  const none = vmOf(reviewsDto({ ledger: reviewsLedger({ waiting: [], waiting_total: 0 }) }));
  assert.equal(none.lines.waitingEmpty, "Nothing is waiting for a reply.");
  assert.equal(none.lines.waiting, null);
  const many = Array.from({ length: 5 }, (_, i) => waitingReview(`w${i}`, at(`2026-05-0${i + 1}`)));
  const capped = vmOf(reviewsDto({ ledger: reviewsLedger({ waiting: many, waiting_total: 6 }) }));
  assert.equal(capped.lines.waiting, "Showing the oldest 5.");
  assert.equal(capped.lines.waitingEmpty, null);
  // every review Google gave is waiting above: the latest has none of its own, and says why
  const onlyWaiting = vmOf(
    reviewsDto({
      google: reviewsGoogle({ reviews: [googleReview("old", "2026-06-01T12:00:00Z")] }),
      ledger: reviewsLedger({ waiting: [waitingReview("old", "2026-06-01T12:00:00Z")], waiting_total: 1 }),
    }),
  );
  assert.deepEqual(onlyWaiting.latest, []);
  assert.equal(onlyWaiting.lines.latestEmpty, "The latest reviews are the ones waiting for a reply, above.");
  // Google gave none at all
  const gave = vmOf(
    reviewsDto({
      google: reviewsGoogle({ reviews: [] }),
      ledger: reviewsLedger({ waiting: [], waiting_total: 0 }),
    }),
  );
  assert.equal(gave.lines.latestEmpty, "Google shows no written reviews for this listing yet.");
  const places = vmOf(placesDto([count("2026-09-04", 213)]));
  assert.equal(places.lines.latestEmpty, null, "one review to list");
  assert.equal(
    vmOf(placesDto([], { google: reviewsGoogle({ connection: null, reviews: [], days: [] }) })).lines.latestEmpty,
    "Google shows no written reviews for this listing yet.",
  );
  assert.deepEqual(
    [places.lines.waiting, places.lines.waitingEmpty],
    [null, null],
    "no card of reviews that wait from the five public ones",
  );
});

test("what the lens says in each state: a listing, no listing to be found, and no way to find one", () => {
  const nothing = { listing: null, connection: null, reviews: [], days: [] };
  const unlinked = vmOf(reviewsDto({ google: reviewsGoogle(nothing), ledger: null, readable: true }));
  assert.deepEqual([unlinked.state, unlinked.empty], ["unlinked", true]);
  assert.equal(unlinked.lines.empty, "Find your business on Google once.");
  assert.equal(unlinked.lines.head, null);
  // the deployment can neither look a listing up nor connect a profile (ready.places and ready.profile both false)
  const unavailable = vmOf(reviewsDto({ google: reviewsGoogle(nothing), ledger: null, readable: false }));
  assert.deepEqual([unavailable.state, unavailable.empty], ["unavailable", true]);
  assert.equal(unavailable.lines.empty, "Google reviews are not available here yet.");
  assert.equal(unavailable.lines.head, null);
  assert.deepEqual(unavailable.tiles, []);
  const linked = vmOf(reviewsDto());
  assert.deepEqual([linked.state, linked.empty, linked.lines.empty], ["linked", false, null]);
  // a listing that is kept is drawn whatever the deployment can do today
  const kept = vmOf(reviewsDto({ readable: false }));
  assert.deepEqual([kept.state, kept.empty], ["linked", false]);
  const places = vmOf(placesDto([count("2026-09-04", 213)]));
  assert.deepEqual([places.state, places.source], ["linked", "places"]);
});

test("a review that waits is dated by the workspace's calendar: its year when it is not this one, its zone, never the runtime's", () => {
  const when = (published, nowMs = REVIEWS_NOW) =>
    vmOf(reviewsDto({ ledger: reviewsLedger({ waiting: [googleReview("w", published)], waiting_total: 1 }) }), nowMs)
      .waiting.rows[0].when;
  assert.equal(when("2024-09-15T12:00:00Z"), "Sep 15, 2024", "two years ago says its year");
  assert.equal(when("2026-06-01T12:00:00Z"), "Jun 1", "this year does not");
  // 03:30Z is 23:30 the evening before in New York: the day the workspace calls it
  assert.equal(when("2026-08-15T03:30:00Z"), "Aug 14");
  // the year turned in the workspace's zone before it did in UTC
  const newYear = Date.parse("2027-01-10T15:00:00Z");
  assert.equal(when("2026-12-31T23:30:00Z", newYear), "Dec 31, 2026");
  assert.equal(when("2027-01-01T04:30:00Z", newYear), "Dec 31, 2026", "00:30 on Jan 1 UTC is still Dec 31 in New York");
  assert.equal(when("2027-01-02T12:00:00Z", newYear), "Jan 2", "this year, in the zone");
  // a review within the week is still said by its age, and one with no date says nothing of when
  assert.equal(when("2026-09-02T12:00:00Z"), "2d ago");
  assert.equal(when("not a date"), "");
  const zoned = reviewsDto({
    timezone: "Pacific/Auckland",
    ledger: reviewsLedger({ timezone: "Pacific/Auckland", waiting: [googleReview("w", "2026-08-14T20:00:00Z")] }),
  });
  assert.equal(vmOf(zoned).waiting.rows[0].when, "Aug 15", "20:00Z is 08:00 the next day in Auckland");
});

/* --------------------------------- the properties of the fold --------------------------------- */

const deepFreeze = (x) => {
  if (x && typeof x === "object" && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) deepFreeze(v);
  }
  return x;
};
/** The reads the properties are held over: a profile with answers, none, none new, a short record, and the five public ones. */
const READS = () => {
  const began = (day) => ({ connection: googleConnection({ connected_at: at(day, 12) }) });
  return [
    ["answered", reviewsDto()],
    ["a week", reviewsDto({ days: 7 })],
    ["one day", reviewsDto({ days: 1 })],
    [
      "none answered",
      reviewsDto({
        ledger: reviewsLedger({
          written: [writtenReview("n1", at("2026-09-03"), 5), writtenReview("n2", at("2026-08-30"), 4)],
          waiting: [],
          waiting_total: 0,
        }),
      }),
    ],
    [
      "none new",
      reviewsDto({
        ledger: reviewsLedger({ written: [writtenReview("g", at("2026-07-20"), 5)], waiting: [], waiting_total: 0 }),
      }),
    ],
    [
      "a short record",
      reviewsDto({
        ledger: reviewsLedger({
          written: [writtenReview("a", at("2026-09-03"), 5), writtenReview("c", at("2026-08-25"), 5)],
          waiting: [],
          waiting_total: 0,
          on_record: { profile: 40, places: 0, complete: false },
        }),
        google: reviewsGoogle(began("2026-08-20")),
      }),
    ],
    ["public five", placesDto([count("2026-07-06", 190), count("2026-08-05", 205), count("2026-09-04", 213)])],
    ["public five, a fall", placesDto([count("2026-08-05", 205), count("2026-09-04", 201)])],
    ["public five, a second day", placesDto([count("2026-09-04", 213)])],
    ["public five, since", placesDto([count("2026-09-03", 210), count("2026-09-04", 213)])],
  ];
};

test("the head's numbers are the figures': what it counts is what the lens draws", () => {
  for (const [name, dto] of READS()) {
    const vm = vmOf(dto);
    const head = vm.lines.head;
    if (vm.source === "profile") {
      const written = tile(vm, "written");
      if (written.value === "—") continue; // a dash is not a number; the head says where the history starts instead
      assert.ok(
        written.value === "0" ? head.includes("none new") : head.includes(`${written.value} new `),
        `${name}: ${head} says the ${written.value} new`,
      );
      const answered = tile(vm, "answered").value; // "3 of 6", or a dash with nothing to answer
      if (answered !== "—") {
        const [n, of] = answered.split(" of ").map(Number);
        const clause = n === of ? "all answered" : n ? `${n} answered` : "none answered yet";
        assert.ok(head.endsWith(`${clause}.`), `${name}: ${head} ends on ${clause}`);
      }
    } else {
      const gained = tile(vm, "gained").value; // "8", "down 4", or a dash
      if (gained === "—") assert.ok(head.endsWith("needs a second day of reading."), name);
      else if (gained.startsWith("down ")) assert.ok(head.includes(`${gained} rating`), `${name}: ${head}`);
      else
        assert.ok(
          gained === "0" ? head.includes("none gained") : head.includes(`${gained} rating`),
          `${name}: ${head}`,
        );
    }
  }
});

/** The rows put in another order: the answer is of the rows, not of how they came. */
const reordered = (dto) => ({
  ...dto,
  google: {
    ...dto.google,
    reviews: [...dto.google.reviews].reverse(),
    days: [...dto.google.days].reverse(),
  },
  ledger: dto.ledger && { ...dto.ledger, written: [...dto.ledger.written].reverse() },
});

test("the rows' order is not part of the answer: the same rows in another order fold to the same view", () => {
  for (const [name, dto] of READS()) {
    assert.deepEqual(vmOf(reordered(dto)), vmOf(dto), name);
  }
  // …and the order the database lists the reviews that wait in is its own: the oldest first, the first five shown
  const many = Array.from({ length: 5 }, (_, i) => waitingReview(`w${i}`, at(`2026-05-0${i + 1}`)));
  const vm = vmOf(reviewsDto({ ledger: reviewsLedger({ waiting: many, waiting_total: 5 }) }));
  assert.deepEqual(
    vm.waiting.rows.map((r) => r.id),
    ["w0", "w1", "w2", "w3", "w4"],
  );
});

test("a read that cannot be written to folds, folds the same twice, and leaves what it was given as it was", () => {
  for (const [name, dto] of READS()) {
    const before = JSON.stringify(dto);
    const frozen = deepFreeze(JSON.parse(before));
    const once = vmOf(frozen);
    assert.deepEqual(vmOf(frozen), once, `${name}: the same rows at the same moment say the same words`);
    assert.deepEqual(once, vmOf(dto), `${name}: a frozen read folds as an open one does`);
    assert.equal(JSON.stringify(dto), before, `${name}: nothing of the read was written to`);
  }
});

test("no state hands out another's lines: each fold makes its own", () => {
  const unlinked = (readable) =>
    vmOf(
      reviewsDto({
        google: reviewsGoogle({ listing: null, connection: null, reviews: [], days: [] }),
        ledger: null,
        readable,
      }),
    );
  const a = unlinked(true);
  const b = unlinked(true);
  assert.notEqual(a.lines, b.lines, "a caller that writes to its lines writes to its own");
  a.lines.head = "changed";
  assert.equal(unlinked(true).lines.head, null);
  assert.notEqual(a.google.gained, b.google.gained);
  assert.notEqual(a.google.gained.points, b.google.gained.points);
  assert.equal(unlinked(false).lines.empty, "Google reviews are not available here yet.");
});

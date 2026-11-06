/**
 * Since you looked (Today in three zones, 2 Nov 2026; contracts todaySince), executed: the one line under the head's
 * sentence, since the member last looked at the bell. What the receptionist answered first, then what was booked, who
 * asked to stop and a new review, in that order whatever the bell's; a run of notes counted by what they are about, as
 * the bell counts them, its line kept short and opening the list that holds them; a review To do offers to answer never
 * said again; nothing from before the member looked; the weekday said once a time is not last night's (the 3 Nov audit,
 * items 3, 5 and 6).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todaySince } from "@chanlytics/contracts";

const TZ = "America/New_York";
/** Tuesday 3 November 2026, 8:05 AM in New York; the member last looked at 9:40 last night. */
const NOW = Date.parse("2026-11-03T13:05:00Z");
const SEEN = "2026-11-03T02:40:00Z";
const ms = (iso) => Date.parse(iso);
const note = (kind, at, over = {}) => ({
  kind,
  at: ms(at),
  title: `${kind} note`,
  message: `${kind} message`,
  ...over,
});
const since = (notes, over = {}) =>
  todaySince({ seenAt: SEEN, answered: null, notes, covered: [], tz: TZ, nowMs: NOW, ...over });

test("in the canvas's order, whatever the bell's: answered, booked, asked to stop, a review; each a few words, then its rows", () => {
  const vm = since(
    [
      note("review", "2026-11-03T12:00:00Z", {
        title: "Dana left 5 stars",
        message: "“Lovely as always.”",
        to: "reports/reviews/r1",
      }),
      note("opted_out", "2026-11-03T03:14:00Z", {
        message: "No more messages go to +1 (646) 555-0188",
        to: "clients/p-1",
      }),
      note("booking", "2026-11-03T11:48:00Z", { message: "Tove Lind, Thu 10:00 AM", to: "calendar/v1" }),
    ],
    {
      answered: {
        count: 6,
        last: { who: "Ana Torres", text: "We open at 9. I can book you in for 10:15.", at: "2026-11-03T04:02:00Z" },
      },
    },
  );
  assert.equal(vm.when, "Since 9:40 PM");
  assert.deepEqual(vm.bits, ["6 answered", "1 booked", "1 asked to stop", "1 review"]);
  assert.deepEqual(
    vm.rows.map((r) => [r.key, r.title, r.sub, r.at, r.to]),
    [
      [
        "answered",
        "The receptionist answered 6",
        "Last, to Ana Torres: “We open at 9. I can book you in for 10:15.”",
        "11:02 PM",
        null,
      ],
      ["booking", "1 booked", "Tove Lind, Thu 10:00 AM", "6:48 AM", "calendar/v1"],
      ["opted_out", "One person asked to stop", "No more messages go to +1 (646) 555-0188", "10:14 PM", "clients/p-1"],
      ["review", "Dana left 5 stars", "“Lovely as always.”", "7:00 AM", "reports/reviews/r1"],
    ],
    "one note opens its own record",
  );
});

test("a run of notes is counted by what it is about, its line kept to three and the rest counted, and it opens the list that holds them", () => {
  // Twelve people asked to stop overnight, two of the notes about the same person.
  const stops = Array.from({ length: 12 }, (_, i) =>
    note("opted_out", `2026-11-03T0${3 + Math.floor(i / 4)}:${String(10 + i).padStart(2, "0")}:00Z`, {
      id: `n-${i}`,
      about: { type: "contact", id: `p-${i === 11 ? 0 : i}` },
      title: `Person ${i === 11 ? 0 : i} asked to stop receiving messages`,
      message: "No more messages go to +1 (646) 555-0100",
    }),
  );
  const [row] = since(stops).rows;
  assert.equal(row.title, "11 people asked to stop", "REGRESSION: the row counted notes where the bell counts people");
  assert.deepEqual(since(stops).bits, ["11 asked to stop"]);
  const lines = row.sub.split(" · ");
  assert.equal(lines.length, 4, `three names and the rest counted: ${row.sub}`);
  assert.equal(lines.at(-1), "and 8 more");
  assert.ok(!row.sub.includes("No more messages go to"), "who asked, never the same sentence twelve times");
  assert.equal(row.to, "clients", "REGRESSION: a run of notes opened nothing");
  // Two bookings: the Calendar.
  const two = since([
    note("booking", "2026-11-03T11:48:00Z", { message: "Tove Lind, Thu 10:00 AM", to: "calendar/v1" }),
    note("booking", "2026-11-03T12:10:00Z", { message: "Ines Mora, Fri 2:00 PM", to: "calendar/v2" }),
  ]);
  assert.deepEqual(
    [two.rows[0].title, two.rows[0].sub, two.rows[0].to],
    ["2 booked", "Ines Mora, Fri 2:00 PM · Tove Lind, Thu 10:00 AM", "calendar"],
  );
});

test("a review To do offers to answer is To do's row, and not said again here; another review, or news of reviews about none, stands", () => {
  const notes = [
    note("review", "2026-11-03T12:00:00Z", {
      id: "n-1",
      about: { type: "review", id: "rv-1" },
      title: "Dana left 5 stars",
    }),
    note("review", "2026-11-03T12:05:00Z", {
      id: "n-2",
      about: { type: "review", id: "rv-2" },
      title: "Lu left 4 stars",
    }),
    note("review", "2026-11-03T12:10:00Z", { id: "n-3", about: null, title: "2 new reviews on Google" }),
  ];
  const vm = since(notes, { covered: [{ id: "rv-1", reviewId: "g-1" }] });
  assert.deepEqual(vm.bits, ["2 reviews"], "REGRESSION: Since you looked said the review To do holds a second time");
  // A review read under Google's own id is the same review.
  assert.deepEqual(since(notes.slice(0, 1), { covered: [{ id: "x", reviewId: "rv-1" }] }), null);
  assert.deepEqual(since(notes.slice(0, 1)).bits, ["1 review"], "with no Google read, nothing is To do's");
});

test("nothing from before the member looked; a member who never looked has no line; a time from before last night says its day", () => {
  assert.equal(since([note("booking", "2026-11-03T02:39:00Z")]), null, "before 9:40 PM: seen");
  assert.equal(since([note("booking", "2026-11-03T02:40:00Z")]), null, "at it: seen");
  assert.equal(since([note("booking", "2026-11-03T11:00:00Z")], { seenAt: null }), null);
  const weekend = since([note("booking", "2026-11-01T15:30:00Z", { message: "Ana Ruiz, Sat 11 AM" })], {
    seenAt: "2026-10-31T22:00:00Z",
  });
  assert.equal(weekend.when, "Since Sat 6:00 PM", "a look days ago says its day");
  assert.equal(weekend.rows[0].at, "Sun 10:30 AM");
});

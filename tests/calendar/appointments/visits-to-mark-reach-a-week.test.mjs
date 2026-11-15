/**
 * The visits to mark reach a week back (the visit sheet's review, 12 Nov 2026, finding 6; Ruben, 15 Nov 2026: "The last 7
 * days"). The one rule the header's line, Today's To do, its Mark all kept and the Calendar sheet's Next all count by
 * (contracts todayVisitsAsked) asked of yesterday's alone: a visit nobody had marked by the next morning was never asked
 * about again, and its record, and a Missed's follow-up while one still goes, waited on a word nobody was asked for.
 *
 * Run on the contracts: the rule over a board that holds the week (yesterday's first, then each day further back, a day
 * the page does not hold passed over, nothing from eight days back), the rows it makes (the day each names, the rest's
 * sentence and door), and Mark all kept's question and what it says follows, which name yesterday's only where they are.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NEED_YOU_WORDS, todayVisitsAsked, withVisitsAsked } from "@chanlytics/contracts";

const H = 3_600_000;
/** Friday 18 September 2026, 4 PM in New York. */
const NOW = Date.parse("2026-09-18T20:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

/** A visit an hour long on `key` at `hour` UTC, for the person `Ana <id>`, on the record's row `r-<id>`, unmarked. */
const blockOn = (key, id, hour, over = {}) => {
  const start = Date.parse(`${key}T00:00:00Z`) + hour * H;
  return {
    id,
    t: hour - 4,
    dur: 60,
    time: `${hour - 16}:00 PM`,
    title: `Colour · Ana ${id}`,
    service: "Colour",
    person: { id: `p-${id}`, name: `Ana ${id}`, via: "phone" },
    start: iso(start),
    end: iso(start + H),
    visit: { id: `r-${id}`, status: "booked" },
    ...over,
  };
};
const frame = (key, blocks = [], over = {}) => ({
  key,
  long: key,
  today: false,
  past: true,
  closed: { yes: false, note: null },
  blocks,
  allDay: [],
  windows: [],
  ...over,
});
/** The board around today: the days given, and today (the 18th) after them. */
const board = (days) => ({
  days: [...days, frame("2026-09-18", [], { today: true, past: false })],
  now: 16,
  feed: { state: "ok" },
  stats: { next: "—" },
});

/** A week held: two of yesterday's, one of Tuesday's, one of a week ago Friday's, and one of eight days back. */
const week = () =>
  board([
    frame("2026-09-10", [blockOn("2026-09-10", "e", 18)]),
    frame("2026-09-11", [blockOn("2026-09-11", "d", 18)]),
    frame("2026-09-12"),
    frame("2026-09-13"),
    frame("2026-09-14"),
    frame("2026-09-15", [
      blockOn("2026-09-15", "c", 19),
      blockOn("2026-09-15", "k", 18, { visit: { id: "r-k", status: "kept" } }),
    ]),
    frame("2026-09-16"),
    frame("2026-09-17", [blockOn("2026-09-17", "b", 20), blockOn("2026-09-17", "a", 18)]),
  ]);

test("the visits to mark are the past week's: yesterday's first, then each day further back, each day in its order, and nothing from eight days back", () => {
  const all = todayVisitsAsked(week(), NOW, "appointment", Number.POSITIVE_INFINITY);
  assert.deepEqual(
    all.items.map((i) => [i.person.name, i.line.day]),
    [
      ["Ana a", "Yesterday"],
      ["Ana b", "Yesterday"],
      ["Ana c", "Tue, Sep 15"],
      ["Ana d", "Fri, Sep 11"],
    ],
    "the day each is on, as a visit line names a day (visitDay): a kept one is not asked, nor one eight days back",
  );
  assert.equal(all.older, true, "one of them is older than yesterday");
  assert.deepEqual(all.markIds, ["r-a", "r-b", "r-c", "r-d"], "Mark all kept says every one of them");

  const named = todayVisitsAsked(week(), NOW, "appointment");
  assert.deepEqual(
    named.items.map((i) => i.markId),
    ["r-a", "r-b", "r-c"],
    "Today names three, as before",
  );
  assert.equal(named.count, 4, "and counts every one of the week's");
  assert.equal(named.to, "calendar/2026-09-11:a-r-d", "the rest's door is the first it does not name, on its own day");
});

test("a day of the week the page does not hold is passed over, and a board without today asks nothing", () => {
  const without = board([frame("2026-09-15", [blockOn("2026-09-15", "c", 19)])]);
  const asked = todayVisitsAsked(without, NOW, "appointment");
  assert.deepEqual(
    asked.items.map((i) => i.markId),
    ["r-c"],
    "yesterday not held: the days it does hold are still asked of",
  );
  assert.equal(
    todayVisitsAsked({ days: week().days.filter((d) => !d.today) }, NOW, "appointment"),
    null,
    "no today on the board: no week to count back from",
  );
});

test("the rows say each one's day, and the rest's sentence says the week where one is older than yesterday", () => {
  const rows = withVisitsAsked([], todayVisitsAsked(week(), NOW, "appointment"));
  assert.deepEqual(
    rows.filter((r) => r.kind === "visit").map((r) => r.when),
    ["Yesterday, 2:00 PM", "Yesterday, 4:00 PM", "Tue, Sep 15, 3:00 PM"],
  );
  const rest = rows.find((r) => r.kind === "visits");
  assert.deepEqual(
    [rest.who, rest.sentence, rest.cta.to],
    ["1 more appointment to mark", "Nobody has said whether they came, this past week.", "calendar/2026-09-11:a-r-d"],
  );
});

test("Mark all kept asks of the past week where one is older, and says only yesterday's are thanked; of yesterday's alone, as it asked", () => {
  const words = NEED_YOU_WORDS.visit.allKept;
  assert.equal(words.ask(4, "appointments", true), "Did all 4 appointments of the past week come?");
  assert.equal(words.ask(2, "appointments", false), "Did all 2 of yesterday's appointments come?");
  assert.equal(
    words.detail(true),
    "Yesterday's are thanked, where a thank-you runs. Older ones are only marked. Any of them can be changed to Missed afterwards, on the Calendar.",
    "a thank-you says 'yesterday', so a Kept said on an older one thanks nobody (decision 0123)",
  );
  assert.equal(
    words.detail(false),
    "Each one marked kept is thanked, where a thank-you runs. Any of them can be changed to Missed afterwards, on the Calendar.",
  );
});

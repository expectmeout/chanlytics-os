/**
 * The People lens's record, EXECUTED: the shape the route answers (contracts reports/people/people-record.ts) -- the
 * database's own answer (people_series, 00394), the guard that tells it from `{ error }`, and the one builder that puts it
 * beside the book as it stands now. The window comes from the database, the book from the pool (people-pool.test.mjs
 * holds the counts); each half stands without the other, since a database with no people_series yet still has a book, and
 * a book that could not be counted leaves the window. The real functions over the world every People test shares.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPeopleSeriesDto, peopleDtoOf } from "@chanlytics/contracts";
import { POOL, QUIET, SERIES, dtoWith, held } from "./_people-world.mjs";

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const HEAD = { timezone: "America/New_York", today: "2026-09-04", days: 30 };

test("the world's facts add up, so a test that reads them can trust them", () => {
  assert.equal(sum(POOL.fresh), POOL.people, "the book's freshness is everyone in it, once");
  assert.equal(
    POOL.fresh.d31_60 + POOL.fresh.d61_90 + POOL.fresh.d91_up,
    POOL.lists.quiet,
    "the last three buckets are the Quiet list",
  );
  assert.equal(sum(POOL.wires), POOL.people, "every person has one way in, or several, or none");
  assert.equal(sum(SERIES.first_came.by_via), SERIES.reached.now.new, "every new person came by one door");
  assert.equal(sum(QUIET.first_came.by_via), QUIET.reached.now.new);
  assert.equal(sum(QUIET.consent.now.yes.by_purpose), QUIET.consent.now.yes.total);
  const dto = dtoWith();
  assert.deepEqual(
    { timezone: dto.timezone, today: dto.today, days: dto.days },
    { timezone: SERIES.timezone, today: SERIES.today, days: SERIES.days },
    "the DTO's window is the series'",
  );
  assert.deepEqual(held(dto), { dto, key: "30d" }, "the surface holds the DTO and the range's one name");
  assert.deepEqual(dtoWith(QUIET).series.reached, QUIET.reached, "a quiet window is read from the same shape");
  assert.equal(dtoWith(QUIET).now, POOL, "and the book stays");
  assert.equal(dtoWith({}, null).now, null, "a book that could not be counted is null");
});

test("isPeopleSeriesDto: the database's answer, and not its own refusal", () => {
  assert.equal(isPeopleSeriesDto(SERIES), true, "the full answer");
  assert.equal(isPeopleSeriesDto({ ...SERIES, end: "2026-09-01" }), true, "a window that ended is the same answer");
  assert.equal(isPeopleSeriesDto({ error: "unknown_tenant" }), false, "an unknown workspace is not a read");
  const noReached = { ...SERIES };
  delete noReached.reached;
  assert.equal(isPeopleSeriesDto(noReached), false, "a body without the people reached");
  assert.equal(isPeopleSeriesDto(null), false);
  assert.equal(isPeopleSeriesDto(undefined), false);
  assert.equal(isPeopleSeriesDto("people_series"), false);
  assert.equal(isPeopleSeriesDto([]), false);
  assert.equal(isPeopleSeriesDto({}), false);
  for (const gone of ["timezone", "today", "days", "reached", "consent"])
    assert.equal(isPeopleSeriesDto({ ...SERIES, [gone]: undefined }), false, `without ${gone}`);
  assert.equal(isPeopleSeriesDto({ ...SERIES, reached: null }), false, "reached must be an object");
  assert.equal(isPeopleSeriesDto({ ...SERIES, consent: "yes" }), false, "consent must be an object");
  assert.equal(isPeopleSeriesDto({ ...SERIES, days: "30" }), false, "days is a number");
});

/** SERIES with the part at `path` taken away (`undefined`) or replaced by `value`: a deep copy, the shared world is never written. */
const seriesWith = (path, value) => {
  const copy = structuredClone(SERIES);
  const parent = path.slice(0, -1).reduce((at, key) => at[key], copy);
  if (value === undefined) delete parent[path.at(-1)];
  else parent[path.at(-1)] = value;
  return copy;
};

test("isPeopleSeriesDto: every part the fold reads as an object must be one, so an answer short of one is not an answer", () => {
  assert.equal(isPeopleSeriesDto(seriesWith(["reached"], SERIES.reached)), true, "the copy is the full answer");
  assert.equal(isPeopleSeriesDto({ ...SERIES, ...QUIET }), true, "a quiet window is the same shape");
  const parts = [
    ["reached", "now"],
    ["reached", "before"],
    ["by_channel"],
    ["by_channel", "now"],
    ["by_channel", "before"],
    ["first_came"],
    ["first_came", "by_via"],
    ["consent", "now"],
    ["consent", "now", "yes"],
    ["consent", "now", "yes", "by_source"],
    ["consent", "now", "yes", "by_purpose"],
    ["consent", "now", "stop"],
    ["consent", "now", "stop", "by_source"],
    ["consent", "now", "stop", "by_purpose"],
    ["consent", "before"],
    ["email_stopped"],
    ["email_stopped", "by_reason"],
    ["steps"],
  ];
  for (const path of parts)
    for (const [what, value] of [
      ["missing", undefined],
      ["null", null],
      ["a number", 3],
      ["a string", "none"],
      ["an array", []],
    ])
      assert.equal(isPeopleSeriesDto(seriesWith(path, value)), false, `${path.join(".")} ${what}`);
});

test("peopleDtoOf: the window is the series' own, and the book is carried as given", () => {
  const dto = peopleDtoOf(SERIES, { now: POOL, head: { timezone: "UTC", today: "2000-01-01", days: 1 } });
  assert.deepEqual(dto, { ...HEAD, series: SERIES, now: POOL }, "the series says the window, not the head");
  assert.equal("end" in dto, false, "a series that carries no end echoes none");
  assert.equal(dto.series, SERIES, "the series stands as it came");
  assert.equal(dto.now, POOL, "and so does the book");

  const ended = peopleDtoOf({ ...SERIES, end: "2026-09-01" }, { now: POOL, head: HEAD });
  assert.equal(ended.end, "2026-09-01", "days a member picked say where they ended");
  assert.equal(ended.today, "2026-09-04", "and the day it is now");
  assert.deepEqual(ended, { ...HEAD, end: "2026-09-01", series: { ...SERIES, end: "2026-09-01" }, now: POOL });
});

test("peopleDtoOf: a database with no people_series yet still has a window to name and a book", () => {
  assert.deepEqual(peopleDtoOf(null, { now: POOL, head: HEAD }), { ...HEAD, series: null, now: POOL });
  const head = { ...HEAD, end: "2026-09-01" };
  assert.deepEqual(
    peopleDtoOf(null, { now: POOL, head }),
    { ...head, series: null, now: POOL },
    "the window the route asked, last day included",
  );
  assert.equal("end" in peopleDtoOf(null, { now: POOL, head: HEAD }), false, "no last day asked, none said");
});

test("peopleDtoOf: a book that could not be counted is null, and the window stands (each half alone)", () => {
  assert.deepEqual(peopleDtoOf(SERIES, { now: null, head: HEAD }), { ...HEAD, series: SERIES, now: null });
  assert.deepEqual(peopleDtoOf(null, { now: null, head: HEAD }), { ...HEAD, series: null, now: null });
});

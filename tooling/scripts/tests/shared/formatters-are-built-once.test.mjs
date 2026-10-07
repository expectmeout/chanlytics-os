/**
 * A date formatter is built once per zone and shape, then kept (contracts shared/time.ts dateFormat). Building one costs
 * far more than using it, and a list built one per row: a Leads row built three for when it was found, 12% of a switch
 * to Leads at 200 rows (5 Oct 2026). Every `new Intl.DateTimeFormat` is counted here as the built package makes it, so
 * a helper that builds one per call again is named, and the words it gives are the words it gave.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tzClock, tzSince } from "@chanlytics/contracts";

const Real = Intl.DateTimeFormat;
let built = 0;
Intl.DateTimeFormat = new Proxy(Real, {
  construct(target, args) {
    built += 1;
    return new target(...args);
  },
});

const NOW = new Date("2026-10-05T18:00:00Z");
const ZONE = "America/Chicago";
const at = (i) => new Date(NOW.getTime() - i * 37 * 60_000).toISOString();

test("the words are a fresh formatter's: today's clock, then yesterday, then the weekday and the date", () => {
  assert.equal(tzClock(at(0), ZONE, NOW), "1:00 PM");
  assert.equal(tzSince(at(0), ZONE, NOW), "1:00 PM");
  assert.equal(tzSince("2026-10-04T15:00:00Z", ZONE, NOW), "yesterday 10:00 AM");
  assert.equal(tzSince("2026-10-01T15:00:00Z", ZONE, NOW), "Thu 10:00 AM");
  assert.equal(tzSince("2026-09-20T15:00:00Z", ZONE, NOW), "Sep 20, 10:00 AM");
});

test("two hundred rows in one zone build no formatter after the first row's", () => {
  tzClock(at(1), ZONE, NOW);
  tzSince(at(1), ZONE, NOW);
  const after = built;
  for (let i = 0; i < 200; i += 1) {
    tzClock(at(i), ZONE, NOW);
    tzSince(at(i), ZONE, NOW);
  }
  assert.equal(built, after, `${built - after} formatters built for 200 rows`);
});

test("a zone Intl cannot use says nothing, as before, and is not kept", () => {
  assert.equal(tzClock(at(0), "Mars/Olympus", NOW), null);
  assert.equal(tzClock(at(0), "Mars/Olympus", NOW), null);
});

test("each zone has its own: Chicago's clock is not Auckland's", () => {
  assert.equal(tzClock(at(0), "Pacific/Auckland", NOW), "7:00 AM");
  assert.equal(tzClock(at(0), ZONE, NOW), "1:00 PM");
});

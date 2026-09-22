/**
 * The filler's calendar, EXECUTED: the feed a filled workspace points its calendar address at. It parses
 * as the calendar reader parses every feed, it holds a working week of fictional appointments relative to
 * the moment it is read, every one names a filler person by the number that links them to their thread,
 * none falls on a Sunday or outside the hours the page shows, and the same day reads the same twice.
 *
 * And the read makes no request: `loadFeed` recognises this address and writes the text from memory, which
 * is the whole point — a serverless function fetching its own public domain failed in production, and the
 * day card goes silent when a feed cannot be read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseIcs, dayInZone } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { fillerCalendar, fillerFeedFor, FILLER_FEED_PATH } = await import(
  at("apps/dashboard/src/server/filler-calendar.ts")
);
const { GET } = await import(at("apps/dashboard/app/api/v1/calendar/filler.ics/route.ts"));
const { loadFeed, forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));

const TZ = "America/New_York";
// 4 PM in New York on Friday 18 September 2026.
const NOW = Date.parse("2026-09-18T20:00:00Z");
const FEED = `https://app.chanlytics.com${FILLER_FEED_PATH}?tz=${encodeURIComponent(TZ)}`;
/** Minutes after local midnight, read back through the zone. */
const wall = (ms) => {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ms));
  return +p.find((x) => x.type === "hour").value * 60 + +p.find((x) => x.type === "minute").value;
};

test("the feed is a calendar the reader parses: a working week, six a day, none on a Sunday, all in hours", () => {
  const text = fillerCalendar(NOW, TZ);
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  const feed = parseIcs(text, TZ);
  assert.equal(feed.items.length, 36, "seven days from a Friday hold one Sunday: six days of six");
  for (const it of feed.items) {
    assert.notEqual(dayInZone(TZ, it.start).weekday, "Sun", `${it.title}: never on a Sunday`);
    const w = wall(it.start);
    assert.ok(w >= 570 && w <= 1020, `${it.title} at ${w} minutes after midnight: inside 9:30 to 6`);
    assert.ok(it.end > it.start, `${it.title}: ends after it starts`);
    assert.match(
      it.description ?? "",
      /\+1 917 555 01\d\d/,
      `${it.title}: names a filler person by their fictional number`,
    );
  }
  assert.equal(feed.items.filter((it) => dayInZone(TZ, it.start).key === "2026-09-18").length, 6, "six today");
});

test("the same day reads the same twice, and another moment is another week", () => {
  assert.equal(
    fillerCalendar(NOW, TZ),
    fillerCalendar(NOW + 60_000, TZ),
    "a minute later is the same day and the same UIDs",
  );
  assert.notEqual(fillerCalendar(NOW, TZ), fillerCalendar(NOW + 8 * 86_400_000, TZ), "a week later is another week");
  const uids = [...fillerCalendar(NOW, TZ).matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length, "every UID is its own");
});

test("only this address is made here, and its zone rides in the query", () => {
  assert.equal(
    fillerFeedFor("https://calendar.google.com/calendar/ical/x/basic.ics"),
    null,
    "every other address is fetched as it always was",
  );
  assert.equal(fillerFeedFor("not a url"), null);
  assert.match(fillerFeedFor(FEED, NOW), /X-WR-TIMEZONE:America\/New_York/);
  assert.match(
    fillerFeedFor(`https://app.chanlytics.com${FILLER_FEED_PATH}?tz=Europe/Madrid`, NOW),
    /X-WR-TIMEZONE:Europe\/Madrid/,
  );
  assert.match(
    fillerFeedFor(`https://app.chanlytics.com${FILLER_FEED_PATH}?tz=Nowhere/Nope`, NOW),
    /X-WR-TIMEZONE:America\/New_York/,
    "a zone it cannot read falls back to the business's",
  );
  assert.match(
    fillerFeedFor(`https://app.chanlytics.com${FILLER_FEED_PATH}`, NOW),
    /X-WR-TIMEZONE:America\/New_York/,
    "and so does no zone at all",
  );
});

test("the read makes no request: a fetch that would throw is never reached", async () => {
  forgetFeeds();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("the filler's calendar must not be fetched");
  };
  try {
    const read = await loadFeed("t-filler", FEED);
    assert.equal(read.reason, null, "no failure, because there was no request");
    assert.match(read.text ?? "", /^BEGIN:VCALENDAR/);
    assert.equal(parseIcs(read.text, TZ).items.length > 0, true, "and the text is the calendar");
    // Every other address still goes through the fetch, which is why this one had to be named.
    const other = await loadFeed("t-other", "https://calendar.google.com/calendar/ical/x/basic.ics");
    assert.equal(other.reason, "unreachable", "an address that is not the filler's is fetched, and this one throws");
  } finally {
    globalThis.fetch = realFetch;
    forgetFeeds();
  }
});

test("the route still serves it, so the address is one a person can paste and preview", async () => {
  const res = await GET(new Request("http://localhost/api/v1/calendar/filler.ics"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^text\/calendar/);
  assert.match(await res.text(), /X-WR-TIMEZONE:America\/New_York/);
  const madrid = await (await GET(new Request("http://localhost/api/v1/calendar/filler.ics?tz=Europe/Madrid"))).text();
  assert.match(madrid, /X-WR-TIMEZONE:Europe\/Madrid/);
});

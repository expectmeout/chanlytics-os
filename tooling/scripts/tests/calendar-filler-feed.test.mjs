/**
 * The filler's calendar, EXECUTED: the feed a filled workspace points its calendar address at. It parses
 * as the calendar reader parses every feed, it holds a working week of fictional appointments relative to
 * the moment it is read, every one names a filler person by the number that links them to their thread,
 * none falls on a Sunday or outside the hours the page shows, and the same day reads the same twice.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseIcs, dayInZone } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { GET, fillerCalendar } = await import(at("apps/dashboard/app/api/v1/calendar/filler.ics/route.ts"));

const TZ = "America/New_York";
// 4 PM in New York on Friday 18 September 2026.
const NOW = Date.parse("2026-09-18T20:00:00Z");
/** Minutes after local midnight, read back through the zone. */
const wall = (ms) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
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
    assert.match(it.description ?? "", /\+1 917 555 01\d\d/, `${it.title}: names a filler person by their fictional number`);
  }
  const today = feed.items.filter((it) => dayInZone(TZ, it.start).key === "2026-09-18");
  assert.equal(today.length, 6, "six today");
});

test("the same day reads the same twice, and another moment is another week", () => {
  assert.equal(fillerCalendar(NOW, TZ), fillerCalendar(NOW + 60_000, TZ), "a minute later is the same day and the same UIDs");
  assert.notEqual(fillerCalendar(NOW, TZ), fillerCalendar(NOW + 8 * 86_400_000, TZ), "a week later is another week");
  const uids = [...fillerCalendar(NOW, TZ).matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
  assert.equal(new Set(uids).size, uids.length, "every UID is its own");
});

test("the route answers as a public calendar and takes a zone it can read, never one it cannot", async () => {
  const res = await GET(new Request("http://localhost/api/v1/calendar/filler.ics"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^text\/calendar/);
  assert.match(await res.text(), /X-WR-TIMEZONE:America\/New_York/);
  const madrid = await (await GET(new Request("http://localhost/api/v1/calendar/filler.ics?tz=Europe/Madrid"))).text();
  assert.match(madrid, /X-WR-TIMEZONE:Europe\/Madrid/);
  const bad = await (await GET(new Request("http://localhost/api/v1/calendar/filler.ics?tz=Nowhere/Nope"))).text();
  assert.match(bad, /X-WR-TIMEZONE:America\/New_York/, "a zone it cannot read falls back to the business's");
});

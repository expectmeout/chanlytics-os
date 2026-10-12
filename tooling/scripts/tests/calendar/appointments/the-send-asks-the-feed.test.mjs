/**
 * What the owner's calendar feed names now, as the edge answers a broadcast's batch (S1-05; apps/edge/lib/calendar/feed-names.ts):
 * the record is only as new as the hourly sweep, so a reminder asks the cached feed too, and a visit cancelled in the owner's
 * calendar alone is held. The question the batch puts to the answer is core-broadcast.test.mjs's, and the rule it asks is
 * feed-appointments.test.mjs's; this proves the edge's half over a feed served by a stub and a database in memory: a workspace
 * with no calendar is none, one with a feed is the keys it names over the span it was read for, a feed that cannot be read throws
 * (a reminder never goes on a guess), a settings row that cannot be read throws too, and the feed is fetched once within its cache.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { feedStillNames } from "@chanlytics/contracts";
import { fakeDb } from "../../_fake-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { feedNamesFor } = await import(at("apps/edge/lib/calendar/feed-names.ts"));
const { forgetFeeds } = await import(at("apps/edge/lib/calendar/availability.ts"));

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TZ = "America/New_York";
const NOW = new Date("2026-09-08T16:00:00.000Z");
const URL_OK = "https://cal.example/harbor.ics";

const realFetch = globalThis.fetch;
let answers = new Map();
let fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  const a = answers.get(String(url));
  if (!a) throw new Error(`no route to ${url}`);
  return new Response(a.body, { status: a.status ?? 200, headers: { "content-type": "text/calendar" } });
};
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  forgetFeeds();
  answers = new Map();
  fetched = [];
});

const feed = (...uids) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...uids.flatMap((uid, i) => [
      "BEGIN:VEVENT",
      `UID:${uid}`,
      "SUMMARY:Ana Ruiz · Balayage",
      `DTSTART;TZID=${TZ}:2026091${i + 1}T140000`,
      `DTEND;TZID=${TZ}:2026091${i + 1}T150000`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ].join("\r\n");

const world = (over = {}) =>
  fakeDb({
    tenant_config: [{ tenant_id: T, config: { calendar: { ical_url: URL_OK } } }],
    tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
    ...over,
  });

test("a workspace with no calendar feed has nothing to ask: none, and nothing fetched", async () => {
  const db = world({ tenant_config: [{ tenant_id: T, config: {} }] });
  assert.equal(await feedNamesFor(db)(T, NOW), null);
  assert.equal(fetched.length, 0);
});

test("a workspace's feed is the keys it names, over the span it was read for; a visit it no longer names is gone, and one outside the span is not", async () => {
  answers.set(URL_OK, { body: feed("kept@cal.example", "also-kept@cal.example") });
  const names = await feedNamesFor(world())(T, NOW);
  assert.deepEqual([...names.keys].sort(), ["also-kept@cal.example", "kept@cal.example"]);
  assert.ok(names.from < NOW.getTime() && names.to > NOW.getTime(), "a season either side of now");

  const tomorrow = new Date("2026-09-09T18:00:00.000Z").toISOString();
  assert.equal(feedStillNames(names, { appointment: "kept@cal.example", visit_start: tomorrow }), true);
  assert.equal(
    feedStillNames(names, { appointment: "cancelled@cal.example", visit_start: tomorrow }),
    false,
    "cancelled in the calendar: the feed does not name it, whatever the record says",
  );
  assert.equal(
    feedStillNames(names, {
      appointment: "cancelled@cal.example",
      visit_start: new Date(names.to + 86_400_000).toISOString(),
    }),
    true,
    "past the span the feed was parsed for: not looked for, so not gone",
  );
});

test("the feed is kept five minutes: a second batch of the same workspace fetches nothing", async () => {
  answers.set(URL_OK, { body: feed("kept@cal.example") });
  const ask = feedNamesFor(world());
  await ask(T, NOW);
  await ask(T, NOW);
  assert.equal(fetched.length, 1, "one fetch within the cache");
});

test("a feed that cannot be read throws, so a reminder for a calendar event waits and is never sent on a guess; so does a settings row that cannot be read", async () => {
  answers.set(URL_OK, { body: "nope", status: 404 });
  await assert.rejects(() => feedNamesFor(world())(T, NOW), /the calendar feed could not be read/);

  // A settings row that cannot be read is not a workspace without a calendar: it throws, it does not answer none.
  const broken = fakeDb(
    { tenant_config: [], tenants: [] },
    { "tenant_config.select": { code: "XX000", message: "connection reset" } },
  );
  await assert.rejects(() => feedNamesFor(broken)(T, NOW), /connection reset/);
});

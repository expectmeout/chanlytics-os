/**
 * The calendar feed, read right -- executed, not pinned.
 *
 * The address rule that guards every fetch (feedUrlOk), the one sentence per
 * way a feed fails (feedProblemWords), the dashboard's loader with a scripted
 * network (a good read, a refusal remembered for a minute, the last good
 * read served and said to be stale, too large, not iCal, a private address
 * never fetched), the preview's refusals in the same words, the board's
 * module over a database in memory (no feed, a failed feed with its reason,
 * a good feed with its items and windows, a read that adds nobody to People
 * whoever makes it, a day capped at what the board draws),
 * the route itself (no address in the answer; no read of it adds anybody),
 * and the save that refuses an address the fetch would refuse.
 */
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  feedBodyProblem,
  FEED_MAX_BYTES,
  feedProblemWords,
  feedUrlOk,
  fetchPublic,
  localToUtcMs,
  offeringHorizon,
  previewHorizon,
  seasonHorizon,
  TenantConfigWriteSchema,
  toCalendarVM,
  windowFor,
  zoneMidnight,
  isConsultationTitle,
  feedMarksOf,
  VISITS_KEPT_MAX,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));
const { loadFeed, forgetFeeds } = await import(at("apps/dashboard/src/server/calendar/openings.ts"));
const { getCalendarWeek } = await import(at("apps/dashboard/src/server/calendar/week/week.ts"));
const { itemsToDays, MAX_ITEMS_PER_DAY } = await import(at("apps/dashboard/src/server/calendar/week/items.ts"));
const { previewFeed } = await import(at("apps/dashboard/src/server/calendar/feed-preview.ts"));
const route = await import(at("apps/dashboard/app/api/v1/calendar/route.ts"));
const visitRoute = await import(at("apps/dashboard/app/api/v1/calendar/visits/[id]/route.ts"));
const keptRoute = await import(at("apps/dashboard/app/api/v1/calendar/visits/kept/route.ts"));

const TZ = "America/New_York";
const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOW = new Date("2026-09-08T16:00:00.000Z"); // Tuesday noon in New York
const ny = (y, m, d, hh, mm = 0) => localToUtcMs(TZ, y, m, d, hh, mm);
const vevent = (lines) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"];
const ics = (...events) => ["BEGIN:VCALENDAR", ...events.flat(), "END:VCALENDAR"].join("\r\n");
const ONE = ics(
  vevent([
    "UID:a1",
    "SUMMARY:Ana Ruiz · Balayage",
    "DESCRIPTION:Ana Ruiz +1 (917) 555-0100",
    "DTSTART;TZID=America/New_York:20260908T140000",
    "DTEND;TZID=America/New_York:20260908T153000",
  ]),
);

const DAY = 86_400_000;

test("three windows, named, and every call site's old arithmetic lands on the same instants", () => {
  const t = NOW.getTime();
  // What the receptionist may offer: yesterday, for a visit already under way,
  // through the last day it is allowed to book into.
  assert.deepEqual(offeringHorizon(NOW, 14), { from: t - DAY, to: t + 15 * DAY });
  // A season either side: six months back (decision 0073, R20: what a calendar brings when it is connected) and
  // ninety days ahead, which is exactly this rule with no offering window.
  assert.deepEqual(seasonHorizon(NOW), { from: t - 180 * DAY, to: t + 90 * DAY });
  // The edge's own horizonFor and the prompt preview's inline copy were this,
  // byte for byte, in two runtimes, with nothing saying they were meant to be.
  assert.deepEqual(seasonHorizon(NOW, 14), { from: t - 180 * DAY, to: t + 90 * DAY });
  assert.deepEqual(
    seasonHorizon(NOW, 200),
    { from: t - 180 * DAY, to: t + 201 * DAY },
    "a workspace booking further out than a season widens the window, or the board and the receptionist disagree about a day it can offer",
  );
  // A month, to prove an address works: the preview answers "is this the right
  // link", and a season of a busy salon is slower and no more convincing.
  assert.deepEqual(previewHorizon(NOW), { from: t - DAY, to: t + 30 * DAY });
});

test("both readers judge a fetched body the same way, against one ceiling", () => {
  assert.equal(feedBodyProblem("BEGIN:VCALENDAR\r\nEND:VCALENDAR"), null);
  assert.equal(feedBodyProblem("<html>not a calendar</html>"), "not_ical");
  // THE CEILINGS DISAGREED. The dashboard refused at FEED_MAX_BYTES while the
  // edge inlined 2 * 1024 * 1024, so a feed between 2,000,000 and 2,097,152
  // bytes was read by one reader and refused by the other — the receptionist
  // and the board differing about a business's own week, with nothing on any
  // page to say why.
  assert.equal(FEED_MAX_BYTES, 2_000_000);
  assert.equal(feedBodyProblem("BEGIN:VCALENDAR" + "x".repeat(2_050_000)), "too_large", "and both refuse it now");
  assert.equal(feedBodyProblem("BEGIN:VCALENDAR" + "x".repeat(FEED_MAX_BYTES)), "too_large");
});

test("midnight is one clock, across both daylight-saving edges", () => {
  // Daylight saving is the arithmetic this product can least afford two of: a
  // second copy does not fail, it disagrees, twice a year, about which hour a
  // day starts. zoneMidnight was a hand-written two-pass guess over a private
  // offset function that recomputed what availability.ts already exported.
  for (const key of ["2026-03-08", "2026-11-01", "2026-09-08", "2026-01-01"]) {
    const [y, m, d] = key.split("-").map(Number);
    assert.equal(zoneMidnight(TZ, key), localToUtcMs(TZ, y, m, d, 0, 0), key);
  }
  // And the instants themselves, so the rewrite cannot quietly shift a day.
  assert.equal(
    zoneMidnight(TZ, "2026-03-08"),
    Date.UTC(2026, 2, 8, 5, 0),
    "the day the clocks go forward still starts at 05:00Z",
  );
  assert.equal(
    zoneMidnight(TZ, "2026-11-01"),
    Date.UTC(2026, 10, 1, 4, 0),
    "the day they go back still starts at 04:00Z",
  );
});

/** A scripted network: a URL answers what the test says (or sends the caller on), and every call is counted. */
const realFetch = globalThis.fetch;
let answers = new Map();
let fetched = [];
globalThis.fetch = async (url) => {
  fetched.push(String(url));
  const a = answers.get(String(url));
  if (!a) throw new Error(`no route to ${url}`);
  if (a instanceof Error) throw a;
  if (a.location) return new Response(null, { status: a.status ?? 302, headers: { location: a.location } });
  return new Response(a.body, { status: a.status ?? 200, headers: { "content-type": "text/calendar" } });
};
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  forgetFeeds();
  answers = new Map();
  fetched = [];
  setRateStore(memoryStore());
});

/** Time, movable: the loader's caches are keyed on Date.now(). */
async function later(ms, fn) {
  const real = Date.now;
  Date.now = () => real() + ms;
  try {
    return await fn();
  } finally {
    Date.now = real;
  }
}

const profile = {
  hours: {
    mon: { open: "09:00", close: "18:00" },
    tue: { open: "09:00", close: "18:00" },
    wed: { open: "09:00", close: "18:00" },
    thu: { open: "09:00", close: "18:00" },
    fri: { open: "09:00", close: "18:00" },
    sat: {},
    sun: {},
  },
  closures: [],
  services: [{ name: "Balayage", duration_min: 90 }],
  booking_rules: { lead_hours: 2, max_days_ahead: 14, slot_min: 30 },
};
const tables = (url, role = "owner") => ({
  memberships: [{ user_id: "u1", tenant_id: T, role, tenants: { slug: "harbor" }, created_at: "2026-01-01T00:00:00Z" }],
  tenants: [{ id: T, slug: "harbor", name: "Harbor", status: "active", timezone: TZ }],
  tenant_config: [
    {
      tenant_id: T,
      config: {
        ...(url ? { calendar: { ical_url: url } } : {}),
        brain: {
          business_name: "Harbor",
          booking_link: "https://book.example/harbor",
          system_prompt: "Answer as the front desk of Harbor: brief, warm, and never a price or a booking.",
          fallbacks: { greeting: "g", error: "e", non_text: "n" },
          profile,
        },
      },
    },
  ],
  policies: [],
});
const ctxFor = (t, rpcs = {}) => ({
  supabase: fakeDb(t, {}, { people_list: () => [], ...rpcs }),
  userId: "u1",
  email: "ada@example.com",
  params: {},
});

test("the address rule: the public internet over https, webcal in a hat, and nothing private, local or of another scheme", () => {
  assert.equal(
    feedUrlOk("https://calendar.google.com/calendar/ical/x/private-abc/basic.ics"),
    "https://calendar.google.com/calendar/ical/x/private-abc/basic.ics",
  );
  assert.equal(feedUrlOk("webcal://p1.example.com/cal.ics"), "https://p1.example.com/cal.ics", "webcal is https");
  assert.equal(feedUrlOk("http://plain.example.com/cal.ics"), "http://plain.example.com/cal.ics");
  for (const bad of [
    "http://localhost/cal.ics",
    "https://127.0.0.1/cal.ics",
    "http://10.0.0.5/x",
    "http://192.168.1.2/x",
    "http://172.16.0.9/x",
    "http://172.31.255.1/x",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/x",
    "http://[::]/x",
    "http://[::ffff:127.0.0.1]/x",
    "http://[::ffff:a9fe:a9fe]/latest/meta-data",
    "http://[fd00::1]/x",
    "http://[fc12:3456::1]/x",
    "http://[fe80::1]/x",
    "http://100.64.0.1/x",
    "http://100.127.255.255/x",
    "https://db.internal/x",
    "https://printer.local/x",
    "ftp://example.com/cal.ics",
    "not a url",
    "",
    null,
    undefined,
  ]) {
    assert.equal(feedUrlOk(bad), null, `${bad} is refused`);
  }
  assert.equal(feedUrlOk("http://172.32.0.1/x"), "http://172.32.0.1/x", "172.32 is not the private range");
  assert.equal(feedUrlOk("http://100.128.0.1/x"), "http://100.128.0.1/x", "past the carriers' shared space");
  assert.equal(feedUrlOk("https://[2606:4700::1111]/x"), "https://[2606:4700::1111]/x", "a public IPv6 address");
});

test('REGRESSION (B1): every hop is judged by the address rule -- a public address that answers "see 10.0.0.5" was read from inside', async () => {
  // fetchPublic itself, over a network of its own: it follows what a calendar does and refuses the rest.
  const net = new Map([
    ["https://cal.example/a.ics", { location: "https://cal.example/b.ics", status: 301 }],
    ["https://cal.example/b.ics", { location: "/c.ics" }],
    ["https://cal.example/c.ics", { body: ONE }],
    ["https://cal.example/in.ics", { location: "http://10.0.0.5/cal.ics" }],
    ["https://cal.example/meta.ics", { location: "http://169.254.169.254/latest/meta-data" }],
    ["https://cal.example/nowhere.ics", { location: "" }],
    ["https://cal.example/garbled.ics", { location: "http://[::1" }],
  ]);
  for (let i = 0; i < 5; i += 1) net.set(`https://cal.example/loop${i}.ics`, { location: `/loop${i + 1}.ics` });
  const asked = [];
  const own = async (url, init) => {
    asked.push([String(url), init.redirect]);
    const a = net.get(String(url));
    if (a.location !== undefined)
      return new Response(null, { status: a.status ?? 302, headers: { location: a.location } });
    return new Response(a.body, { status: 200 });
  };
  const read = await fetchPublic(own, "webcal://cal.example/a.ics", { headers: { accept: "text/calendar" } });
  assert.equal(await read.text(), ONE, "a host's own hops, a relative one among them, are followed");
  assert.deepEqual(asked, [
    ["https://cal.example/a.ics", "manual"],
    ["https://cal.example/b.ics", "manual"],
    ["https://cal.example/c.ics", "manual"],
  ]);
  asked.length = 0;
  assert.equal(await fetchPublic(own, "https://cal.example/in.ics"), null, "into a private network: refused");
  assert.equal(await fetchPublic(own, "https://cal.example/meta.ics"), null, "the cloud's own metadata: refused");
  assert.deepEqual(
    asked.map(([u]) => u),
    ["https://cal.example/in.ics", "https://cal.example/meta.ics"],
    "the private address is never fetched",
  );
  assert.equal(await fetchPublic(own, "https://cal.example/nowhere.ics"), null, "a redirect to nowhere");
  assert.equal(
    await fetchPublic(own, "https://cal.example/garbled.ics"),
    null,
    "or to no address: refused, not thrown",
  );
  asked.length = 0;
  assert.equal(await fetchPublic(own, "https://cal.example/loop0.ics"), null, "longer than a calendar's chain");
  assert.equal(asked.length, 4, "the first ask and three hops, no more");
  assert.equal(await fetchPublic(own, "http://10.1.1.1/cal.ics"), null, "and the first address is judged too");

  // Each reader: the preview refuses in its address words, the loader says "address", and neither fetches inside.
  answers.set("https://cal.example/in.ics", { location: "http://10.0.0.5/cal.ics" });
  await assert.rejects(
    previewFeed("https://cal.example/in.ics", TZ, NOW),
    (e) => e.code === "validation" && e.message === feedProblemWords("address"),
  );
  const loaded = await loadFeed(T, "https://cal.example/in.ics");
  assert.deepEqual([loaded.text, loaded.reason], [null, "address"]);
  assert.ok(!fetched.some((u) => u.includes("10.0.0.5")), "never fetched");
  // A calendar that moved, publicly, still reads.
  answers.set("https://cal.example/moved.ics", { location: "https://cal2.example/moved.ics" });
  answers.set("https://cal2.example/moved.ics", { body: ONE });
  assert.equal((await previewFeed("https://cal.example/moved.ics", TZ, NOW)).events, 1);
});

test("one sentence per way a feed fails, naming what to do", () => {
  assert.equal(
    feedProblemWords("address"),
    "The calendar feed needs to be a full https:// or webcal:// address on the internet.",
  );
  assert.equal(feedProblemWords("unreachable"), "The calendar could not be reached. Check the address and try again.");
  assert.equal(
    feedProblemWords("http", 404),
    "The calendar answered 404. It is usually the private iCal address, not the calendar's web page.",
  );
  assert.equal(
    feedProblemWords("http"),
    "The calendar answered an error. It is usually the private iCal address, not the calendar's web page.",
  );
  assert.equal(feedProblemWords("too_large"), "That feed is too large to read (over 2 MB).");
  assert.match(feedProblemWords("not_ical"), /^That address is not an iCal feed\. In Google Calendar it is Settings/);
  assert.equal(
    feedProblemWords("settings"),
    "Your workspace settings could not be read, so the calendar address could not be found. Save it again in Settings.",
  );
  assert.equal(feedProblemWords(null), null);
  assert.equal(feedProblemWords(undefined), null);
});

test("the loader: a good read, a refusal remembered for a minute, the last good read served and said to be stale, and the ways a feed fails", async () => {
  const url = "https://cal.example/harbor.ics";
  answers.set(url, { body: ONE });
  const good = await loadFeed(T, url);
  assert.equal(good.text, ONE);
  assert.equal(good.reason, null);
  assert.ok(typeof good.at === "number");
  assert.equal(fetched.length, 1);
  await loadFeed(T, url);
  assert.equal(fetched.length, 1, "within the cache, no second fetch");

  // The calendar goes away: the last good read is served, and the reason rides beside it.
  answers.set(url, { body: "gone", status: 404 });
  const stale = await later(6 * 60 * 1000, () => loadFeed(T, url));
  assert.equal(stale.text, ONE, "the last good read");
  assert.equal(stale.at, good.at, "read when it was read");
  assert.deepEqual([stale.reason, stale.status], ["http", 404]);
  assert.equal(fetched.length, 2);
  await later(6 * 60 * 1000 + 30_000, () => loadFeed(T, url));
  assert.equal(fetched.length, 2, "a failure is remembered for a minute: no third fetch thirty seconds later");
  await later(6 * 60 * 1000 + 61_000, () => loadFeed(T, url));
  assert.equal(fetched.length, 3, "and tried again after it");

  forgetFeeds();
  answers.set(url, { body: "x".repeat(2_000_001) });
  assert.deepEqual((await loadFeed(T, url)).reason, "too_large");
  forgetFeeds();
  answers.set(url, { body: "<html>a web page</html>" });
  assert.deepEqual((await loadFeed(T, url)).reason, "not_ical");
  forgetFeeds();
  answers.set(url, new Error("ECONNRESET"));
  const down = await loadFeed(T, url);
  assert.deepEqual([down.text, down.reason], [null, "unreachable"]);

  forgetFeeds();
  const before = fetched.length;
  const priv = await loadFeed(T, "http://169.254.169.254/latest/meta-data");
  assert.deepEqual([priv.text, priv.reason], [null, "address"]);
  assert.equal(fetched.length, before, "a private address is never fetched");
});

test("the preview refuses in the same words: an address, an answer, a web page, a weight; and reads what it can", async () => {
  await assert.rejects(
    previewFeed("http://10.1.1.1/cal.ics", TZ, NOW),
    (e) => e.code === "validation" && e.message === feedProblemWords("address"),
  );
  answers.set("https://cal.example/404.ics", { body: "nope", status: 404 });
  await assert.rejects(
    previewFeed("https://cal.example/404.ics", TZ, NOW),
    (e) => e.code === "upstream_meta" && e.status === 502 && e.message === feedProblemWords("http", 404),
  );
  answers.set("https://cal.example/page.ics", { body: "<html>" });
  await assert.rejects(
    previewFeed("https://cal.example/page.ics", TZ, NOW),
    (e) => e.code === "validation" && e.message === feedProblemWords("not_ical"),
  );
  answers.set("https://cal.example/big.ics", { body: "x".repeat(2_000_001) });
  await assert.rejects(
    previewFeed("https://cal.example/big.ics", TZ, NOW),
    (e) => e.code === "validation" && e.message === feedProblemWords("too_large"),
  );
  answers.set("https://cal.example/down.ics", new Error("timeout"));
  await assert.rejects(
    previewFeed("https://cal.example/down.ics", TZ, NOW),
    (e) => e.code === "upstream_meta" && e.message === feedProblemWords("unreachable"),
  );
  answers.set("https://cal.example/ok.ics", { body: ONE });
  const ok = await previewFeed("webcal://cal.example/ok.ics", TZ, NOW);
  assert.equal(ok.events, 1);
  assert.deepEqual(
    ok.next.map((n) => n.title),
    ["Ana Ruiz · Balayage"],
  );
  assert.match(ok.next[0].start, /Tue, Sep 8, 2:00 PM/);
});

test("settings that will not parse are a calendar that could not be read, never a workspace without one", async () => {
  // The row that actually shipped held ONE extra key, and the strict read refused the whole config and took the
  // address down with it — the board then said "no calendar connected", which is what a workspace that never had
  // one says, and Today's card drew nothing at all. The read leaves an unknown key out now, so that row reads its
  // calendar; a malformed field still refuses the whole config, and is what this reads as settings that failed.
  forgetFeeds();
  answers.set("https://cal.example/ok.ics", { body: ONE });
  const shipped = tables("https://cal.example/ok.ics");
  shipped.tenant_config[0].config.calendar.ical_url_before_filler = "https://cal.example/old.ics";
  const read = await getCalendarWeek(ctxFor(shipped), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(read.feed.state, "ok", "the row that shipped reads its calendar");

  const broken = tables("https://cal.example/ok.ics");
  broken.tenant_config[0].config.brain.booking_link = "not a link";
  const lost = await getCalendarWeek(ctxFor(broken), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.deepEqual(
    [lost.feed.state, lost.feed.present, lost.feed.reason, lost.feed.problem],
    ["unavailable", true, "settings", feedProblemWords("settings")],
  );
  assert.equal(
    toCalendarVM(lost, NOW).feed.problem,
    feedProblemWords("settings"),
    "and the card has a sentence to show, not an empty space",
  );

  // Narrower than "the config did not parse", on purpose: a row refused over something that is not the calendar,
  // in a workspace that never connected one, has lost nothing. It stays silent — no calendar is not a fault.
  const noCalendar = tables(null);
  delete noCalendar.tenant_config[0].config.brain.system_prompt;
  const quiet = await getCalendarWeek(ctxFor(noCalendar), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.deepEqual([quiet.feed.state, quiet.feed.present, quiet.feed.problem], ["none", false, null]);
});

test("the board's module: no feed says none; a failed feed says why; a good feed carries its items and the receptionist's windows", async () => {
  const none = await getCalendarWeek(ctxFor(tables(null)), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.deepEqual([none.feed.state, none.feed.problem, none.days.length], ["none", null, 7]);

  answers.set("https://cal.example/404.ics", { body: "nope", status: 404 });
  const failed = await getCalendarWeek(
    ctxFor(tables("https://cal.example/404.ics")),
    T,
    { from: "2026-09-07", days: 7 },
    NOW,
  );
  assert.deepEqual(
    [failed.feed.state, failed.feed.reason, failed.feed.status, failed.feed.problem],
    ["unavailable", "http", 404, feedProblemWords("http", 404)],
  );
  assert.equal(failed.feed.stale, false);
  const vmFailed = toCalendarVM(failed, NOW);
  assert.equal(vmFailed.feed.problem, feedProblemWords("http", 404), "the page's card reads the sentence");

  forgetFeeds();
  answers.set("https://cal.example/ok.ics", { body: ONE });
  const ok = await getCalendarWeek(
    ctxFor(tables("https://cal.example/ok.ics")),
    T,
    { from: "2026-09-07", days: 7 },
    NOW,
  );
  assert.equal(ok.feed.state, "ok");
  assert.deepEqual([ok.feed.reason, ok.feed.problem, ok.feed.stale, ok.feed.dropped], [null, null, false, 0]);
  const tue = ok.days.find((d) => d.key === "2026-09-08");
  assert.equal(tue.items.length, 1);
  // The id is the appointment's key (appointmentKeyOf), the same block on every read: it carried the event's place in the
  // day, so an event added before it on the next read moved it, and closed the sheet open on it (the Calendar's lane B).
  assert.equal(tue.items[0].id, "a1", "the id: the event's UID, no place in the day");
  assert.equal(tue.items[0].person, null, "nobody in People yet; a viewer's read adds nobody");
  assert.deepEqual(tue.items[0].contacts, { phones: ["+19175550100"], emails: [] });
  assert.ok(tue.windows.length >= 1, "the day has windows the receptionist would offer");
  assert.ok(!JSON.stringify(ok).includes("cal.example"), "the address never leaves the server");
  const vm = toCalendarVM(ok, NOW);
  assert.equal(vm.feed.stale, false);
  assert.match(vm.feed.line, /^From your calendar · read just now · 1 event$/);
});

test("REGRESSION (C1): the board's read carries the receptionist's next open time from now, whatever span it was asked for -- the page worked it out from the loaded weeks", async () => {
  const url = "https://cal.example/next.ics";
  answers.set(url, { body: ONE });
  const t = tables(url);
  const first = {
    start: new Date(ny(2026, 9, 8, 15, 30)).toISOString(),
    end: new Date(ny(2026, 9, 8, 18)).toISOString(),
  };
  const week = await getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.deepEqual(week.next_opening, first, "after Ana's appointment, this afternoon");
  const december = await getCalendarWeek(ctxFor(t), T, { from: "2026-11-30", days: 7 }, NOW);
  assert.ok(
    december.days.every((d) => d.windows.length === 0),
    "December is past what the receptionist offers",
  );
  assert.deepEqual(december.next_opening, first, "REGRESSION: a span with no open times had no next opening");
  assert.equal(toCalendarVM(december, NOW).stats.next, "today 3:30 PM");
  const none = await getCalendarWeek(ctxFor(tables(null)), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(none.next_opening, null, "no calendar: the receptionist names no open time");
  forgetFeeds();
  answers.set(url, { body: "nope", status: 404 });
  const failed = await getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(failed.next_opening, null, "a calendar that can't be read: none either");
});

test("REGRESSION (C2): a fresh read skips the loader's cache once the last try is fifteen seconds old, and says when it tried -- the only way to see a change on the board was to wait out five minutes", async () => {
  const url = "https://cal.example/fresh.ics";
  answers.set(url, { body: ONE });
  const first = await loadFeed(T, url);
  assert.equal(fetched.length, 1);
  assert.equal(typeof first.checkedAt, "number", "when the calendar was last tried, good or not");
  await later(10_000, () => loadFeed(T, url, { fresh: true }));
  assert.equal(fetched.length, 1, "pressed twice in quick succession, the calendar is asked once");
  const again = await later(20_000, () => loadFeed(T, url, { fresh: true }));
  assert.equal(fetched.length, 2, "REGRESSION: past the floor, a fresh read still waited out the cache");
  assert.ok(again.checkedAt > first.checkedAt);
  await later(40_000, () => loadFeed(T, url));
  assert.equal(fetched.length, 2, "an ordinary read keeps the five-minute cache");
});

test("(C2) the board's read and the route can ask for a fresh read, and the answer says when the calendar was last tried", async () => {
  const url = "https://cal.example/route-fresh.ics";
  answers.set(url, { body: ONE });
  const t = tables(url);
  const one = await getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(fetched.length, 1);
  assert.equal(typeof one.feed.checked_at, "string", "when the calendar was last tried");
  await later(20_000, () => getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW));
  assert.equal(fetched.length, 1, "an ordinary read: the cache");
  await later(20_000, () => getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW, { fresh: true }));
  assert.equal(fetched.length, 2, "a fresh one asks the calendar again");
  await later(40_000, () =>
    route.GET.run(
      new Request(`http://localhost/api/v1/calendar?workspace=${T}&from=2026-09-07&days=7&fresh=1`),
      ctxFor(t),
    ),
  );
  assert.equal(fetched.length, 3, "and so does the route's fresh=1");
  const none = await getCalendarWeek(ctxFor(tables(null)), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(none.feed.checked_at, null, "no calendar: never tried");
});

test("the last good read is served when the calendar goes away, and the chip and the card say so", async () => {
  const url = "https://cal.example/ok.ics";
  answers.set(url, { body: ONE });
  const t = tables(url);
  await getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  answers.set(url, { body: "nope", status: 503 });
  const stale = await later(6 * 60 * 1000, () =>
    getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, new Date(NOW.getTime() + 6 * 60 * 1000)),
  );
  assert.equal(stale.feed.state, "ok", "the last good read, not a blank board");
  assert.deepEqual([stale.feed.stale, stale.feed.reason, stale.feed.status], [true, "http", 503]);
  assert.equal(stale.days.find((d) => d.key === "2026-09-08").items.length, 1);
  const vm = toCalendarVM(stale, new Date(NOW.getTime() + 6 * 60 * 1000));
  assert.match(vm.feed.line, /· could not be refreshed (just now|\d+[smh] ago) ·/, vm.feed.line);
  assert.equal(vm.feed.problem, feedProblemWords("http", 503));
  assert.equal(vm.feed.stale, true);
});

test("reading the week adds nobody to People, whoever reads it; the board draws the people it can match and leaves the rest to the sweep and to a press (decision 0047, lane 6)", async () => {
  const url = "https://cal.example/two.ics";
  answers.set(url, {
    body: ics(
      vevent([
        "UID:b1",
        "SUMMARY:Ana Ruiz · Balayage",
        "DESCRIPTION:+1 (917) 555-0100 ana@example.com",
        "DTSTART;TZID=America/New_York:20260908T140000",
        "DTEND;TZID=America/New_York:20260908T153000",
      ]),
      vevent([
        "UID:b2",
        "SUMMARY:Bo Chen · Cut",
        "DESCRIPTION:+1 (917) 555-0101",
        "DTSTART;TZID=America/New_York:20260909T100000",
        "DTEND;TZID=America/New_York:20260909T110000",
      ]),
    ),
  });
  // Every door a read could add a person through is a trap: it is called, the test fails.
  const doors = [];
  const never = (door) => (args) => {
    doors.push([door, args]);
    return { contact_id: "p-made", existed: false };
  };
  const rpcs = {
    people_list: () => [],
    create_person: never("create_person"),
    add_person: never("add_person"),
    set_person_email: never("set_person_email"),
  };
  for (const role of ["owner", "operator", "viewer"]) {
    forgetFeeds();
    const dto = await getCalendarWeek(ctxFor(tables(url, role), rpcs), T, { from: "2026-09-07", days: 7 }, NOW);
    const ana = dto.days.find((d) => d.key === "2026-09-08").items[0];
    const bo = dto.days.find((d) => d.key === "2026-09-09").items[0];
    assert.deepEqual([ana.person, bo.person], [null, null], `${role}: nobody in People, so nobody to link`);
    // What the panel offers a press for: the number the event carried, E.164, and the address beside it.
    assert.deepEqual(ana.contacts, { phones: ["+19175550100"], emails: ["ana@example.com"] }, role);
    assert.equal(ana.guess, "Ana Ruiz", role);
  }
  assert.deepEqual(doors, [], "no role's read made a person, nor gave one an address");

  // The same week with Ana already in People (by the sweep, or by a press): the board links her, and still writes nothing.
  forgetFeeds();
  const known = [
    { id: "p-ana", display_name: "Ana Ruiz", wa_profile_name: null, phone_e164: "+19175550100", email: null },
  ];
  const matched = await getCalendarWeek(
    ctxFor(tables(url, "owner"), { ...rpcs, people_list: () => known }),
    T,
    { from: "2026-09-07", days: 7 },
    NOW,
  );
  assert.deepEqual(
    matched.days.find((d) => d.key === "2026-09-08").items[0].person,
    // With the wire a reply goes out on and the two stops, as their People row says them (contracts replyFactsOf): no
    // thread, no stop. And what the sheet says of them, from the same row (calendar-person-facts.ts): the board reads
    // People once, never again in the browser for this.
    {
      id: "p-ana",
      name: "Ana Ruiz",
      via: "phone",
      reply_wire: null,
      email_stopped: false,
      opted_out: false,
      facts: {
        state: "unheard",
        business: null,
        deal: null,
        step: null,
        last: { at: null, by: "No contact recorded" },
        phone: "+19175550100",
        email: null,
        // When their next visit begins, which the consultation's "nothing since" reads (0008, amended 18 Oct 2026): this
        // afternoon's. Her visits are read with the board's (people-visits.ts getBoardVisits); they were never attached,
        // and both facts were always blank (the audit of 3 Nov 2026).
        next_visit_at: "2026-09-08T18:00:00.000Z",
        // And the record holds no visit of hers before it, this season or earlier: Today's day says "First visit".
        last_visit_at: null,
      },
    },
    "the board links the person People holds",
  );
  assert.deepEqual(doors, [], "and a read that matched made nobody either");
});

test("the board says when each person was last in, from the season's feed and the record before it, and who comes today or tomorrow for a first visit; without the record it says neither (Today's day)", async () => {
  const url = "https://cal.example/last.ics";
  const visit = (uid, who, phone, from, to) =>
    vevent([
      `UID:${uid}`,
      `SUMMARY:${who} · Cut`,
      `DESCRIPTION:${phone}`,
      `DTSTART;TZID=America/New_York:${from}`,
      `DTEND;TZID=America/New_York:${to}`,
    ]);
  answers.set(url, {
    body: ics(
      // Ana was in last Tuesday and comes back this afternoon.
      visit("l1", "Ana Ruiz", "+1 (917) 555-0100", "20260901T100000", "20260901T110000"),
      visit("l2", "Ana Ruiz", "+1 (917) 555-0100", "20260908T140000", "20260908T153000"),
      // Bo has never been in: tomorrow is his first.
      visit("l3", "Bo Chen", "+1 (917) 555-0101", "20260909T100000", "20260909T110000"),
      // Cy and Di were in last winter, before the season the feed is read over: the record holds it, by the person it
      // linked and by the number a booking carried.
      visit("l4", "Cy Park", "+1 (917) 555-0102", "20260908T160000", "20260908T170000"),
      visit("l5", "Di Wong", "+1 (917) 555-0103", "20260909T120000", "20260909T130000"),
    ),
  });
  const person = (id, name, phone) => ({
    id,
    display_name: name,
    wa_profile_name: null,
    phone_e164: phone,
    email: null,
  });
  const people = [
    person("p-ana", "Ana Ruiz", "+19175550100"),
    person("p-bo", "Bo Chen", "+19175550101"),
    person("p-cy", "Cy Park", "+19175550102"),
    person("p-di", "Di Wong", "+19175550103"),
  ];
  const earlier = (id, more) => ({
    id,
    tenant_id: T,
    status: "kept",
    starts_at: "2026-01-10T15:00:00.000Z",
    ends_at: "2026-01-10T16:00:00.000Z",
    contact_id: null,
    client_phone: null,
    client_email: null,
    vanished_at: null,
    ...more,
  });
  const t = tables(url);
  t.appointments = [
    earlier("e1", { source: "calendar_feed", external_id: "old-1", contact_id: "p-cy" }),
    earlier("e2", { source: "booking_email", tool: "booksy", external_id: "bk-old", client_phone: "+19175550103" }),
  ];
  forgetFeeds();
  const week = await getCalendarWeek(ctxFor(t, { people_list: () => people }), T, { from: "2026-09-07", days: 7 }, NOW);
  const factsOf = (name) => week.days.flatMap((d) => d.items).find((it) => it.person?.name === name)?.person.facts;
  const said = (name) => {
    const f = factsOf(name);
    return [f?.next_visit_at, "last_visit_at" in (f ?? {}) ? f.last_visit_at : "unsaid"];
  };
  assert.deepEqual(said("Ana Ruiz"), ["2026-09-08T18:00:00.000Z", "2026-09-01T14:00:00.000Z"], "last in a week ago");
  assert.deepEqual(said("Bo Chen"), ["2026-09-09T14:00:00.000Z", null], "nothing before tomorrow's: a first visit");
  assert.deepEqual(
    said("Cy Park"),
    ["2026-09-08T20:00:00.000Z", "unsaid"],
    "nothing this season, but the record holds one from before it: never 'First visit', and no date the season holds",
  );
  assert.deepEqual(said("Di Wong"), ["2026-09-09T16:00:00.000Z", "unsaid"], "found by the number the booking carried");

  // Without the record, nothing is laid on the rows and nobody is first: the day says neither fact.
  const { getBoardVisits } = await import(at("apps/dashboard/src/server/calendar/people-visits.ts"));
  const rows = [{ ...people[1], visits: undefined }];
  const cal = { timezone: TZ, source: "your calendar", own: new Set(), services: [], rules: null };
  const none = await getBoardVisits(ctxFor(t), T, rows, [], { ...cal, record: null }, NOW);
  assert.deepEqual([none.rows, [...none.firsts]], [rows, []]);
});

test("(0008) the board's read marks each consultation by the rule People's visits are marked by, with the consult-first service its title names", async () => {
  const at = (day, hh) => `DTSTART;TZID=America/New_York:202609${day}T${hh}0000`;
  const until = (day, hh) => `DTEND;TZID=America/New_York:202609${day}T${hh}0000`;
  const feed = ics(
    vevent(["UID:c1", "SUMMARY:Kitchen remodel consult · Ana Ruiz", at("08", 10), until("08", 11)]),
    vevent(["UID:c2", "SUMMARY:Consultation · Tom Baker", at("09", 10), until("09", 11)]),
    // It names a service that needs a consultation first: the booking is the consultation, whatever it says.
    vevent(["UID:c3", "SUMMARY:Kitchen remodel · Ana Ruiz", at("10", 10), until("10", 11)]),
    vevent(["UID:c4", "SUMMARY:Logo design · Eve Park", at("11", 10), until("11", 11)]),
  );
  const services = [
    { name: "Kitchen remodel", duration_min: 60 },
    { name: "Logo design", duration_min: 30 },
  ];
  const rules = { ...profile.booking_rules, consult_first: ["Kitchen remodel"] };
  const t = tables("https://cal.example/consults.ics");
  t.tenant_config[0].config.brain.profile = { ...profile, services, booking_rules: rules };
  answers.set("https://cal.example/consults.ics", { body: feed });
  const week = await getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(week.feed.state, "ok");
  const items = week.days.flatMap((d) => d.items).map((i) => [i.title, i.consultation, i.consult_service]);
  assert.deepEqual(items, [
    ["Kitchen remodel consult · Ana Ruiz", true, "Kitchen remodel"],
    ["Consultation · Tom Baker", true, null],
    ["Kitchen remodel · Ana Ruiz", true, "Kitchen remodel"],
    ["Logo design · Eve Park", false, null],
  ]);
  // One rule, the one withVisits marks People's visits by, over the same services and rules: never a second reading.
  for (const [title, consultation] of items) assert.equal(consultation, isConsultationTitle(title, services, rules));
  // The board's blocks carry both, as the peek reads them.
  const blocks = toCalendarVM(week, NOW)
    .days.flatMap((d) => d.blocks)
    .map((b) => [b.title, b.consultation, b.consultService]);
  assert.deepEqual(blocks, items);
  // A read from before the flags (the tab's cached week) is no consultation, never a throw.
  const older = {
    ...week,
    days: week.days.map((d) => ({ ...d, items: d.items.map(({ consultation: _c, consult_service: _s, ...i }) => i) })),
  };
  assert.ok(
    toCalendarVM(older, NOW)
      .days.flatMap((d) => d.blocks)
      .every((b) => b.consultation === false && b.consultService === null),
  );
});

test("a day carries at most what the board draws; the rest are counted and said", () => {
  const items = [];
  for (let n = 0; n < MAX_ITEMS_PER_DAY + 3; n++)
    items.push({
      start: ny(2026, 9, 8, 9) + n * 60_000,
      end: ny(2026, 9, 8, 9) + n * 60_000 + 30 * 60_000,
      title: `e${n}`,
      allDay: false,
      uid: `u${n}`,
      description: null,
      location: null,
      attendees: [],
    });
  const { days, dropped } = itemsToDays(items, "2026-09-07", 7, TZ, [], new Set(), [], { services: [], rules: null });
  assert.equal(days.find((d) => d.key === "2026-09-08").items.length, MAX_ITEMS_PER_DAY);
  assert.equal(dropped, 3);
  const vm = toCalendarVM(
    {
      timezone: TZ,
      from: "2026-09-07",
      to: "2026-09-13",
      feed: {
        present: true,
        state: "ok",
        read_at: NOW.toISOString(),
        events: 103,
        recurring_expanded: 0,
        skipped_recurring: 0,
        dropped: 3,
      },
      hours: profile.hours,
      closures: [],
      rules: null,
      services: [],
      booking_link: null,
      days: days.map((d) => ({ ...d, windows: [] })),
    },
    NOW,
  );
  assert.ok(vm.feed.line.endsWith("· 103 events"), vm.feed.line);
  assert.equal(
    vm.feed.notes.find((n) => n.id === "undrawn")?.title,
    "3 more events aren't drawn.",
    "what the day left out is said once, by its note",
  );
});

test("the route: the answer carries the feed's state and never its address; whoever reads, it adds nobody to People and says nothing of people made", async (t) => {
  // The clock is pinned to the week the read asks for, as the other route tests pin it.
  t.mock.timers.enable({ apis: ["Date"], now: NOW.getTime() });
  const url = "https://cal.example/route.ics";
  answers.set(url, { body: ONE });
  const made = [];
  const rpcs = {
    people_list: () => [],
    create_person: (a) => {
      made.push(a);
      return { contact_id: "x", existed: false };
    },
  };
  const ask = (role, calendar = url) =>
    route.GET.run(
      new Request(`http://localhost/api/v1/calendar?workspace=${T}&from=2026-09-07&days=7`),
      ctxFor(tables(calendar, role), rpcs),
    );
  const out = await ask("viewer");
  assert.equal(out.calendar.feed.state, "ok");
  assert.equal(out.calendar.days.length, 7);
  assert.ok(!JSON.stringify(out).includes("cal.example"), "the address never reaches the browser");
  for (const role of ["owner", "operator", "viewer"]) {
    forgetFeeds();
    const answer = await ask(role);
    assert.deepEqual(
      Object.keys(answer),
      ["calendar"],
      `${role}: the board, and nothing of people made (people_added is gone)`,
    );
  }
  forgetFeeds();
  assert.deepEqual(Object.keys(await ask("owner", null)), ["calendar"], "no calendar: the same answer");
  assert.deepEqual(made, [], "an owner's read does not add the person the feed names: the sweep and a press do");
});

test("the route: asked for the weeks around today, it answers the board's own window by the business's clock", async (t) => {
  // What the page opens on (9 Oct 2026). It asked by its window's first day, which it could not say until it knew the
  // zone, so the read waited for who is looking and the document's head could not start it. The route knows the zone.
  const ask = (q) =>
    route.GET.run(
      new Request(`http://localhost/api/v1/calendar?workspace=${T}&${q}`),
      ctxFor(tables(null, "viewer"), { people_list: () => [] }),
    );
  t.mock.timers.enable({ apis: ["Date"], now: NOW.getTime() });
  const board = windowFor("2026-09-08");
  const around = (await ask("around=today")).calendar;
  assert.deepEqual([around.from, around.days.length], [board.from, 63], "nine weeks from the Monday before the month");
  assert.equal(around.days[0].key, "2026-08-24");
  // The business's today, not the server's: at two in the morning UTC on the first, New York is still in September.
  t.mock.timers.setTime(Date.parse("2026-10-01T02:00:00.000Z"));
  assert.equal((await ask("around=today")).calendar.from, board.from, "still September's weeks");
  t.mock.timers.setTime(Date.parse("2026-10-01T05:00:00.000Z"));
  assert.equal(
    (await ask("around=today")).calendar.from,
    windowFor("2026-10-01").from,
    "and October's an hour past midnight there",
  );
  // A day named is where the read starts, whatever else is said; with neither, today's week, as it always was.
  const named = (await ask("from=2026-11-30&days=7&around=today")).calendar;
  assert.deepEqual([named.from, named.days.length], ["2026-11-30", 7]);
  t.mock.timers.setTime(NOW.getTime());
  const bare = (await ask("days=7")).calendar;
  assert.deepEqual([bare.from, bare.days.length], ["2026-09-07", 7]);
});

test("the save refuses an address every fetch would refuse, in the same words", () => {
  const bad = TenantConfigWriteSchema.safeParse({ calendar: { ical_url: "http://169.254.169.254/latest/meta-data" } });
  assert.equal(bad.success, false);
  assert.deepEqual(
    bad.error.issues.map((i) => [i.path.join("."), i.message]),
    [["calendar.ical_url", feedProblemWords("address")]],
  );
  assert.equal(
    TenantConfigWriteSchema.safeParse({ calendar: { ical_url: "webcal://cal.example/x.ics" } }).success,
    true,
  );
  assert.equal(
    TenantConfigWriteSchema.safeParse({ calendar: { ical_url: "https://printer.local/x.ics" } }).success,
    false,
  );
});

test("the people are read beside the calendar's feed, not after it: a slow feed no longer holds the board's names back", async () => {
  // Measured on the salon's workspace: the route's median was 244ms, the feed already in the few minutes' cache, so the
  // read it waited on was People's -- begun only once the feed had come back.
  const order = [];
  let open;
  const gate = new Promise((r) => (open = r));
  const scripted = globalThis.fetch;
  globalThis.fetch = async (url) => {
    order.push("feed asked");
    await gate;
    order.push("feed answered");
    return scripted(url);
  };
  answers.set("https://cal.example/slow.ics", { body: ONE });
  try {
    const reading = getCalendarWeek(
      ctxFor(tables("https://cal.example/slow.ics"), {
        people_list: () => {
          order.push("people asked");
          return [];
        },
      }),
      T,
      { from: "2026-09-07", days: 7 },
      NOW,
    );
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
    assert.ok(order.includes("feed asked"), "the feed was asked for");
    assert.ok(
      order.includes("people asked"),
      `REGRESSION: People was not read while the feed was on its way (${order.join(", ")})`,
    );
    open();
    const read = await reading;
    assert.equal(read.feed.state, "ok", "and the board is the one it was");
  } finally {
    open();
    globalThis.fetch = scripted;
  }
});

/* ------------------------------------------- what became of a visit (decision 0002 step 8, 00397) */

/** A member's press, as the route reads it. */
const post = (body) =>
  new Request("http://localhost/api/v1/calendar/visits/x", { method: "POST", body: JSON.stringify(body) });

test("each feed event finds its record's row by its key, with how it stands, while it stands where the row does", () => {
  const T = "2026-09-08T13:00:00.000Z";
  assert.deepEqual(
    [
      ...feedMarksOf([
        { id: "f1", status: "booked", external_id: "k-f1", starts_at: T },
        { id: "f2", status: "missed", external_id: "k-f2", starts_at: T },
        { id: "f3", status: "rescheduled", external_id: "k-f3", starts_at: T },
        { id: "f4", status: "booked", external_id: null, starts_at: T },
      ]),
    ],
    [
      ["k-f1", { id: "f1", status: "booked", start: Date.parse(T) }],
      ["k-f2", { id: "f2", status: "missed", start: Date.parse(T) }],
    ],
    "a status the record does not hold, and a row with no key, are no event's",
  );

  const event = (uid, start, occurrence) => ({
    start,
    end: start + 3_600_000,
    title: "Gloss · Emily",
    allDay: false,
    uid,
    ...(occurrence === undefined ? {} : { occurrence }),
    description: null,
    location: null,
    attendees: [],
  });
  const at9 = ny(2026, 9, 8, 9);
  const { days } = itemsToDays(
    [event("ev-a", at9), event("ev-b", at9 + 3_600_000, 1757000000000), event("ev-c", at9 + 7_200_000)],
    "2026-09-08",
    1,
    TZ,
    [],
    new Set(),
    [],
    {
      services: [],
      rules: null,
      marks: new Map([
        ["ev-a", { id: "f1", status: "missed", start: at9 }],
        ["ev-b:1757000000000", { id: "f2", status: "booked", start: at9 + 3_600_000 }],
        // Moved on the calendar since the sync kept it at nine: until the sync sets the row aside (00397), no word.
        ["ev-d", { id: "f4", status: "missed", start: at9 }],
      ]),
    },
  );
  assert.deepEqual(
    days[0].items.map((it) => it.visit),
    [{ id: "f1", status: "missed" }, { id: "f2", status: "booked" }, null],
    "an occurrence by its own key; an event the sync has not kept has no row to say anything on",
  );
  const { days: moved } = itemsToDays([event("ev-d", at9 + 3 * 3_600_000)], "2026-09-08", 1, TZ, [], new Set(), [], {
    services: [],
    rules: null,
    marks: new Map([["ev-d", { id: "f4", status: "missed", start: at9 }]]),
  });
  assert.equal(moved[0].items[0].visit, null, "a word said of nine o'clock is not said of noon");
});

test("POST calendar/visits/:id: an operator's word reaches the door with what they said; a viewer, a stranger's visit and a word that is not one of the three are refused before it; its refusal is a sentence", async () => {
  const V = "dddddddd-0000-4000-8000-00000000d001";
  const THEIRS = "dddddddd-0000-4000-8000-00000000d002";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const doors = [];
  const world = (role, answer) => {
    const t = {
      ...tables(null, role),
      appointments: [
        { id: V, tenant_id: T, status: "booked" },
        { id: THEIRS, tenant_id: B, status: "booked" },
      ],
      decisions: [],
    };
    return {
      ...ctxFor(t, {
        mark_visit: (a) => {
          doors.push(a);
          return answer;
        },
      }),
      params: { id: V },
    };
  };
  const said = { appointment: { id: V, status: "missed" }, from: "booked", decision_id: "dec-1" };
  const out = await visitRoute.POST.run(post({ status: "missed" }), world("operator", said));
  assert.deepEqual(out, {
    visit: { id: V, status: "missed" },
    from: "booked",
    decision_id: "dec-1",
    unchanged: false,
    // No sequence runs on a missed visit here: nothing follows the word, and the row that asked makes its own offer.
    follows: null,
  });
  assert.deepEqual(doors, [{ p_appointment_id: V, p_status: "missed" }]);

  doors.length = 0;
  await assert.rejects(visitRoute.POST.run(post({ status: "missed" }), world("viewer", said)), (e) => {
    assert.equal(e.status, 403);
    return true;
  });
  await assert.rejects(
    visitRoute.POST.run(post({ status: "missed" }), { ...world("operator", said), params: { id: THEIRS } }),
    (e) => {
      assert.ok([403, 404].includes(e.status), `another workspace's visit: ${e.status}`);
      return true;
    },
  );
  await assert.rejects(visitRoute.POST.run(post({ status: "rescheduled" }), world("operator", said)), (e) => {
    assert.equal(e.code, "validation");
    return true;
  });
  assert.deepEqual(doors, [], "nothing reached the door for a refusal");

  await assert.rejects(
    visitRoute.POST.run(post({ status: "missed" }), world("operator", { error: "not_begun" })),
    (e) => {
      assert.equal(e.code, "validation");
      assert.match(e.message, /hasn't begun yet/);
      return true;
    },
  );
});

test("POST calendar/visits/:id: a Missed says what it sets going (decision 0119): the sequence on a missed visit by name, when its message is due by the business's clock, and whether it waits for an OK; nothing where none runs, the visit is nobody's, it began too long ago, or the word was Kept", async (t) => {
  const V = "dddddddd-0000-4000-8000-00000000d011";
  const S = "eeeeeeee-0000-4000-8000-00000000e011";
  const P = "cccccccc-0000-4000-8000-00000000c011";
  // Tuesday 2:00 PM in New York: ten minutes on is inside the sending hours.
  const at = Date.parse("2026-09-08T18:00:00.000Z");
  t.mock.timers.enable({ apis: ["Date"], now: at });
  const visit = (over = {}) => ({
    id: V,
    tenant_id: T,
    contact_id: P,
    status: "missed",
    starts_at: new Date(at - 3_600_000).toISOString(),
    vanished_at: null,
    title: "Colour",
    service: null,
    all_day: false,
    source: "booking",
    external_id: null,
    ...over,
  });
  const world = ({ appointment = visit(), step = {}, sequence = {}, status = "missed" } = {}) => ({
    ...ctxFor(
      {
        ...tables(null, "operator"),
        appointments: [appointment],
        decisions: [],
        sequences: [{ id: S, tenant_id: T, name: "Missed appointment", state: "on", mode: "auto", ...sequence }],
        sequence_steps: [
          {
            id: S,
            sequence_id: S,
            tenant_id: T,
            trigger: "visit_missed",
            run_hour: 10,
            state: "running",
            words_ok_at: "2026-09-01T00:00:00Z",
            ...step,
          },
        ],
      },
      { mark_visit: () => ({ appointment: { id: V, status }, from: "booked", decision_id: "dec-1" }) },
    ),
    params: { id: V },
  });
  const follows = async (over) => (await visitRoute.POST.run(post({ status: "missed" }), world(over))).follows;

  assert.deepEqual(
    await follows(),
    { name: "Missed appointment", when: "today 2:10 PM", asks: false },
    "ten minutes on, by the business's clock: long enough to take the word back",
  );
  // Its words are new: the message is made then, and waits for its first OK.
  assert.equal((await follows({ step: { words_ok_at: null } })).asks, true);
  assert.equal((await follows({ sequence: { mode: "veto" } })).asks, false, "held for a stop, it still goes");
  // A row that says ask is read as held: one an occasion starts never asks for each (contracts sequenceModeOf).
  assert.equal((await follows({ sequence: { mode: "ask" } })).asks, false);

  // Nothing follows: the sequence is off or its step paused, the visit is nobody's on record, or it began days ago.
  assert.equal(await follows({ sequence: { state: "off" } }), null);
  assert.equal(await follows({ step: { state: "paused" } }), null);
  assert.equal(await follows({ step: { trigger: "visit_soon" } }), null, "another moment's sequence is not this one");
  assert.equal(await follows({ appointment: visit({ contact_id: null }) }), null);
  assert.equal(
    await follows({ appointment: visit({ starts_at: new Date(at - 4 * 86_400_000).toISOString() }) }),
    null,
    "marked days later, a member is tidying the record",
  );
  // Kept says nothing of a missed visit's sequence.
  const kept = await visitRoute.POST.run(post({ status: "kept" }), world({ status: "kept" }));
  assert.equal(kept.follows, null);

  // A Kept is answered where a thank-you waits for it (decision 0123): the sequence on the day after, and when it goes.
  const thanks = { trigger: "visited", last_run_for: "2026-09-08" };
  const keptSays = async (over) =>
    (await visitRoute.POST.run(post({ status: "kept" }), world({ status: "kept", step: thanks, ...over }))).follows;
  const after = { name: "After the appointment" };
  // Said on the visit's own day: tomorrow's look, at the step's hour.
  assert.deepEqual(await keptSays({ sequence: after }), {
    name: "After the appointment",
    when: "tomorrow 10:00 AM",
    asks: false,
  });
  // Yesterday's visit, said after today's look went: now, on its own.
  const yesterday = visit({ status: "kept", starts_at: new Date(at - 24 * 3_600_000).toISOString() });
  assert.equal((await keptSays({ sequence: after, appointment: yesterday })).when, "today 2:00 PM");
  // Before today's look: the look sends it, at its hour or now where that has passed.
  const early = { ...thanks, last_run_for: "2026-09-07" };
  assert.equal((await keptSays({ sequence: after, appointment: yesterday, step: early })).when, "today 2:00 PM");
  // Words that are new, or a sequence that asks: it waits for an OK.
  assert.equal((await keptSays({ sequence: { ...after, mode: "ask" } })).asks, true);
  // Two days on, its words would be a day old: nothing follows.
  const old = visit({ status: "kept", starts_at: new Date(at - 2 * 24 * 3_600_000).toISOString() });
  assert.equal(await keptSays({ sequence: after, appointment: old }), null);

  // Marked at night, the message is the morning's: the run moves a send outside the sending hours to nine.
  t.mock.timers.setTime(Date.parse("2026-09-09T02:30:00.000Z")); // Tuesday 10:30 PM in New York
  assert.equal(
    (await follows({ appointment: visit({ starts_at: "2026-09-08T18:00:00.000Z" }) })).when,
    "tomorrow 9:00 AM",
  );
});

test("the week reads the record: a cancelled booking is drawn struck and keeps the feed's copy of it off the board, and a feed event carries its row's word", async () => {
  forgetFeeds();
  const TWO = ics(
    vevent([
      "UID:a1",
      "SUMMARY:Ana Ruiz · Balayage",
      "DESCRIPTION:Ana Ruiz +1 (917) 555-0100",
      "DTSTART;TZID=America/New_York:20260908T140000",
      "DTEND;TZID=America/New_York:20260908T153000",
    ]),
    vevent([
      "UID:a2",
      "SUMMARY:Bea Lin · Gloss",
      "DTSTART;TZID=America/New_York:20260909T100000",
      "DTEND;TZID=America/New_York:20260909T110000",
    ]),
  );
  answers.set("https://cal.example/two.ics", { body: TWO });
  const t = tables("https://cal.example/two.ics");
  t.appointments = [
    {
      id: "b1",
      tenant_id: T,
      source: "booking_email",
      tool: "booksy",
      external_id: "bk-1",
      status: "cancelled",
      starts_at: "2026-09-08T18:00:00.000Z",
      ends_at: "2026-09-08T19:30:00.000Z",
      all_day: false,
      title: null,
      service: "Balayage",
      staff: null,
      price: null,
      note: null,
      client_name: "Ana Ruiz",
      client_phone: "+19175550100",
      client_email: null,
      contact_id: null,
      vanished_at: null,
    },
    {
      id: "f2",
      tenant_id: T,
      source: "calendar_feed",
      external_id: "a2",
      status: "missed",
      starts_at: "2026-09-09T14:00:00.000Z",
      ends_at: "2026-09-09T15:00:00.000Z",
      vanished_at: null,
    },
  ];
  const week = await getCalendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  const tue = week.days.find((d) => d.key === "2026-09-08").items;
  assert.deepEqual(
    tue.map((it) => [it.id, it.visit]),
    [["appt:b1", { id: "b1", status: "cancelled" }]],
    "REGRESSION: cancelling a booking drew the calendar's copy of it again, as booked",
  );
  const wed = week.days.find((d) => d.key === "2026-09-09").items;
  assert.deepEqual(
    wed.map((it) => it.visit),
    [{ id: "f2", status: "missed" }],
  );
  assert.equal(week.feed.notices.count, 0, "a cancelled visit is none of the visits the notices became");
});

test("POST calendar/visits/kept: each visit named goes through the door one Kept goes through, refusals counted and said, the thank-you that follows said once; a viewer, an empty list, a list past the most and a word that is not an id are refused before it", async (t) => {
  const ids = [1, 2, 3, 4].map((n) => `dddddddd-0000-4000-8000-00000000d1${n}0`);
  const at = Date.parse("2026-09-08T18:00:00.000Z"); // Tuesday 2:00 PM in New York
  t.mock.timers.enable({ apis: ["Date"], now: at });
  const asked = [];
  const yesterday = new Date(at - 24 * 3_600_000).toISOString();
  // The door as 00397 answers: the third was cancelled, the fourth was said kept already.
  const door = (a) => {
    asked.push(a);
    if (a.p_appointment_id === ids[2]) return { error: "cancelled" };
    if (a.p_appointment_id === ids[3])
      return { appointment: { id: ids[3], status: "kept" }, from: "kept", unchanged: true };
    return {
      appointment: { id: a.p_appointment_id, status: "kept" },
      from: "booked",
      decision_id: `dec-${asked.length}`,
    };
  };
  const world = (role = "operator", over = {}) => {
    const t2 = {
      ...tables(null, role),
      appointments: ids.map((id) => ({
        id,
        tenant_id: T,
        contact_id: "cccccccc-0000-4000-8000-00000000c011",
        status: "booked",
        starts_at: yesterday,
        vanished_at: null,
        title: "Colour",
        service: null,
        all_day: false,
        source: "booking",
        external_id: null,
      })),
      decisions: [],
      sequences: [],
      sequence_steps: [],
      ...over,
    };
    return ctxFor(t2, { mark_visit: door });
  };
  const send = (body, role, over) =>
    keptRoute.POST.run(
      new Request("http://localhost/api/v1/calendar/visits/kept", { method: "POST", body: JSON.stringify(body) }),
      world(role, over),
    );

  const out = await send({ ids });
  assert.deepEqual(
    asked.map((a) => [a.p_appointment_id, a.p_status]),
    ids.map((id) => [id, "kept"]),
    "each named, as one press names it",
  );
  assert.deepEqual(out, {
    marked: 2,
    unchanged: 1,
    refused: 1,
    why: "It was cancelled already.",
    follows: null,
  });

  // Where the thank-you runs, the answer says it once: every one is a visit of the same day.
  asked.length = 0;
  const S = "eeeeeeee-0000-4000-8000-00000000e021";
  const thanks = await send({ ids: ids.slice(0, 2) }, "operator", {
    sequences: [{ id: S, tenant_id: T, name: "After the appointment", state: "on", mode: "auto" }],
    sequence_steps: [
      {
        id: S,
        sequence_id: S,
        tenant_id: T,
        trigger: "visited",
        run_hour: 10,
        state: "running",
        words_ok_at: "2026-09-01T00:00:00Z",
        last_run_for: "2026-09-08",
      },
    ],
  });
  assert.equal(thanks.marked, 2);
  assert.deepEqual(thanks.follows, { name: "After the appointment", when: "today 2:00 PM", asks: false });

  // A name twice is said once.
  asked.length = 0;
  await send({ ids: [ids[0], ids[0]] });
  assert.equal(asked.length, 1);

  // Refused before the door: a viewer, nothing named, more than one press marks, a word that is no id, another key.
  asked.length = 0;
  await assert.rejects(send({ ids }, "viewer"), (e) => e.status === 403);
  for (const body of [
    { ids: [] },
    { ids: Array.from({ length: VISITS_KEPT_MAX + 1 }, () => ids[0]) },
    { ids: ["not-an-id"] },
    { ids, status: "missed" },
  ])
    await assert.rejects(send(body), (e) => e.code === "validation", JSON.stringify(body).slice(0, 60));
  assert.deepEqual(asked, [], "nothing reached the door for a refusal");
});

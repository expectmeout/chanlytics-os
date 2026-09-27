/**
 * The calendar feed, read right -- executed, not pinned.
 *
 * The address rule that guards every fetch (feedUrlOk), the one sentence per
 * way a feed fails (feedProblemWords), the dashboard's loader with a scripted
 * network (a good read, a refusal remembered for a minute, the last good
 * read served and said to be stale, too large, not iCal, a private address
 * never fetched), the preview's refusals in the same words, the board's
 * module over a database in memory (no feed, a failed feed with its reason,
 * a good feed with its items and windows, an owner's read adding the people
 * it names and counting a refusal, a day capped at what the board draws),
 * the route itself (no address in the answer; a viewer's read adds nobody),
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
  zoneMidnight,
  isConsultationTitle,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { loadFeed, forgetFeeds } = await import(at("apps/dashboard/src/server/ask/openings.ts"));
const { calendarWeek, previewFeed, itemsToDays, MAX_ITEMS_PER_DAY } = await import(
  at("apps/dashboard/src/server/calendar/calendar.ts")
);
const route = await import(at("apps/dashboard/app/api/v1/calendar/route.ts"));

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
  // A season either side. The board read plus-or-minus ninety days, which is
  // exactly this rule with no offering window.
  assert.deepEqual(seasonHorizon(NOW), { from: t - 90 * DAY, to: t + 90 * DAY });
  // The edge's own horizonFor and the prompt preview's inline copy were this,
  // byte for byte, in two runtimes, with nothing saying they were meant to be.
  assert.deepEqual(seasonHorizon(NOW, 14), { from: t - 90 * DAY, to: t + 90 * DAY });
  assert.deepEqual(
    seasonHorizon(NOW, 200),
    { from: t - 90 * DAY, to: t + 201 * DAY },
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
  // The row that actually shipped. TenantConfigSchema is strict, so ONE extra key refuses the whole config and
  // takes the address down with it — and the board then said "no calendar connected", which is what a workspace
  // that never had one says. Today's card drew nothing at all, so there was no news and nothing to retry.
  const broken = tables("https://cal.example/ok.ics");
  broken.tenant_config[0].config.calendar.ical_url_before_filler = "https://cal.example/old.ics";
  const lost = await calendarWeek(ctxFor(broken), T, { from: "2026-09-07", days: 7 }, NOW);
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
  const quiet = await calendarWeek(ctxFor(noCalendar), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.deepEqual([quiet.feed.state, quiet.feed.present, quiet.feed.problem], ["none", false, null]);
});

test("the board's module: no feed says none; a failed feed says why; a good feed carries its items and the receptionist's windows", async () => {
  const none = await calendarWeek(ctxFor(tables(null)), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.deepEqual([none.feed.state, none.feed.problem, none.days.length], ["none", null, 7]);

  answers.set("https://cal.example/404.ics", { body: "nope", status: 404 });
  const failed = await calendarWeek(
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
  const ok = await calendarWeek(ctxFor(tables("https://cal.example/ok.ics")), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(ok.feed.state, "ok");
  assert.deepEqual([ok.feed.reason, ok.feed.problem, ok.feed.stale, ok.feed.dropped], [null, null, false, 0]);
  const tue = ok.days.find((d) => d.key === "2026-09-08");
  assert.equal(tue.items.length, 1);
  assert.equal(tue.items[0].id, `a1:${ny(2026, 9, 8, 14)}:0`, "the id: the uid, the instant, the place in the day");
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
  const week = await calendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.deepEqual(week.next_opening, first, "after Ana's appointment, this afternoon");
  const december = await calendarWeek(ctxFor(t), T, { from: "2026-11-30", days: 7 }, NOW);
  assert.ok(
    december.days.every((d) => d.windows.length === 0),
    "December is past what the receptionist offers",
  );
  assert.deepEqual(december.next_opening, first, "REGRESSION: a span with no open times had no next opening");
  assert.equal(toCalendarVM(december, NOW).stats.next, "today 3:30 PM");
  const none = await calendarWeek(ctxFor(tables(null)), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(none.next_opening, null, "no calendar: the receptionist names no open time");
  forgetFeeds();
  answers.set(url, { body: "nope", status: 404 });
  const failed = await calendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
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
  const one = await calendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(fetched.length, 1);
  assert.equal(typeof one.feed.checked_at, "string", "when the calendar was last tried");
  await later(20_000, () => calendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW));
  assert.equal(fetched.length, 1, "an ordinary read: the cache");
  await later(20_000, () => calendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW, { fresh: true }));
  assert.equal(fetched.length, 2, "a fresh one asks the calendar again");
  await later(40_000, () =>
    route.GET.run(
      new Request(`http://localhost/api/v1/calendar?workspace=${T}&from=2026-09-07&days=7&fresh=1`),
      ctxFor(t),
    ),
  );
  assert.equal(fetched.length, 3, "and so does the route's fresh=1");
  const none = await calendarWeek(ctxFor(tables(null)), T, { from: "2026-09-07", days: 7 }, NOW);
  assert.equal(none.feed.checked_at, null, "no calendar: never tried");
});

test("the last good read is served when the calendar goes away, and the chip and the card say so", async () => {
  const url = "https://cal.example/ok.ics";
  answers.set(url, { body: ONE });
  const t = tables(url);
  await calendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
  answers.set(url, { body: "nope", status: 503 });
  const stale = await later(6 * 60 * 1000, () =>
    calendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, new Date(NOW.getTime() + 6 * 60 * 1000)),
  );
  assert.equal(stale.feed.state, "ok", "the last good read, not a blank board");
  assert.deepEqual([stale.feed.stale, stale.feed.reason, stale.feed.status], [true, "http", 503]);
  assert.equal(stale.days.find((d) => d.key === "2026-09-08").items.length, 1);
  const vm = toCalendarVM(stale, new Date(NOW.getTime() + 6 * 60 * 1000));
  assert.match(vm.feed.line, /· could not be refreshed (just now|\d+[smh] ago) ·/, vm.feed.line);
  assert.equal(vm.feed.problem, feedProblemWords("http", 503));
  assert.equal(vm.feed.stale, true);
});

test("an owner's read puts the people the feed names in People through the door; one refused number costs one person; a viewer's read adds nobody", async () => {
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
  const made = [];
  const emailed = [];
  const rpcs = {
    people_list: () => [],
    create_person: (args) => {
      made.push(args);
      if (args.p_phone_e164 === "+19175550101") {
        const e = new Error("bad number");
        e.code = "22023";
        throw e;
      }
      return { contact_id: "p-ana", existed: false };
    },
    set_person_email: (a) => {
      emailed.push(a);
      return { contact_id: a.p_contact_id, email: a.p_email };
    },
  };
  const ctx = ctxFor(tables(url), rpcs);
  const dto = await calendarWeek(ctx, T, { from: "2026-09-07", days: 7 }, NOW, { canAct: true });
  assert.equal(made.length, 2, "both numbers offered to the door");
  assert.deepEqual(made[0], {
    p_tenant_id: T,
    p_phone_e164: "+19175550100",
    p_display_name: "Ana Ruiz",
    p_source: "calendar",
    p_title: "Ana Ruiz · Balayage",
  });
  const ana = dto.days.find((d) => d.key === "2026-09-08").items[0];
  assert.deepEqual(
    ana.person,
    { id: "p-ana", name: "Ana Ruiz", via: "phone" },
    "the board links the person it just made",
  );
  const bo = dto.days.find((d) => d.key === "2026-09-09").items[0];
  assert.equal(bo.person, null, "the refused number is one person, not the board");
  assert.deepEqual(
    emailed,
    [{ p_contact_id: "p-ana", p_email: "ana@example.com" }],
    "the appointment's one address goes through the door to the person just made from its number; one the door refused gets none",
  );

  forgetFeeds();
  const quiet = [];
  const viewer = ctxFor(tables(url, "viewer"), {
    people_list: () => [],
    create_person: (a) => {
      quiet.push(a);
      return { contact_id: "x", existed: false };
    },
  });
  await calendarWeek(viewer, T, { from: "2026-09-07", days: 7 }, NOW, { canAct: false });
  assert.equal(quiet.length, 0, "a viewer's read changes nothing");
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
  const week = await calendarWeek(ctxFor(t), T, { from: "2026-09-07", days: 7 }, NOW);
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

test("the route: the answer carries the feed's state and never its address; a viewer's read adds nobody", async () => {
  const url = "https://cal.example/route.ics";
  answers.set(url, { body: ONE });
  const made = [];
  const ctx = ctxFor(tables(url, "viewer"), {
    people_list: () => [],
    create_person: (a) => {
      made.push(a);
      return { contact_id: "x", existed: false };
    },
  });
  const out = await route.GET.run(
    new Request(`http://localhost/api/v1/calendar?workspace=${T}&from=2026-09-07&days=7`),
    ctx,
  );
  assert.equal(out.calendar.feed.state, "ok");
  assert.equal(out.calendar.days.length, 7);
  assert.ok(!JSON.stringify(out).includes("cal.example"), "the address never reaches the browser");
  assert.equal(made.length, 0);
  forgetFeeds();
  const owner = ctxFor(tables(url, "owner"), {
    people_list: () => [],
    create_person: (a) => {
      made.push(a);
      return { contact_id: "p1", existed: false };
    },
  });
  await route.GET.run(new Request(`http://localhost/api/v1/calendar?workspace=${T}&from=2026-09-07&days=7`), owner);
  assert.equal(made.length, 1, "an owner's read adds the person the feed names");
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

/**
 * Read-only availability: the receptionist sees the calendar, follows the
 * booking rules, and only ever sends the link.
 *
 * The feed is what any booking tool writes into Google, Apple or Outlook —
 * Booksy Biz syncs two-way with both — read back by its private address.
 * Pure engine, so the fixtures here are the proof: line folding, zones,
 * all-day and cancelled events, the opening hours minus what is taken, the
 * buffer, the lead time, closures, the words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIcs, freeWindows, describeOpenings, localToUtcMs, dayInZone,
  composeSystemPrompt, parseTenantConfigResult, TenantConfigWriteSchema,
} from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const TZ = "America/New_York";
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:1",
  "DTSTART;TZID=America/New_York:20260909T110000",
  "DTEND;TZID=America/New_York:20260909T130000",
  "SUMMARY:Balayage — Dani",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:2",
  "DTSTART:20260909T190000Z",
  "DTEND:20260909T200000Z",
  "SUMMARY:Colour cor",
  " rection (folded)",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:3",
  "DTSTART;VALUE=DATE:20260910",
  "DTEND;VALUE=DATE:20260911",
  "SUMMARY:Training day",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:4",
  "DTSTART;TZID=America/New_York:20260909T150000",
  "DTEND;TZID=America/New_York:20260909T160000",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:5",
  "DTSTART;TZID=America/New_York:20260911T100000",
  "DTEND;TZID=America/New_York:20260911T110000",
  "RRULE:FREQ=WEEKLY",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:6",
  "DTSTART;TZID=America/New_York:20260909T093000",
  "DURATION:PT30M",
  "TRANSP:TRANSPARENT",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("the feed: zones, folding, all-day, cancelled and free events, recurring counted", () => {
  const feed = parseIcs(ICS, TZ);
  assert.equal(feed.events, 6);
  assert.equal(feed.recurringExpanded, 1, "the weekly event is expanded inside the horizon");
  assert.equal(feed.skippedRecurring, 0);
  assert.ok(feed.busy.length >= 4, "two appointments, the training day, and the weekly occurrences; not the cancelled one, not the free one");
  const ny = (h, m = 0) => localToUtcMs(TZ, 2026, 9, 9, h, m);
  assert.deepEqual(feed.busy[0], { start: ny(11), end: ny(13) }, "a TZID time is that zone's wall clock");
  assert.deepEqual(feed.busy[1], { start: ny(15), end: ny(16) }, "19:00Z is 3 PM in New York in September");
  assert.deepEqual(feed.busy[2], { start: localToUtcMs(TZ, 2026, 9, 10, 0, 0), end: localToUtcMs(TZ, 2026, 9, 11, 0, 0) }, "an all-day event takes the whole local day");
});

const hours = { wed: { open: "09:30", close: "18:00" }, thu: { open: "09:30", close: "18:00" }, fri: { open: "09:30", close: "19:00" }, sun: {} };

test("open windows: the hours minus what is taken, widened by the buffer, never before now plus the lead", () => {
  // Wednesday 9 September 2026, 8:00 AM New York.
  const now = new Date(localToUtcMs(TZ, 2026, 9, 9, 8, 0));
  const feed = parseIcs(ICS, TZ);
  const out = freeWindows({ hours, closures: [], tz: TZ, busy: feed.busy, rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 3, slot_min: 30 }, now });
  assert.deepEqual(out.map((o) => o.key), ["2026-09-09", "2026-09-11"], "Thursday is the all-day training day; Friday is open");
  const wed = out[0].windows.map((w) => describe(w));
  // 9:30 opens, but now + 2 h = 10:00; the balayage 11–13 is widened to 10:45–13:15; 15:00–16:00 becomes 14:45–16:15.
  assert.deepEqual(wed, ["10:00 AM – 10:45 AM", "1:15 PM – 2:45 PM", "4:15 PM – 6:00 PM"]);
  assert.equal(out[0].label, "Wednesday, September 9");
  function describe(w) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
    return `${f.format(new Date(w.start))} – ${f.format(new Date(w.end))}`;
  }
});

test("a closure removes the day; a window shorter than a slot is not offered; no zone guess", () => {
  const now = new Date(localToUtcMs(TZ, 2026, 9, 9, 8, 0));
  const closed = freeWindows({ hours, closures: [{ date: "2026-09-09" }], tz: TZ, busy: [], rules: { max_days_ahead: 1 }, now });
  assert.deepEqual(closed, []);
  const tight = freeWindows({ hours: { wed: { open: "09:30", close: "10:15" } }, tz: TZ, busy: [], rules: { lead_hours: 0, slot_min: 60, max_days_ahead: 1 }, now });
  assert.deepEqual(tight, [], "45 minutes is not a 60-minute slot");
  assert.equal(dayInZone(TZ, now.getTime()).weekday, "wed", "9 September 2026 is a Wednesday");
});

test("the words: a few days, the windows on each, and the rule that the calendar decides", () => {
  const now = new Date(localToUtcMs(TZ, 2026, 9, 9, 8, 0));
  const out = freeWindows({ hours, closures: [], tz: TZ, busy: parseIcs(ICS, TZ).busy, rules: { lead_hours: 2, max_days_ahead: 3 }, now });
  const text = describeOpenings(out, TZ);
  assert.match(text, /^Open times \(from the calendar, checked just now/);
  assert.match(text, /- Wednesday, September 9: 10:00 AM – 11:00 AM, 1:00 PM – 3:00 PM, 4:00 PM – 6:00 PM/);
  assert.match(text, /Never confirm a slot yourself; the calendar decides\./);
  assert.match(describeOpenings([], TZ, { daysAhead: 14 }), /nothing is open in the next 14 days/);
});

/* --------------------------------- config, composer, runtime, settings -- */

const brain = {
  business_name: "Melany's Beauty Salon", phone_display: "(646) 932-5775", booking_link: "https://booksy.com/x",
  system_prompt: "x".repeat(50), fallbacks: { greeting: "g", error: "e", non_text: "n" },
};

test("booking rules and the calendar feed are config the schemas accept, and the composer states the rules", () => {
  const cfg = { brain: { ...brain, profile: { hours, booking_rules: { lead_hours: 2, buffer_min: 15, consult_first: ["Color correction"], party_max: 4, notes: ["No chemical services after 4 PM"] } } }, calendar: { ical_url: "webcal://calendar.google.com/calendar/ical/x/private-y/basic.ics" } };
  assert.equal(parseTenantConfigResult(cfg).ok, true);
  assert.equal(TenantConfigWriteSchema.safeParse(cfg).success, true);
  assert.equal(parseTenantConfigResult({ ...cfg, calendar: { ical_url: "not a url" } }).ok, false, "a feed address must be https or webcal");
  const text = composeSystemPrompt(brain, cfg.brain.profile, "whatsapp");
  assert.ok(text.includes("Booking rules:\n- At least 2 hours' notice for any appointment."));
  assert.ok(text.includes("These need a consultation before they can be booked: Color correction."));
  assert.ok(text.includes("Up to 4 people per booking; larger groups go to a person."));
  assert.ok(text.includes("No chemical services after 4 PM"));
  assert.ok(text.includes("If open times are listed after these instructions, offer up to three that fit"), "both channels are told how to use the openings");
  assert.ok(text.indexOf("If open times are listed") < text.indexOf("Rules you must follow"), "and the guardrails still come last");
  assert.ok(composeSystemPrompt(brain, { hours }, "voice").includes("If none are listed, do not guess at open times; send the link."));
});

test("the edge reads the feed once per five minutes and tells both receptionists, after the clock", () => {
  const lib = readRaw("apps/edge/lib/availability.ts"); // raw: a regex with // in it is not a comment
  assert.ok(lib.includes("const CACHE_MS = 5 * 60 * 1000;"));
  assert.ok(lib.includes("AbortSignal.timeout(FETCH_TIMEOUT_MS)"));
  assert.ok(lib.includes('u.replace(/^webcal:\\/\\//i, "https://")'));
  assert.ok(lib.includes("feeds.set(tenantId, { text, at: Date.now() });"), "a failure is cached briefly too");
  const rt = readCode("apps/edge/lib/tenant-runtime.ts");
  assert.ok(rt.includes("calendar: parsed?.calendar ?? null,"));
  const wa = readCode("apps/edge/api/whatsapp.ts");
  assert.ok(wa.includes("const openings = rt ? await openingsFor(rt) : null;"));
  assert.ok(wa.includes('${openings ? `\\n\\n${openings}` : ""}'), "after describeNow, in the uncached block");
  const inbound = readCode("apps/edge/api/retell-inbound.ts");
  assert.ok(inbound.includes("const openings = await openingsFor(rt);"));
  assert.ok(inbound.includes("business_facts: facts || FACTS_UNAVAILABLE"), "the voice-parity rule still holds");
});

test("Settings collects the rules and the feed; the feed address is whole only for an owner", () => {
  const pane = readRaw("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(pane.includes('put("booking_rules", Object.keys(rules).length ? rules : undefined);'));
  assert.ok(pane.includes("...(feed ? { calendar: { ical_url: feed } } : { calendar: undefined }),"));
  assert.ok(pane.includes('title="Calendar it may look at"') && pane.includes('title="Booking rules"'));
  assert.ok(pane.includes("Nothing is booked from here; the booking link does that, whichever tool is behind it."));
  const route = readCode("apps/dashboard/app/api/v1/settings/route.ts");
  assert.ok(route.includes('member.role === "owner" || !cfg.calendar'));
  assert.ok(route.includes("maskFeedUrl(cfg.calendar.ical_url)"));
});

/**
 * Calendar — the owner's calendar as the receptionist reads it.
 *
 * The feed's items with their titles (single, repeating, all-day; cancelled
 * dropped), the week as the page draws it (bands for closed time, blocks for
 * taken time, dashed windows for what the receptionist would offer), the
 * words, the doors, and the registry flip.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readAgoLabel, clockLabel, isDayKey, mondayOf, parseIcs, rulesLine, shiftKey, toCalendarVM, zoneMidnight,
} from "@chanlytics/contracts";
import { readCode } from "./_source.mjs";

const TZ = "America/New_York";
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT", "UID:a1", "SUMMARY:Ana Ruiz · Balayage", "DTSTART;TZID=America/New_York:20260908T140000", "DTEND;TZID=America/New_York:20260908T153000", "END:VEVENT",
  "BEGIN:VEVENT", "UID:a2", "SUMMARY:Team training", "DTSTART;VALUE=DATE:20260910", "DTEND;VALUE=DATE:20260911", "END:VEVENT",
  "BEGIN:VEVENT", "UID:a3", "SUMMARY:Cancelled one", "STATUS:CANCELLED", "DTSTART;TZID=America/New_York:20260909T100000", "DTEND;TZID=America/New_York:20260909T110000", "END:VEVENT",
  "BEGIN:VEVENT", "UID:a4", "SUMMARY:Lunch\\, every day", "DTSTART;TZID=America/New_York:20260907T130000", "DTEND;TZID=America/New_York:20260907T133000", "RRULE:FREQ=DAILY;COUNT=5", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("the feed's items carry their titles: single, repeating (each occurrence), all-day; a cancelled event is not taken", () => {
  const horizon = { from: Date.parse("2026-09-06T04:00:00Z"), to: Date.parse("2026-09-14T04:00:00Z") };
  const f = parseIcs(ICS, TZ, { horizon });
  assert.equal(f.events, 4);
  assert.equal(f.recurringExpanded, 1);
  const titles = f.items.map((i) => i.title);
  assert.ok(titles.includes("Ana Ruiz · Balayage") && titles.includes("Team training"));
  assert.ok(!titles.includes("Cancelled one"), "cancelled is not taken");
  assert.equal(f.items.filter((i) => i.title === "Lunch, every day").length, 5, "every occurrence, with the unescaped title");
  assert.equal(f.items.length, f.busy.length, "one item per taken block");
  assert.ok(f.items.find((i) => i.title === "Team training").allDay);
  assert.ok(f.items.every((i) => i.uid), "the uid rides along");
});

function dto(over = {}) {
  const from = "2026-09-07";
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: shiftKey(from, i), items: [], windows: [] });
  days[1].items.push({ id: "e1", start: "2026-09-08T18:00:00.000Z", end: "2026-09-08T19:30:00.000Z", title: "Ana Ruiz · Balayage", all_day: false, person: { id: "p1", name: "Ana Ruiz" } });
  days[3].items.push({ id: "e2", start: "2026-09-10T04:00:00.000Z", end: "2026-09-11T04:00:00.000Z", title: "Team training", all_day: true, person: null });
  days[1].windows.push({ start: "2026-09-08T19:30:00.000Z", end: "2026-09-08T22:00:00.000Z" });
  days[4].windows.push({ start: "2026-09-11T14:00:00.000Z", end: "2026-09-11T16:00:00.000Z" });
  return {
    timezone: TZ, from, to: "2026-09-13",
    feed: { present: true, state: "ok", read_at: "2026-09-08T15:58:00.000Z", events: 4, recurring_expanded: 1, skipped_recurring: 0 },
    hours: { mon: { open: "09:00", close: "18:00" }, tue: { open: "09:00", close: "18:00" }, wed: { intervals: [{ open: "09:00", close: "13:00" }, { open: "15:00", close: "19:00" }] }, thu: { open: "09:00", close: "18:00" }, fri: { open: "09:00", close: "18:00" }, sat: { open: "10:00", close: "16:00" }, sun: {} },
    closures: [{ date: "2026-09-12", note: "Wedding" }],
    rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
    booking_link: "https://booksy.com/melanys",
    days,
    ...over,
  };
}

test("the week as the page draws it: hours with air, bands where closed, blocks where taken, dashed windows where open, today and the now line", () => {
  const now = new Date("2026-09-08T16:00:00.000Z"); // Tuesday noon in New York
  const vm = toCalendarVM(dto(), now);
  assert.equal(vm.rangeLabel, "Sep 7 – 13");
  assert.deepEqual(vm.hours, { start: 8, end: 20 }, "9–19 across the week, an hour of air each side");
  assert.equal(vm.today, "2026-09-08");
  assert.equal(Math.round(vm.now * 100) / 100, 12, "noon in the business's zone");
  const tue = vm.days[1];
  assert.equal(tue.dow, "Tue");
  assert.equal(tue.date, "Sep 8");
  assert.equal(tue.today, true);
  assert.equal(vm.days[0].past, true);
  assert.deepEqual(tue.bands, [{ from: 8, to: 9, label: null }, { from: 18, to: 20, label: null }]);
  assert.deepEqual(tue.blocks.map((b) => [b.title, b.t, b.dur, b.time, b.person.name]), [["Ana Ruiz · Balayage", 14, 90, "2 – 3:30 PM", "Ana Ruiz"]]);
  assert.deepEqual(tue.windows.map((w) => [w.t, w.dur, w.label]), [[15.5, 150, "3:30 – 6 PM"]]);
  const wed = vm.days[2];
  assert.deepEqual(wed.bands, [{ from: 8, to: 9, label: null }, { from: 13, to: 15, label: null }, { from: 19, to: 20, label: null }], "a split shift leaves a band for lunch");
  const thu = vm.days[3];
  assert.equal(thu.allDay.length, 1);
  assert.equal(thu.allDay[0].time, "All day");
  assert.equal(thu.blocks.length, 0, "an all-day event is not a block on the grid");
  const sat = vm.days[5];
  assert.deepEqual(sat.closed, { yes: true, note: "Wedding" });
  assert.deepEqual(sat.bands, [{ from: 8, to: 20, label: "Closed · Wedding" }]);
  const sun = vm.days[6];
  assert.deepEqual(sun.closed, { yes: true, note: null });
  assert.deepEqual(vm.stats, { events: 2, windows: 2, next: "today 3:30 PM" });
  assert.equal(vm.feed.line, "From your calendar · read 2 min ago · 4 events");
  assert.equal(vm.rules, "Offers times at least 2h ahead · 15 min between appointments · up to 14 days out · 30-min slots");
  assert.equal(vm.bookingLink, "https://booksy.com/melanys");
});

test("without a feed the board still shows the hours and says so; a feed that could not be read says that too", () => {
  const none = toCalendarVM(dto({ feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 }, days: dto().days.map((d) => ({ ...d, items: [], windows: [] })) }), new Date("2026-09-08T16:00:00.000Z"));
  assert.equal(none.feed.line, "No calendar connected");
  assert.deepEqual(none.stats, { events: 0, windows: 0, next: "—" });
  assert.equal(none.days[1].bands.length, 2, "the hours are still drawn");
  const down = toCalendarVM(dto({ feed: { present: true, state: "unavailable", read_at: "2026-09-08T12:00:00.000Z", events: 0, recurring_expanded: 0, skipped_recurring: 0 } }), new Date("2026-09-08T16:00:00.000Z"));
  assert.equal(down.feed.line, "Your calendar could not be read · last read 4h ago");
  const noHours = toCalendarVM(dto({ hours: null }), new Date("2026-09-08T16:00:00.000Z"));
  assert.deepEqual(noHours.hours, { start: 7, end: 21 }, "no hours on file: a plain working day, with air");
  assert.equal(noHours.days[1].closed.yes, true, "a day with no hours is closed");
});

test("day keys, the words, and the zone", () => {
  assert.equal(mondayOf("2026-09-10"), "2026-09-07");
  assert.equal(mondayOf("2026-09-07"), "2026-09-07");
  assert.equal(mondayOf("2026-09-13"), "2026-09-07", "Sunday belongs to the week that started Monday");
  assert.equal(shiftKey("2026-09-30", 1), "2026-10-01");
  assert.equal(isDayKey("2026-09-07"), true);
  assert.equal(isDayKey("2026-13-07"), false);
  assert.equal(isDayKey(7), false);
  assert.equal(clockLabel(9), "9 AM");
  assert.equal(clockLabel(14.5), "2:30 PM");
  assert.equal(clockLabel(0), "12 AM");
  assert.equal(zoneMidnight(TZ, "2026-09-08"), Date.parse("2026-09-08T04:00:00.000Z"));
  assert.equal(zoneMidnight(TZ, "2026-01-08"), Date.parse("2026-01-08T05:00:00.000Z"), "winter offset");
  assert.equal(readAgoLabel("2026-09-08T15:59:30.000Z", new Date("2026-09-08T16:00:00.000Z")), "just now");
  assert.equal(rulesLine(null), "Offers times at least 2h ahead · up to 14 days out · 30-min slots");
});

test("the doors and the page: read-only, the feed's address never in the browser, a feed checked before it is saved, the registry flipped", () => {
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("const feed = await loadFeed(tenantId, url);"), "the same cache the assistant's openings use");
  assert.ok(svc.includes("freeWindows({ hours: profile.hours, closures: profile.closures, tz: timezone, busy: parsed.busy, rules, now })"), "the windows are the receptionist's own");
  assert.ok(svc.includes("person: personInTitle(it.title, people),"));
  assert.ok(!/ical_url[^\n]*\n[^\n]*return \{/.test(svc), "the address is read, never returned");
  assert.ok(svc.includes("if (PRIVATE_HOST.test(u.hostname)") && svc.includes('throw new AppError("validation", "That address is not an iCal feed.'), "a preview reaches only the public internet and only iCal");
  const r = readCode("apps/dashboard/app/api/v1/calendar/route.ts");
  assert.ok(r.includes('takeRate(ctx.userId, "aggregate")') && r.includes("calendarWeek(ctx, tenantId, { from, days })"));
  const pv = readCode("apps/dashboard/app/api/v1/calendar/preview/route.ts");
  assert.ok(pv.includes('requireRole(member, "operator")') && pv.includes("previewFeed(url, timezone)"));
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(reg.includes('calendar: "real"') && reg.includes('calendar: "calendar"'));
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  for (const id of ["calendar-real", "cal-feed", "cal-feed-card", "cal-dayhead", "cal-col", "cal-block", "cal-window", "cal-panel", "cal-prev", "cal-next", "cal-range", "cal-legend"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(!/drag|Move |cancel\(|Waitlist|two-way|Two-way|Google Calendar|Apple iCal|Utilization|\$\d/.test(page), "a viewer: nothing moved, cancelled, synced two ways, or priced");
  assert.ok(readCode("apps/dashboard/src/legacy/pages/calendar.jsx").includes("window.CalendarSeed = CalendarPage;"));
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes('key: "calendar"') && sd.includes("/api/v1/calendar?from="), "one override, fed by the route");
  const s = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(s.includes('data-testid="cal-check"') && s.includes("window.__calendar.previewFeed(icalUrl.trim())"), "the feed is checked before it is saved");
});

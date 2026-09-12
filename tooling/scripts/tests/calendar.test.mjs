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
import { readCode, importSrc } from "./_source.mjs";

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
  assert.equal(vm.feed.line, "From your calendar · read 2m ago · 4 events");
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
  assert.ok(svc.includes("person: matchPerson(it, people),") && svc.includes("contacts: { phones: c.phones, emails: c.emails },"), "who it is for — by a phone in the event first, then a whole name");
  assert.ok(!/ical_url[^\n]*\n[^\n]*return \{/.test(svc), "the address is read, never returned");
  assert.ok(svc.includes('throw new AppError("validation", feedProblemWords("not_ical")'), "a preview reaches only the public internet and only iCal, by the rule and the words every fetch and the save share");
  const r = readCode("apps/dashboard/app/api/v1/calendar/route.ts");
  assert.ok(r.includes('rate: "aggregate",') && r.includes("calendarWeek(ctx, member.tenantId, { from, days }, new Date(), { canAct })"), "one read; an owner's adds the people it sees");
  const pv = readCode("apps/dashboard/app/api/v1/calendar/preview/route.ts");
  assert.ok(pv.includes('role: "operator",') && pv.includes("previewFeed(url, timezone)"));
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(reg.includes('calendar: "real"') && reg.includes('calendar: "calendar"'));
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  for (const id of ["calendar-real", "cal-feed", "cal-feed-card", "cal-dayhead", "cal-col", "cal-block", "cal-window", "cal-panel", "cal-prev", "cal-next", "cal-range", "cal-legend"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(!/drag|Move |cancel\(|Waitlist|two-way|Two-way|Google Calendar|Apple iCal|Utilization|\$\d/.test(page), "a viewer: nothing moved, cancelled, synced two ways, or priced");
  assert.ok(readCode("apps/dashboard/src/legacy/pages/calendar.jsx").includes("window.CalendarSeed = CalendarPage;"));
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes('key: "calendar"') && sd.includes('read("GET calendar"'), "one override, fed by the route");
  const s = readCode("apps/dashboard/src/legacy/pages/settings.jsx");
  assert.ok(s.includes('data-testid="cal-check"') && s.includes("window.__calendar.previewFeed(icalUrl.trim())"), "the feed is checked before it is saved");
});

test("the words from Settings on the board: hours as runs, closures ahead, services with their length and consult-first; a month's label and span", async () => {
  const { monthSpan, monthLabelOf, shiftMonth, hoursLines } = await import("@chanlytics/contracts");
  const now = new Date("2026-09-08T16:00:00.000Z");
  const vm = toCalendarVM(dto({ services: [{ name: "Balayage", duration_min: 90, consult_first: false }, { name: "Color correction", duration_min: null, consult_first: true }] }), now);
  assert.deepEqual(vm.hoursLines, ["Mon–Tue 09:00–18:00", "Wed 09:00–13:00 and 15:00–19:00 (closed 13:00–15:00)", "Thu–Fri 09:00–18:00", "Sat 10:00–16:00", "Sun closed"], "the same runs Settings and the prompt use");
  assert.deepEqual(vm.closuresAhead, [{ key: "2026-09-12", label: "Sep 12", note: "Wedding" }]);
  assert.deepEqual(vm.services.map((s) => s.label), ["Balayage · 90 min", "Color correction · consult first"]);
  assert.equal(vm.monthLabel, "September 2026");
  assert.deepEqual(monthSpan("2026-09-17"), { from: "2026-08-31", days: 42 }, "six weeks from the Monday on or before the first");
  assert.equal(shiftMonth("2026-09-17", 1), "2026-10-01");
  assert.equal(shiftMonth("2026-01-05", -1), "2025-12-01");
  assert.equal(monthLabelOf("2026-10-01"), "October 2026");
  assert.deepEqual(hoursLines(null), []);
  const past = toCalendarVM(dto({ closures: [{ date: "2026-08-01", note: "gone" }, { date: "2026-09-20", until: "2026-09-22" }] }), now);
  assert.deepEqual(past.closuresAhead, [{ key: "2026-09-20", label: "Sep 20 – 22", note: null }], "a closure already past is not ahead");
});

test("full-fledged: month and agenda views, a date to jump to, windows that fit a service, the rules bar, Today's line, the assistant's read, and Settings saves that reach the board", async () => {
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  for (const id of ["cal-month", "cal-month-cell", "cal-agenda", "cal-agenda-day", "cal-jump", "cal-service", "cal-rules", "cal-consult-note"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(page.includes('data-testid={`cal-view-${id}`}') && page.includes('["month", "Month"], ["agenda", "Agenda"]'), "four views, one tab each");
  assert.ok(page.includes("const fit = (w) => !service || !service.duration || w.dur >= service.duration;"), "the same rule the assistant applies for a service");
  assert.ok(page.includes('if (view === "month") setAnchorKey(cal.shiftMonth(anchor, n));') && page.includes('else if (view === "agenda") setAnchorKey(cal.shiftKey(anchor, 14 * n));'), "a month moves by a month, the agenda by two weeks, by contracts' arithmetic through the bridge");
  assert.ok(!/const cr(Shift|MonthLabel|ShiftMonth|Hour) = /.test(page), "the page keeps no copy of the date arithmetic");
  for (const id of ["cal-panel-copy-link", "cal-panel-text-link", "cal-copy-link"]) assert.ok(page.includes(`data-testid="${id}"`), id);
  assert.ok(page.includes('value={anchor}') && page.includes("CR_REFRESH_MS"), "the date picker follows the anchor; the board reads itself again while open");
  const svc = readCode("apps/dashboard/src/server/calendar.ts");
  assert.ok(svc.includes("const MAX_DAYS = 63;") && svc.includes("consult_first: (profile?.booking_rules?.consult_first ?? []).some("), "the services as Settings keeps them");
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("days: String(w.days)") && sd.includes("if (from !== calendarFrom || days !== calendarDays) return;") && sd.includes("calendarDays = Math.min(63, Math.max(1, Math.round(days) || 63));"));
  assert.deepEqual((await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts")).AFTER["PUT settings"]().map((o) => o.key), ["settings", "today", "calendar"], "hours, closures, rules and services saved in Settings reach the board");
  const dayModule = readCode("apps/dashboard/src/legacy/pages/dashboard-a-day.jsx");
  assert.ok(dayModule.includes('data-testid="today-day"') && dayModule.includes('C.vm.feed.state !== "ok" || !window.__today) return null;'), "Today shows the day on the calendar, and nothing without a feed");
  const tools = readCode("apps/dashboard/src/server/ask/tools.ts");
  assert.ok(tools.includes('name: "get_calendar"') && tools.includes('case "get_calendar": out = await getCalendar(t, run.input); break;'));
  assert.ok(tools.includes("Nothing is booked from here — the booking link does that."));
  assert.ok(readCode("apps/dashboard/src/server/ask/prompt.ts").includes('"calendar": "The owner\'s calendar as the receptionist reads it'));
});

test("instant views: the span a view needs, the window loaded around a day, whether it is covered, and a day's frame from its key alone", async () => {
  const { spanForView, windowFor, coversSpan, frameOf } = await import("@chanlytics/contracts");
  assert.deepEqual(spanForView("week", "2026-09-10"), { from: "2026-09-07", days: 7 });
  assert.deepEqual(spanForView("day", "2026-09-10"), { from: "2026-09-07", days: 7 }, "a day is drawn from its week");
  assert.deepEqual(spanForView("month", "2026-09-10"), { from: "2026-08-31", days: 42 });
  assert.deepEqual(spanForView("agenda", "2026-09-10"), { from: "2026-09-10", days: 14 });
  const w = windowFor("2026-09-10");
  assert.deepEqual(w, { from: "2026-08-24", days: 63 }, "nine weeks from a week before the month's first Monday");
  const days = Array.from({ length: w.days }, (_, i) => ({ key: shiftKey(w.from, i) }));
  for (const view of ["week", "day", "month", "agenda"]) {
    const s = spanForView(view, "2026-09-10");
    assert.equal(coversSpan(days, s.from, s.days), true, `${view} is a slice of the window`);
  }
  assert.equal(coversSpan(days, spanForView("week", "2026-09-03").from, 7), true, "the week before too");
  assert.equal(coversSpan(days, spanForView("agenda", "2026-09-30").from, 14), true, "two weeks from the last day of the month");
  assert.equal(coversSpan(days, "2026-11-01", 7), false, "a move outside the window reads again");
  assert.equal(coversSpan([], "2026-09-07", 7), false);
  assert.deepEqual(frameOf("2026-09-08", "2026-09-08"), { key: "2026-09-08", dow: "Tue", date: "Sep 8", long: "Tuesday, September 8", dayNum: "8", today: true, past: false });
  assert.equal(frameOf("2026-09-01", "2026-09-08").past, true);
});

test("the page keeps a view and a day, derives the rest, and reads only when the window does not cover the view", () => {
  const page = readCode("apps/dashboard/src/legacy/pages/calendar-real.jsx");
  assert.ok(page.includes("const span = vm && cal ? cal.spanFor(view, anchor) : null;") && page.includes("cal.covers(vm.days, span.from, span.days)"), "one arithmetic, from contracts through the bridge");
  assert.ok(page.includes("cal.ensure(view, anchor).then((ok) => {"), "a read only when needed");
  assert.ok(page.includes("frames.push(byKey.get(k) || { ...cal.frameOf(k, vm.today), loading: true,"), "the shape from dates, the content from data");
  assert.ok(page.includes('<div key={view} className={`cal-body ${pending ? "is-loading" : ""}`}'), "a body that arrives");
  assert.ok(page.includes('data-testid="cal-today"') && page.includes("disabled={onToday}"), "Today is always there, never shifting the row");
  assert.ok(page.includes('if (e.key === "ArrowLeft")') && page.includes("crTyping()"), "arrows move, unless the person is typing");
  assert.ok(!page.includes("const [busy, setBusy]"), "no click is ever dropped for being early");
  const bridge = readCode("apps/dashboard/src/legacy-bridge/calendar.ts");
  assert.ok(bridge.includes("export async function ensure(view: CalendarView, anchor: string)") && bridge.includes("if (coversSpan(have, need.from, need.days)) return true;"));
  assert.ok(bridge.includes("spanFor: spanForView, windowFor, covers: coversSpan, frameOf, shiftKey, shiftMonth, monthLabel: monthLabelOf, clockLabel"), "the arithmetic reaches the page, all of it");
  assert.ok(bridge.includes("export async function refresh(): Promise<void>"), "and a refresh the board can call");
  const sd = readCode("apps/dashboard/src/legacy-bridge/surface-data.ts");
  assert.ok(sd.includes("const w = from ? { from, days } : windowFor(localDayKey());"), "the first read is the window around today");
  assert.ok(readCode("apps/dashboard/src/server/calendar.ts").includes("const MAX_DAYS = 63;"));
  const css = readCode("apps/dashboard/src/legacy/styles/calendar.css");
  assert.ok(css.includes("@keyframes cal-in") && css.includes("prefers-reduced-motion"), "a quiet arrival, none for those who asked for none");
});

test("the board drawn right: overlapping blocks take lanes, a block outside the hours widens the grid, and a person's thread rides with the block", () => {
  const now = new Date("2026-09-08T16:00:00.000Z");
  const d = dto();
  const tue = d.days[1];
  tue.items.length = 0;
  tue.items.push(
    { id: "o1", start: "2026-09-08T18:00:00.000Z", end: "2026-09-08T19:00:00.000Z", title: "A", all_day: false, person: { id: "p1", name: "Ana", thread: "c-1", wa_inbound_at: "2026-09-08T15:00:00.000Z" } },
    { id: "o2", start: "2026-09-08T18:30:00.000Z", end: "2026-09-08T19:30:00.000Z", title: "B", all_day: false, person: { id: "p2", name: "Bo", thread: "c-2", wa_inbound_at: "2026-09-01T15:00:00.000Z" } },
    { id: "o3", start: "2026-09-08T18:45:00.000Z", end: "2026-09-08T19:15:00.000Z", title: "C", all_day: false, person: { id: "p3", name: "Cy" } },
    { id: "o4", start: "2026-09-08T20:00:00.000Z", end: "2026-09-08T21:00:00.000Z", title: "D", all_day: false, person: null },
    { id: "o5", start: "2026-09-09T00:00:00.000Z", end: "2026-09-09T01:00:00.000Z", title: "Late", all_day: false, person: null },
  );
  const vm = toCalendarVM(d, now);
  const blocks = vm.days[1].blocks;
  assert.deepEqual(blocks.map((b) => [b.title, b.lane, b.lanes]), [["A", 0, 3], ["B", 1, 3], ["C", 2, 3], ["D", 0, 1], ["Late", 0, 1]], "three that overlap share three lanes; the ones alone keep the column");
  assert.deepEqual(blocks[0].person, { id: "p1", name: "Ana", via: null, threadId: "th-c-1", replyOpen: true }, "a thread and an open reply window");
  assert.deepEqual(blocks[1].person, { id: "p2", name: "Bo", via: null, threadId: "th-c-2", replyOpen: false }, "a thread whose window closed a week ago");
  assert.deepEqual(blocks[2].person, { id: "p3", name: "Cy", via: null, threadId: null, replyOpen: false }, "in People, no thread yet");
  assert.equal(vm.hours.end, 21, "the 8 PM block is drawn: the grid ends at nine, not at the hour after closing");
  assert.equal(vm.hours.start, 8);
  const plain = toCalendarVM(dto(), now);
  assert.deepEqual([plain.hours.start, plain.hours.end], [8, 20], "the hours' own air when nothing falls outside them");
});

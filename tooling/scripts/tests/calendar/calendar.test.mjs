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
  readAgoLabel,
  clockLabel,
  isDayKey,
  mondayOf,
  parseIcs,
  rulesLine,
  shiftKey,
  toCalendarVM,
  zoneMidnight,
} from "@chanlytics/contracts";
import { readCode, importSrc } from "../_source.mjs";

// The calendar route is imported below for the policy it declares; a module that ever builds a service client reads
// these, and nothing dials it.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const TZ = "America/New_York";
const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT",
  "UID:a1",
  "SUMMARY:Ana Ruiz · Balayage",
  "DTSTART;TZID=America/New_York:20260908T140000",
  "DTEND;TZID=America/New_York:20260908T153000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:a2",
  "SUMMARY:Team training",
  "DTSTART;VALUE=DATE:20260910",
  "DTEND;VALUE=DATE:20260911",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:a3",
  "SUMMARY:Cancelled one",
  "STATUS:CANCELLED",
  "DTSTART;TZID=America/New_York:20260909T100000",
  "DTEND;TZID=America/New_York:20260909T110000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:a4",
  "SUMMARY:Lunch\\, every day",
  "DTSTART;TZID=America/New_York:20260907T130000",
  "DTEND;TZID=America/New_York:20260907T133000",
  "RRULE:FREQ=DAILY;COUNT=5",
  "END:VEVENT",
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
  assert.equal(
    f.items.filter((i) => i.title === "Lunch, every day").length,
    5,
    "every occurrence, with the unescaped title",
  );
  assert.equal(f.items.length, f.busy.length, "one item per taken block");
  assert.ok(f.items.find((i) => i.title === "Team training").allDay);
  assert.ok(
    f.items.every((i) => i.uid),
    "the uid rides along",
  );
});

function dto(over = {}) {
  const from = "2026-09-07";
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: shiftKey(from, i), items: [], windows: [] });
  days[1].items.push({
    id: "e1",
    start: "2026-09-08T18:00:00.000Z",
    end: "2026-09-08T19:30:00.000Z",
    title: "Ana Ruiz · Balayage",
    all_day: false,
    person: { id: "p1", name: "Ana Ruiz" },
  });
  days[3].items.push({
    id: "e2",
    start: "2026-09-10T04:00:00.000Z",
    end: "2026-09-11T04:00:00.000Z",
    title: "Team training",
    all_day: true,
    person: null,
  });
  days[1].windows.push({ start: "2026-09-08T19:30:00.000Z", end: "2026-09-08T22:00:00.000Z" });
  days[4].windows.push({ start: "2026-09-11T14:00:00.000Z", end: "2026-09-11T16:00:00.000Z" });
  return {
    timezone: TZ,
    from,
    to: "2026-09-13",
    feed: {
      present: true,
      state: "ok",
      read_at: "2026-09-08T15:58:00.000Z",
      events: 4,
      recurring_expanded: 1,
      skipped_recurring: 0,
    },
    hours: {
      mon: { open: "09:00", close: "18:00" },
      tue: { open: "09:00", close: "18:00" },
      wed: {
        intervals: [
          { open: "09:00", close: "13:00" },
          { open: "15:00", close: "19:00" },
        ],
      },
      thu: { open: "09:00", close: "18:00" },
      fri: { open: "09:00", close: "18:00" },
      sat: { open: "10:00", close: "16:00" },
      sun: {},
    },
    closures: [{ date: "2026-09-12", note: "Wedding" }],
    rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 14 },
    booking_link: "https://book.example.com/marisas",
    // The receptionist's next open time from now, which the route works out from every day it offers.
    next_opening: { start: "2026-09-08T19:30:00.000Z", end: "2026-09-08T22:00:00.000Z" },
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
  assert.deepEqual(tue.bands, [
    { from: 8, to: 9, label: null },
    { from: 18, to: 20, label: null },
  ]);
  assert.deepEqual(
    tue.blocks.map((b) => [b.title, b.t, b.dur, b.time, b.person.name]),
    [["Ana Ruiz · Balayage", 14, 90, "2 – 3:30 PM", "Ana Ruiz"]],
  );
  assert.deepEqual(
    tue.windows.map((w) => [w.t, w.dur, w.label]),
    [[15.5, 150, "3:30 – 6 PM"]],
  );
  const wed = vm.days[2];
  assert.deepEqual(
    wed.bands,
    [
      { from: 8, to: 9, label: null },
      { from: 13, to: 15, label: null },
      { from: 19, to: 20, label: null },
    ],
    "a split shift leaves a band for lunch",
  );
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
  assert.equal(
    vm.rules,
    "Offers times with at least 2h notice · 15 min between appointments · up to 14 days ahead · 30-min slots",
  );
  assert.equal(vm.bookingLink, "https://book.example.com/marisas");
});

test("the Business row says the next thing to do first: an address to make, a forward to confirm, emails to look at, the last email's age, or waiting for the first", () => {
  const now = new Date("2026-09-08T16:00:00.000Z");
  const feed = { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 };
  const notices = (over = {}) => ({
    tool: "booksy",
    address: "salon@mail.example.com",
    last_at: null,
    count: 0,
    held: 0,
    held_list: [],
    forwarding: null,
    ...over,
  });
  const of = (n) => toCalendarVM(dto({ feed: n === undefined ? feed : { ...feed, notices: n } }), now).feed.notices;
  assert.equal(of(undefined).row, null, "nothing before a tool is named or an email arrived");
  assert.equal(of(undefined).state, "none");
  // The mark's own word rides with its colour (Waiting on you, Waiting, Working); the phrase says what, exactly. A step that
  // waits on the owner says Setup's word for one, as Connections and Setup do; "Needs you" is a person's (S9-9).
  const needsYou = (words) => ({ tone: "warn", label: "Waiting on you", words });
  assert.deepEqual(of(notices({ address: null })).row, needsYou("Needs a workspace email address"));
  const forwarding = { account: "owner@example.com", code: "4815162", link: null, at: "2026-09-08T15:00:00.000Z" };
  assert.deepEqual(of(notices({ forwarding })).row, needsYou("Confirm the forward in Gmail"));
  assert.deepEqual(of(notices()).row, {
    tone: "plain",
    label: "Waiting",
    words: "Waiting for the first booking email",
  });
  const working = notices({ last_at: "2026-09-08T14:00:00.000Z", count: 3 });
  assert.deepEqual(of(working).row, { tone: "ok", label: "Working", words: "Last booking email 2h ago" });
  assert.deepEqual(of({ ...working, held: 2 }).row, needsYou("Last booking email 2h ago · 2 to look at"));
  // Held for a look before any has become a visit (`last_at` is the last one that did): the row says what waits on
  // the owner, never that it is still waiting for the first, and never that it is working.
  assert.equal(of(notices({ held: 1 })).state, "waiting");
  assert.deepEqual(of(notices({ held: 1 })).row, needsYou("1 booking email to look at"));
  assert.deepEqual(of(notices({ held: 3 })).row, needsYou("3 booking emails to look at"));
  // Gmail's confirmation is shown for three days. Past that it is nobody's to confirm (another account's, or an old
  // try), and the row goes back to what is true without it.
  const stale = { ...forwarding, at: "2026-09-05T15:59:00.000Z" };
  assert.equal(of(notices({ forwarding: stale })).forwarding, null);
  assert.equal(of(notices({ forwarding: stale })).row.words, "Waiting for the first booking email");
  const fresh = { ...forwarding, at: "2026-09-05T16:00:00.000Z" };
  assert.deepEqual(of(notices({ forwarding: fresh })).forwarding, {
    account: "owner@example.com",
    code: "4815162",
    link: null,
  });
  // A held email carries the delivery it was read from, which the bell's row of it is about (S6-2); an older read, none.
  const listed = (entry) => of(notices({ held: 1, held_list: [entry] })).heldList[0];
  const entry = {
    id: "row-1",
    tool: "booksy",
    from: null,
    subject: null,
    received_at: "2026-09-08T15:00:00.000Z",
    reason: "no_time",
  };
  assert.equal(listed({ ...entry, notice_id: "rcv_1" }).noticeId, "rcv_1");
  assert.equal(listed(entry).noticeId, null);
  // The board's card and the row read one view model: the tool as the product says it, and the line said whole.
  const held = of({ ...working, held: 1 });
  assert.equal(held.tool, "Booksy");
  assert.equal(held.state, "working");
  assert.equal(held.line, "Bookings arrive by email from Booksy · last 2h ago · 1 to look at");
});

test("without a feed the board still shows the hours and says so; a feed that could not be read says that too", () => {
  const none = toCalendarVM(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
      days: dto().days.map((d) => ({ ...d, items: [], windows: [] })),
    }),
    new Date("2026-09-08T16:00:00.000Z"),
  );
  assert.equal(none.feed.line, "No calendar connected");
  assert.deepEqual(none.stats, { events: 0, windows: 0, next: "—" });
  assert.equal(none.days[1].bands.length, 2, "the hours are still drawn");
  const down = toCalendarVM(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: "2026-09-08T12:00:00.000Z",
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
    new Date("2026-09-08T16:00:00.000Z"),
  );
  assert.equal(down.feed.line, "Your calendar could not be read · last read 4h ago");
  const noHours = toCalendarVM(dto({ hours: null }), new Date("2026-09-08T16:00:00.000Z"));
  assert.deepEqual(noHours.hours, { start: 7, end: 21 }, "no hours on file: a plain working day, with air");
  // No hours on file is hours not set, never a week closed (the Calendar's lane B): every day read as Closed, and the
  // page's one notice says the hours are not set.
  assert.equal(noHours.days[1].closed.yes, false, "REGRESSION: hours not set closed every day");
  assert.deepEqual(
    noHours.days.filter((d) => d.closed.yes).map((d) => d.key),
    ["2026-09-12"],
    "no day of the week is closed by the hours: only the closure the owner set",
  );
  // Hours set with a day left out: that day is closed, as it always was.
  const sundayOff = toCalendarVM(dto(), new Date("2026-09-08T16:00:00.000Z"));
  const sunday = sundayOff.days.find((d) => d.key === "2026-09-13");
  assert.equal(sunday.closed.yes, true, "a day the hours leave out is closed");
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
  assert.equal(rulesLine(null), "Offers times with at least 2h notice · up to 14 days ahead · 30-min slots");
});

test("the doors and the page: read-only, the feed's address never in the browser, the registry flipped", async () => {
  // The calendar's server modules that hold what is checked here: the feed's parse (parsed-feed.ts), the settings that
  // name the address (calendar-settings.ts), the board's week (calendar-week.ts) and the preview (feed-preview.ts).
  const svc = ["parsed-feed", "calendar-settings", "calendar-week", "feed-preview"]
    .map((m) => readCode(`apps/dashboard/src/server/calendar/${m}.ts`))
    .join("\n");
  assert.ok(
    svc.includes("const feed = await loadFeed(tenantId, url, opts);"),
    "the same cache the assistant's openings use",
  );
  // The busy time is the feed's, and beside it the record's taken time over the days on offer (00345): a booking a
  // tool emailed took its slot too. That the hour is left out, here and for the receptionist, is executed in
  // ask/readers.test.mjs and availability-tool.test.mjs.
  assert.ok(
    svc.includes("freeWindows({ hours: profile.hours, closures: profile.closures, tz: timezone, busy, rules, now })") &&
      svc.includes("const busy = parsed ? [...parsed.busy, ...taken] : [];"),
    "the windows are the receptionist's own",
  );
  assert.ok(
    svc.includes("person: matchPerson(it, people, own),") &&
      svc.includes("contacts: { phones: c.phones, emails: c.emails },"),
    "who it is for — by a phone in the event first, then a whole name",
  );
  assert.ok(!/ical_url[^\n]*\n[^\n]*return \{/.test(svc), "the address is read, never returned");
  assert.ok(
    svc.includes('throw new AppError("validation", feedProblemWords("not_ical")'),
    "a preview reaches only the public internet and only iCal, by the rule and the words every fetch and the save share",
  );
  // The route as it declares itself: counted with the aggregate reads. Its one read and an owner's adding the people it
  // sees are run over the route: calendar-feed.test.mjs ("the route: ... a viewer's read adds nobody") and
  // readers.test.mjs ("GET calendar through its reader asks what it asked at origin/main ...").
  const route = await importSrc("apps/dashboard/app/api/v1/calendar/route.ts");
  assert.deepEqual(
    route.GET.policy,
    { kind: "read", scope: "workspace", role: null, rate: "aggregate", spend: false },
    "one read, counted with the aggregates",
  );
  const pv = readCode("apps/dashboard/app/api/v1/calendar/preview/route.ts");
  assert.ok(pv.includes('role: "operator",') && pv.includes("previewFeed(url, timezone)"));
  const reg = readCode("apps/dashboard/src/legacy-bridge/surface-registry.ts");
  assert.ok(reg.includes('calendar: "real"') && reg.includes('calendar: "calendar"'));
  // What the page draws, by the testids it is known by, and that it is a viewer, is executed in calendar-honest.test.mjs.
  const sd = readCode("apps/dashboard/src/surfaces/calendar/surface.ts");
  assert.ok(sd.includes('key: "calendar"') && sd.includes('read("GET calendar"'), "one override, fed by the route");
  // The form's "Check the address" button went with the form: the Business page's calendar row states its last read
  // and its count, and says a read that failed with its Retry (the spec's "When you're open"), executed in
  // business-tab-open.test.mjs. So a save no longer previews the feed first.
});

test("the words from Settings on the board: hours as runs, closures ahead, services with their length and consult-first; a month's label and span", async () => {
  const { monthSpan, monthLabelOf, shiftMonth, hoursLines } = await import("@chanlytics/contracts");
  const now = new Date("2026-09-08T16:00:00.000Z");
  const vm = toCalendarVM(
    dto({
      services: [
        { name: "Balayage", duration_min: 90, consult_first: false },
        { name: "Color correction", duration_min: null, consult_first: true },
      ],
    }),
    now,
  );
  assert.deepEqual(
    vm.hoursLines,
    ["Mon–Tue 9 AM – 6 PM", "Wed 9 AM – 1 PM and 3 – 7 PM", "Thu–Fri 9 AM – 6 PM", "Sat 10 AM – 4 PM", "Sun closed"],
    "the same runs Settings and the prompt use",
  );
  assert.deepEqual(vm.closuresAhead, [{ key: "2026-09-12", label: "Sep 12", note: "Wedding" }]);
  assert.deepEqual(
    vm.services.map((s) => s.label),
    ["Balayage · 90 min", "Color correction · consultation first"],
  );
  assert.equal(vm.monthLabel, "September 2026");
  assert.deepEqual(
    monthSpan("2026-09-17"),
    { from: "2026-08-31", days: 42 },
    "six weeks from the Monday on or before the first",
  );
  assert.equal(shiftMonth("2026-09-17", 1), "2026-10-01");
  assert.equal(shiftMonth("2026-01-05", -1), "2025-12-01");
  assert.equal(monthLabelOf("2026-10-01"), "October 2026");
  assert.deepEqual(hoursLines(null), []);
  const past = toCalendarVM(
    dto({
      closures: [
        { date: "2026-08-01", note: "gone" },
        { date: "2026-09-20", until: "2026-09-22" },
      ],
    }),
    now,
  );
  assert.deepEqual(
    past.closuresAhead,
    [{ key: "2026-09-20", label: "Sep 20 – 22", note: null }],
    "a closure already past is not ahead",
  );
});

test("full-fledged: month and agenda views, a date to jump to, windows that fit a service, the rules bar, Today's line, the assistant's read, and Settings saves that reach the board", async () => {
  // Executed in calendar-honest.test.mjs: the four views, one tab each, and every testid the page is known by; the date picker
  // following the anchor; the open times a service leaves (the assistant's rule); the steps (crStep, the-pages-say-only-what-is-true.test.mjs).
  const svc = readCode("apps/dashboard/src/server/calendar/calendar-week.ts");
  assert.ok(
    svc.includes("const MAX_DAYS = 63;") &&
      svc.includes("consult_first: needsConsultation(s.name, profile?.booking_rules),"),
    "the services as Settings keeps them",
  );
  const sd = readCode("apps/dashboard/src/surfaces/calendar/surface.ts");
  assert.ok(
    sd.includes("days: String(w.days)") &&
      sd.includes("if (from !== calendarFrom || days !== calendarDays) return;") &&
      sd.includes("calendarDays = Math.min(63, Math.max(1, Math.round(days) || 63));"),
  );
  assert.deepEqual(
    (await importSrc("apps/dashboard/src/legacy-bridge/refresh-map.ts")).AFTER["PUT settings"]().map((o) => o.key),
    ["settings", "calendar", "setup", "workspace"],
    "hours, closures, rules and services saved in Settings reach the board, and Setup (and the postal address, People's reach and the composers where a page draws them, and no page is on screen here: S4-6), and a renamed business the workspace (00439); Today's five reads draw no configuration",
  );
  const dayModule = readCode("apps/dashboard/src/surfaces/today/pages/day.tsx");
  assert.ok(
    dayModule.includes('if (!C || !C.vm || C.vm.feed.state !== "ok") return null;') &&
      !dayModule.includes('data-testid="today-day"'),
    "Today reads the day from the calendar once, for the strip and the brief (no pane of its own since canvas E3), and a feed that is not ok is no day",
  );
  // calendar.week is the registry's, and runs in ask-turn.test.mjs ("calendar.week reads the people it names"), where
  // its result says that nothing is booked from here.
  assert.ok(
    /"?calendar"?:\s*"The owner's calendar as the receptionist reads it/.test(
      readCode("apps/dashboard/src/server/ask/prompt.ts"),
    ),
  );
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
  assert.equal(
    coversSpan(days, spanForView("agenda", "2026-09-30").from, 14),
    true,
    "two weeks from the last day of the month",
  );
  assert.equal(coversSpan(days, "2026-11-01", 7), false, "a move outside the window reads again");
  assert.equal(coversSpan([], "2026-09-07", 7), false);
  assert.deepEqual(frameOf("2026-09-08", "2026-09-08"), {
    key: "2026-09-08",
    dow: "Tue",
    date: "Sep 8",
    long: "Tuesday, September 8",
    dayNum: "8",
    today: true,
    past: false,
  });
  assert.equal(frameOf("2026-09-01", "2026-09-08").past, true);
});

test("the page keeps a view and a day, derives the rest, and reads only when the window does not cover the view", () => {
  // The page's own half is executed in calendar-honest.test.mjs: a read only when the window lacks the view, the shape from dates
  // and the content from data, the arrows unless the person is typing or something is open, Today always there.
  const bridge = readCode("apps/dashboard/src/surfaces/calendar/verbs.ts");
  assert.ok(
    bridge.includes("async function ensure(view: CalendarView, anchor: string)") &&
      bridge.includes("if (coversSpan(have, need.from, need.days)) return true;"),
  );
  assert.ok(
    /spanFor: spanForView,\s*windowFor,\s*covers: coversSpan,\s*frameOf,\s*shiftKey,\s*shiftMonth,\s*monthLabel: monthLabelOf,\s*clockLabel/.test(
      bridge,
    ),
    "the arithmetic reaches the page, all of it",
  );
  assert.ok(
    bridge.includes("async function refresh(opts: { fresh?: boolean } = {}): Promise<boolean>"),
    "and a refresh the board can call, fresh on request, saying whether a read landed",
  );
  // The first read is the window around the business's today, asked for by that word: executed in
  // calendar-cold-boot.test.mjs (the page's half) and calendar-feed.test.mjs (the route's).
  assert.ok(readCode("apps/dashboard/src/server/calendar/calendar-week.ts").includes("const MAX_DAYS = 63;"));
  const css = readCode("apps/dashboard/src/legacy/styles/calendar.css");
  assert.ok(
    css.includes("@keyframes cal-in") && css.includes("prefers-reduced-motion"),
    "a quiet arrival, none for those who asked for none",
  );
});

test("the board drawn right: overlapping blocks take lanes, a block outside the hours widens the grid, and a person's thread rides with the block", () => {
  const now = new Date("2026-09-08T16:00:00.000Z");
  const d = dto();
  const tue = d.days[1];
  tue.items.length = 0;
  tue.items.push(
    {
      id: "o1",
      start: "2026-09-08T18:00:00.000Z",
      end: "2026-09-08T19:00:00.000Z",
      title: "A",
      all_day: false,
      person: { id: "p1", name: "Ana", thread: "c-1", wa_inbound_at: "2026-09-08T15:00:00.000Z" },
    },
    {
      id: "o2",
      start: "2026-09-08T18:30:00.000Z",
      end: "2026-09-08T19:30:00.000Z",
      title: "B",
      all_day: false,
      person: { id: "p2", name: "Bo", thread: "c-2", wa_inbound_at: "2026-09-01T15:00:00.000Z" },
    },
    {
      id: "o3",
      start: "2026-09-08T18:45:00.000Z",
      end: "2026-09-08T19:15:00.000Z",
      title: "C",
      all_day: false,
      person: { id: "p3", name: "Cy" },
    },
    {
      id: "o4",
      start: "2026-09-08T20:00:00.000Z",
      end: "2026-09-08T21:00:00.000Z",
      title: "D",
      all_day: false,
      person: null,
    },
    {
      id: "o5",
      start: "2026-09-09T00:00:00.000Z",
      end: "2026-09-09T01:00:00.000Z",
      title: "Late",
      all_day: false,
      person: null,
    },
  );
  const vm = toCalendarVM(d, now);
  const blocks = vm.days[1].blocks;
  assert.deepEqual(
    blocks.map((b) => [b.title, b.lane, b.lanes]),
    [
      ["A", 0, 3],
      ["B", 1, 3],
      ["C", 2, 3],
      ["D", 0, 1],
      ["Late", 0, 1],
    ],
    "three that overlap share three lanes; the ones alone keep the column",
  );
  const act = (label, short, title, ready) => ({ label, short, title, ready, offered: true });
  assert.deepEqual(
    blocks[0].person,
    {
      id: "p1",
      name: "Ana",
      via: null,
      threadId: "th-c-1",
      bookingLinkAction: act(
        "Text the booking link",
        "Text the link",
        "Opens the thread with the link ready to send · any message for 23h more",
        true,
      ),
      stopped: false,
      // What the board knows of them beside their name (calendar-person-facts.ts): none where the read carried none.
      facts: null,
    },
    "a thread and an open reply window: the link is carried in",
  );
  assert.deepEqual(
    blocks[1].person,
    {
      id: "p2",
      name: "Bo",
      via: null,
      threadId: "th-c-2",
      bookingLinkAction: act(
        "Send the booking link",
        "Send the link",
        "Only an approved message reaches them until they write again; their thread offers the one with the link",
        false,
      ),
      stopped: false,
      facts: null,
    },
    "a thread whose window closed a week ago: the thread offers the approved message",
  );
  assert.deepEqual(
    blocks[2].person,
    {
      id: "p3",
      name: "Cy",
      via: null,
      threadId: null,
      bookingLinkAction: blocks[2].person.bookingLinkAction,
      stopped: false,
      facts: null,
    },
    "in People, no thread yet",
  );
  assert.equal(blocks[2].person.bookingLinkAction.ready, false, "and no link to carry");
  assert.equal(vm.hours.end, 21, "the 8 PM block is drawn: the grid ends at nine, not at the hour after closing");
  assert.equal(vm.hours.start, 8);
  const plain = toCalendarVM(dto(), now);
  assert.deepEqual([plain.hours.start, plain.hours.end], [8, 20], "the hours' own air when nothing falls outside them");
});

/* ------------------------- campaigns on the board (the Calendar's lane C, contracts calendar-runs.ts) ------------------------- */

const { calendarRunMarksOf, runMarkShown, CALENDAR_SHOW_WORDS } = await import("@chanlytics/contracts");
// Tuesday noon in New York; the span is the week.
const RUNS_NOW = new Date("2026-09-08T16:00:00.000Z");
/** A run as GET calendar/runs carries it: a campaign's sent run for today unless `over` says otherwise. */
const runOf = (id, over = {}) => ({
  id,
  name: "Message",
  state: "sent",
  scheduled_for: "2026-09-08T14:00:00.000Z",
  started_at: "2026-09-08T14:00:00.000Z",
  finished_at: "2026-09-08T14:05:00.000Z",
  run_for: "2026-09-08",
  playbook_id: null,
  reach_out: false,
  sent: 0,
  recipient_count: 0,
  ...over,
});
/** A running campaign that sends by itself at 3 PM, last run yesterday, unless `over` says otherwise. */
const momentOf = (id, over = {}) => ({
  id,
  name: id,
  trigger: "visit_tomorrow",
  state: "running",
  mode: "auto",
  run_hour: 15,
  last_run_for: "2026-09-07",
  until: null,
  trial_until: null,
  reach_out: false,
  ...over,
});
const runsWeek = (runs, moments, over = {}) => ({
  timezone: TZ,
  from: "2026-09-07",
  days: 7,
  paused: false,
  runs,
  moments,
  ...over,
});
const marksOn = (dto, day) => calendarRunMarksOf(dto, RUNS_NOW).get(day) ?? [];
const said = (m) => [m.time, m.name, m.words].filter(Boolean).join(" · ");
const tueSaid = (dto) => marksOn(dto, "2026-09-08").map(said);

test("(lane C) a one-off send stands at its time in Sent's words; a campaign's run waiting for approval is the day's amber, at no hour; the runs that went are one quiet mark", () => {
  const dto = runsWeek(
    [
      runOf("s1", {
        name: "Autumn offer",
        state: "scheduled",
        run_for: null,
        scheduled_for: "2026-09-11T14:00:00.000Z",
        started_at: null,
        finished_at: null,
        recipient_count: 42,
      }),
      runOf("s2", { name: "Old news", state: "canceled", run_for: null }),
      runOf("w1", {
        name: "We miss you",
        playbook_id: "c-win",
        state: "pending_approval",
        run_for: "2026-09-09",
        started_at: null,
        finished_at: null,
      }),
      runOf("w0", { playbook_id: "c-win", state: "pending_approval", run_for: "2026-09-07", started_at: null }),
      runOf("r1", { playbook_id: "c-rem", sent: 6 }),
      runOf("r2", { playbook_id: "c-thanks", sent: 3 }),
      runOf("f1", {
        playbook_id: "c-fail",
        state: "failed",
        run_for: "2026-09-10",
        finished_at: "2026-09-10T15:00:00.000Z",
      }),
    ],
    [
      momentOf("c-win", { name: "We miss you", mode: "ask", last_run_for: "2026-09-09" }),
      momentOf("c-rem", { name: "Appointment reminder", last_run_for: "2026-09-08" }),
      momentOf("c-thanks", { name: "Thank you", last_run_for: "2026-09-08" }),
      momentOf("c-fail", { name: "Review ask", state: "paused" }),
    ],
  );
  const fri = marksOn(dto, "2026-09-11");
  assert.deepEqual(fri.map(said), ["10 AM · Autumn offer · Scheduled · 42 people"]);
  assert.deepEqual([fri[0].tone, fri[0].ahead, fri[0].kind], ["info", true, "send"]);
  assert.ok(
    !JSON.stringify([...calendarRunMarksOf(dto, RUNS_NOW).values()]).includes("Old news"),
    "a cancelled send is not drawn",
  );
  const wed = marksOn(dto, "2026-09-09");
  assert.deepEqual(
    wed.map(said),
    ["We miss you · Waiting for your approval", "3 PM · Appointment reminder · to come", "3 PM · Thank you · to come"],
    "what waits first, then by the clock: the two that ran today run again tomorrow",
  );
  assert.ok(
    !tueSaid(dto).some((s) => s.startsWith("We miss you")),
    "REGRESSION: a run made for tomorrow was forecast again today as 'to approve today'",
  );
  assert.deepEqual([wed[0].t, wed[0].tone, wed[0].route], [null, "warn", "broadcasts/run:w1"]);
  assert.deepEqual(
    marksOn(dto, "2026-09-07").map(said),
    ["We miss you · Too late to approve"],
    "its day passed: no longer amber",
  );
  const tue = marksOn(dto, "2026-09-08");
  const went = tue.find((m) => m.kind === "campaigns");
  assert.equal(said(went), "Campaigns · 9 sent", "the day's runs that went, one mark");
  assert.deepEqual(
    went.items.map((i) => `${i.name} · ${i.words}`),
    ["Appointment reminder · 6 sent", "Thank you · 3 sent"],
    "its sheet names each",
  );
  assert.equal(went.named, false, "a month does not name what went");
  assert.deepEqual(
    marksOn(dto, "2026-09-10").map((m) => [said(m), m.tone]),
    [["11 AM · Review ask · Failed", "danger"]],
  );
});

test("(lane C) a running campaign's next run is forecast today or tomorrow, its hour first and said once: never where a run is made for that day or a later one, past its last day, or while the workspace is paused", () => {
  const forecast = (moment, runs = [], over = {}) =>
    [...calendarRunMarksOf(runsWeek(runs, [moment], over), RUNS_NOW).values()].flat().filter((m) => m.kind === "next");
  const today = forecast(momentOf("Appointment reminder"));
  assert.deepEqual(
    today.map(said),
    ["3 PM · Appointment reminder · to come"],
    "REGRESSION: the hour was said twice ('3 PM · … · runs 3 PM · to come')",
  );
  assert.deepEqual([today[0].t, today[0].ahead, today[0].route], [15, true, "campaigns/moment:Appointment reminder"]);
  assert.deepEqual(
    forecast(momentOf("We miss you", { mode: "ask" })).map(said),
    ["We miss you · to approve today"],
    "a class that waits for a person: the day alone",
  );
  assert.deepEqual(
    forecast(momentOf("Late", { run_hour: 9 })).map((m) => [said(m), m.t]),
    [["Late · runs within the hour · to come", null]],
    "past its hour and not run yet today: it catches up, with no hour to promise",
  );
  assert.deepEqual(forecast(momentOf("Done today", { last_run_for: "2026-09-08" })).map(said), [
    "3 PM · Done today · to come",
  ]);
  assert.equal(forecast(momentOf("Done today", { last_run_for: "2026-09-08" }))[0].key, "next:Done today");
  assert.deepEqual(
    forecast(momentOf("Made ahead", { mode: "ask", last_run_for: "2026-09-09" })),
    [],
    "REGRESSION: a run already made for tomorrow, waiting for approval, was forecast as today's",
  );
  assert.deepEqual(
    forecast(momentOf("Stands", { run_hour: 9 }), [
      runOf("x", { playbook_id: "Stands", state: "scheduled", run_for: "2026-09-08", started_at: null }),
    ]),
    [],
    "a run row already stands for it that day",
  );
  assert.deepEqual(forecast(momentOf("Over", { until: "2026-09-07" })), [], "past its last day");
  assert.deepEqual(forecast(momentOf("Off", { mode: "never" })), [], "a class that never sends");
  assert.deepEqual(forecast(momentOf("Paused", { state: "paused" })), [], "a paused campaign");
  assert.deepEqual(forecast(momentOf("Any"), [], { paused: true }), [], "the workspace paused: nothing goes out");
  assert.deepEqual(forecast(momentOf("Chain", { reach_out: true })), [], "cold email has no forecast here");
});

test("(lane C) a campaign's last day, and cold email on its own switch: a chain's runs a day, counted, never at an hour", () => {
  const dto = runsWeek(
    [
      runOf("c1", { name: "Businesses nearby", playbook_id: "chain", reach_out: true, run_for: "2026-09-07", sent: 8 }),
      runOf("c2", { name: "Businesses nearby", playbook_id: "chain", reach_out: true, run_for: "2026-09-07", sent: 4 }),
      runOf("c3", {
        playbook_id: "chain",
        reach_out: true,
        run_for: "2026-09-10",
        state: "scheduled",
        recipient_count: 9,
        started_at: null,
        finished_at: null,
      }),
    ],
    [
      momentOf("chain", { name: "Businesses nearby", reach_out: true, mode: "ask" }),
      momentOf("c-win", { name: "We miss you", until: "2026-09-12", last_run_for: "2026-09-08" }),
    ],
  );
  const mon = marksOn(dto, "2026-09-07");
  assert.deepEqual(
    mon.map((m) => [said(m), m.cold, m.t]),
    [["Businesses nearby · 12 written", true, null]],
  );
  assert.deepEqual(marksOn(dto, "2026-09-10").map(said), ["Businesses nearby · 9 planned"]);
  assert.deepEqual(
    marksOn(dto, "2026-09-12").map((m) => [said(m), m.named]),
    [["We miss you · last day", true]],
  );
  assert.equal(
    runMarkShown(mon[0], { campaigns: true, cold: false }),
    false,
    "cold email is off unless Show turns it on",
  );
  assert.equal(runMarkShown(mon[0], { campaigns: false, cold: true }), true);
  assert.equal(runMarkShown(marksOn(dto, "2026-09-12")[0], { campaigns: true, cold: false }), true);
  // Show's value says what is on beside the visits, in its own words.
  const value = CALENDAR_SHOW_WORDS.value;
  const both = { campaigns: true, cold: true };
  assert.equal(value({ open: true, campaigns: true, cold: false }, both), "Open times, campaigns");
  assert.equal(
    value({ open: true, campaigns: true, cold: false }, { campaigns: true, cold: false }),
    "Everything",
    "no cold email to offer",
  );
  assert.equal(
    value({ open: true, campaigns: true, cold: false }, { campaigns: false, cold: false }),
    "Everything",
    "a workspace with no campaign: Show is open times alone, and says nothing of campaigns it has none of",
  );
  assert.equal(
    value({ open: false, campaigns: true, cold: false }, { campaigns: false, cold: false }),
    "Bookings only",
  );
  assert.equal(value({ open: false, campaigns: false, cold: false }, both), "Bookings only");
});

/**
 * The day on Today: today and tomorrow from the calendar the receptionist
 * reads, the visit playbooks' line, and two facts beside the recap's —
 * computed in contracts from the surfaces the page already holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayDay, todayDayFacts } from "@chanlytics/contracts";
import { readCode, readRaw } from "./_source.mjs";

const person = (id, name) => ({ id, name, via: "phone" });
const block = (id, t, time, title, p = null) => ({ id, t, dur: 60, time, title, person: p, description: null, location: null, contacts: { phones: [], e164: [], emails: [] }, guess: null, start: "", end: "" });
const day = (key, over = {}) => ({ key, dow: "Sun", date: "Sep 6", long: "Sunday, September 6", dayNum: "6", today: false, past: false, closed: { yes: false, note: null }, bands: [], blocks: [], allDay: [], windows: [], ...over });
const cal = (days, over = {}) => ({ timezone: "America/New_York", from: "2026-09-06", to: "2026-11-07", rangeLabel: "", monthLabel: "", hours: { start: 8, end: 20 }, days, today: "2026-09-06", now: 10, feed: { present: true, state: "ok", line: "", events: 3, source: "Google Calendar" }, stats: { events: 3, windows: 2, next: "Mon 9:30 AM" }, rules: "", hoursLines: [], closuresAhead: [], services: [], bookingLink: null, ...over });

test("today and tomorrow, as the calendar reads them: items in time order with their person, the open windows, closed days said plainly", () => {
  const days = [
    day("2026-09-05", { past: true, long: "Saturday, September 5", blocks: [block("b0", 10, "10 – 11 AM", "Trim")] }),
    day("2026-09-06", { today: true, blocks: [block("b2", 14, "2 – 3 PM", "Balayage", person("c1", "Daniela R.")), block("b1", 10, "10 – 11 AM", "Gloss")], allDay: [block("a1", 0, "", "Stock count")], windows: [{ t: 11, dur: 120, label: "11 AM – 1 PM" }, { t: 15, dur: 60, label: "3 – 4 PM" }] }),
    day("2026-09-07", { long: "Monday, September 7", closed: { yes: true, note: "Labor Day" }, windows: [{ t: 9, dur: 60, label: "9 – 10 AM" }] }),
    day("2026-09-08", { long: "Tuesday, September 8", blocks: [block("b3", 9, "9 – 10 AM", "Cut")] }),
  ];
  const vm = todayDay(cal(days), [{ trigger: "visit_tomorrow", state: "running", run_hour: 10, candidates: 2, next: "today 10:00" }, { trigger: "quiet_30", state: "running", run_hour: 10, candidates: 5, next: "today 10:00" }], { rows: [{ id: "c1", state: "needs_you" }] });
  assert.equal(vm.feed, "ok");
  assert.deepEqual(vm.frames.map((f) => f.key), ["2026-09-06", "2026-09-07"], "today and tomorrow, never yesterday");
  const today = vm.frames[0];
  assert.equal(today.label, "Today · Sunday, September 6");
  assert.deepEqual(today.items.map((i) => [i.time, i.title, i.person ? i.person.name : null, i.allDay]), [["", "Stock count", null, true], ["10 – 11 AM", "Gloss", null, false], ["2 – 3 PM", "Balayage", "Daniela R.", false]], "all-day first, then by the clock");
  assert.deepEqual(today.open, ["11 AM – 1 PM", "3 – 4 PM"]);
  // The schedule's own words: the start in a column, the length, the place against the clock (now is 10), the person's open thread.
  assert.deepEqual(today.items.map((i) => [i.start, i.dur, i.phase, i.flag]), [["All day", "", "later", null], ["10 AM", "1h", "now", null], ["2 PM", "1h", "next", "Needs you — in Inbox"]]);
  assert.deepEqual(today.summary, { booked: "3 booked", flagged: "1 needs you" });
  const later = todayDay(cal([day("2026-09-06", { today: true, blocks: [block("b1", 8, "8 – 9 AM", "Trim"), block("b2", 9, "9 – 10 AM", "Cut")] }), day("2026-09-07", { blocks: [block("b3", 9, "9 – 10 AM", "Cut", person("c9", "Ana"))] })]), [], null);
  assert.deepEqual(later.frames[0].items.map((i) => i.phase), ["past", "past"], "over by ten");
  assert.deepEqual([later.frames[1].items[0].phase, later.frames[1].items[0].flag, later.frames[1].summary], ["later", null, { booked: "1 booked", flagged: null }], "tomorrow has no clock and no rows to flag from");
  const tomorrow = vm.frames[1];
  assert.equal(tomorrow.label, "Tomorrow · Monday, September 7");
  assert.equal(tomorrow.summary, null);
  assert.deepEqual(tomorrow.items.map((i) => i.phase), [], "tomorrow is closed with nothing on it");
  assert.deepEqual([tomorrow.closed, tomorrow.open, tomorrow.items], [{ yes: true, note: "Labor Day" }, [], []], "a closed day offers no windows");
  assert.equal(vm.nextOpening, "Mon 9:30 AM");
  assert.deepEqual(vm.reminders, { text: "Visit reminder: 2 people · next run today 10:00", to: "outbound" }, "only the visit playbooks speak here");
});

test("without a feed the day says nothing; with one and no visit playbook it offers to start one; a dash is no next open time", () => {
  assert.deepEqual(todayDay(null, null), { feed: "none", frames: [], nextOpening: null, reminders: null });
  const off = todayDay(cal([day("2026-09-06", { today: true })], { feed: { present: true, state: "unavailable", line: "", events: 0, source: "x" } }), []);
  assert.equal(off.feed, "unavailable");
  assert.equal(off.reminders, null);
  const on = todayDay(cal([day("2026-09-06", { today: true })], { stats: { events: 0, windows: 0, next: "—" } }), []);
  assert.equal(on.nextOpening, null);
  assert.match(on.reminders.text, /^No visit reminders yet/);
  assert.equal(on.reminders.to, "outbound");
  const paused = todayDay(cal([day("2026-09-06", { today: true })]), [{ trigger: "visited", state: "paused", run_hour: 18, candidates: 1, next: "paused" }]);
  assert.match(paused.reminders.text, /^No visit reminders yet/, "a paused playbook is not a reminder going out");
});

test("the facts beside the recap's: appointments today with the next open time or the closure, and what is booked ahead", () => {
  const c = cal([day("2026-09-06", { today: true, blocks: [block("b1", 10, "10 – 11 AM", "Gloss")], allDay: [block("a1", 0, "", "Stock")] })]);
  assert.deepEqual(todayDayFacts(c, { booked: 3, reachedWeek: 4 }), [
    { label: "Appointments today", value: "2", hint: "next open time Mon 9:30 AM" },
    { label: "Booked ahead", value: "3", hint: "4 reached this week" },
  ]);
  const closed = cal([day("2026-09-06", { today: true, closed: { yes: true, note: "holiday" } })]);
  assert.equal(todayDayFacts(closed, null)[0].hint, "closed today · holiday");
  assert.deepEqual(todayDayFacts(null, { booked: 3, reachedWeek: 4 }), [], "no calendar, no invented count");
  assert.deepEqual(todayDayFacts(cal([], { feed: { present: true, state: "unavailable", line: "", events: 0, source: "x" } }), null), []);
});

test("the wiring: the bridge publishes the helpers, the page composes the module, the hero adds the facts and drops its one-line calendar, the core shows both", () => {
  assert.ok(readCode("apps/dashboard/src/legacy-bridge/today.ts").includes("window.__today = { day: todayDay, facts: todayDayFacts, dayLine: todayDayLine, week: todayWeek, journey: todayJourney, away: todayAway, awayGrouped: todayAwayGrouped, leaks: todayLeaks };"));
  const app = readCode("apps/dashboard/src/legacy-bridge/LegacyApp.tsx");
  assert.ok(app.includes('import { installToday } from "./today";') && app.includes("installToday();"));
  const page = readCode("apps/dashboard/src/legacy/pages/dashboard-a-day.jsx");
  for (const s of ['data-testid="today-day"', 'C.vm.feed.state !== "ok" || !window.__today) return null;', "window.__today.day(C.vm, P ? P.rows : null, window.__PEOPLE || null)", 'data-testid="today-day-frame"', 'data-testid="today-day-item"', "nav(b.person ? `clients/${b.person.id}` : \"calendar\")", 'data-testid="today-day-reminders"', 'className="td-item-rail"', "data-phase={b.phase}", 'className="td-item-flag"', "b.person ? b.person.name : b.title"]) assert.ok(page.includes(s), s);
  const brief = readCode("apps/dashboard/src/legacy/pages/dashboard-a-brief.jsx");
  assert.ok(brief.includes("window.__today.dayLine(C ? C.vm : null, P ? P.aggregates : null)"), "the day's numbers ride the recap's one sentence");
  assert.ok(!brief.includes("<DayFacts />"), "the strip of stat cards above the work is that sentence now");
  assert.ok(!brief.includes("CalendarLine") && !brief.includes('data-testid="brief-calendar"'), "the one-line calendar beat is the module now");
  const dash = readCode("apps/dashboard/src/legacy/pages/dashboard-a.jsx");
  assert.ok(dash.indexOf("<AgentCommand />") < dash.indexOf("<TodayDay />"), "the queue, then the day, in the core");
  const manifest = readCode("apps/dashboard/src/legacy-bridge/manifest.ts");
  assert.ok(manifest.indexOf('"@/legacy/pages/dashboard-a-day.jsx"') < manifest.indexOf('"@/legacy/pages/dashboard-a.jsx"'));
  const css = readRaw("apps/dashboard/src/legacy/styles/dashboard-a-v2.css");
  assert.ok(css.includes(".td-day {") && css.includes(".td-frame.today .td-frame-label") && css.includes(".td-items::before {") && css.includes("grid-template-columns: 56px 12px minmax(0, 1fr) auto;") && css.includes("-webkit-line-clamp: 2;") && css.includes(".td-item.now .td-item-rail::after") && !readCode("apps/dashboard/src/legacy/pages/dashboard-a-day.jsx").includes("cal-agenda") && css.includes("@media (max-width: 900px) {\n  .dash-a-v2-core { grid-template-columns: 1fr; }"));
});

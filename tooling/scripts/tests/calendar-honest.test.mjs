/**
 * Calendar: an appointment opens as a dialog, a failed read says so, and the page names the days it shows.
 *
 * - An appointment's panel was a borrowed modal with no dialog role and no Escape, and the arrow keys kept
 *   moving the board behind it (the interface audit's D14).
 * - Days that could not be read stayed dimmed as if still loading, under a toast that said so once and faded.
 * - The strip said "This week" of next week and "This month" of any month.
 * - The booking rules were one sentence cut apart with a regex, and "2 repeating rules read once" and
 *   "3 more not shown" were never explained.
 * - A phone opened on a week grid four times its width; nothing could link to a day; and every sentence
 *   about the calendar's address sent the owner to "Settings › Workspace", a tab named Business.
 * - C1, what the page says is true wherever it looks: Next opening came from the loaded weeks and named only a
 *   weekday; a board left on another month took Today's day with it; a day past what the receptionist offers read
 *   as a day with nothing to offer; the party size and the consultation-first services were never said; closures
 *   past the sixth vanished; the strip counted an unreadable calendar, and days still loading, as zero.
 * Run against the contracts, the bridge's arithmetic and the page on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftKey, toBookingReportVM, toCalendarVM } from "@chanlytics/contracts";

const TZ = "America/New_York";
// Tuesday noon in New York, the week calendar.test.mjs draws.
const NOW = new Date("2026-09-08T16:00:00.000Z");

// The week as calendar.test.mjs builds it, in the route's shape.
function dto(over = {}) {
  const from = "2026-09-07";
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: shiftKey(from, i), items: [], windows: [] });
  days[1].items.push({ id: "e1", start: "2026-09-08T18:00:00.000Z", end: "2026-09-08T19:30:00.000Z", title: "Ana Ruiz · Color", all_day: false, person: { id: "p1", name: "Ana Ruiz" } });
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

/* -------------------------------- the page, drawn -------------------------------- */

let cells = [];
let seq = 0;
// What each effect hands back to be run when the page goes away, as React runs them on unmount.
let cleanups = [];
const went = [];
const listeners = {};
globalThis.Icon = "Icon";
globalThis.React = {
  Fragment: "Fragment",
  createElement: (type, p, ...kids) => {
    const props = { ...(p || {}), children: kids.flat(Infinity) };
    const node = { type, props };
    if (typeof type === "function") node.rendered = type(props);
    return node;
  },
  useState: (init) => { const k = seq++; if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init; return [cells[k], (v) => { cells[k] = typeof v === "function" ? v(cells[k]) : v; }]; },
  useReducer: (red, init) => { const k = seq++; if (!(k in cells)) cells[k] = init; return [cells[k], (a) => { cells[k] = red(cells[k], a); }]; },
  useRef: (init) => { const k = seq++; if (!(k in cells)) cells[k] = { current: init }; return cells[k]; },
  useMemo: (fn) => fn(),
  useEffect: (fn) => { const k = seq++; if (!(k in cells)) { cells[k] = true; const done = fn(); if (typeof done === "function") cleanups.push(done); } },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = { body: {}, activeElement: null, visibilityState: "visible", addEventListener() {}, removeEventListener() {}, createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }) };
globalThis.window = {
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}`, thread: (id) => `inbox/${id}` } },
  appNavigate: (to) => went.push(to),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  removeEventListener() {},
  dispatchEvent() { return true; },
  setTimeout: () => 1,
  clearTimeout() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead"]) globalThis[k] = globalThis.window[k];
globalThis.window.usePPToast = () => [null, () => {}];
// The bridge's own object, with its reads answered here.
const { calendar } = await import("../../../apps/dashboard/src/legacy-bridge/calendar.ts");
await import("../../../apps/dashboard/src/legacy/pages/calendar-real.jsx");

const walk = (n, fn) => { if (n == null || typeof n !== "object") return; fn(n); for (const k of n.props?.children ?? []) walk(k, fn); if (n.rendered) walk(n.rendered, fn); };
const all = (tree, pred) => { const out = []; walk(tree, (n) => { if (pred(n)) out.push(n); }); return out; };
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => { const out = []; walk(n, (x) => { for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k)); }); return out.join(""); };
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 6) => { for (let i = 0; i < n; i += 1) await tick(); };

let reads = [];
let homes = 0;
/** A fresh page over `week`: each read the page asks for answers the next of `answers` (true once they run out). */
const fresh = (week = dto(), answers = []) => {
  cells = [];
  cleanups = [];
  reads = [];
  homes = 0;
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.window.__CALENDAR = { vm: toCalendarVM(week, NOW) };
  globalThis.window.__calendar = {
    ...calendar,
    ensure: (view, anchor) => { reads.push([view, anchor]); return Promise.resolve(answers.length ? answers.shift() : true); },
    refresh: async () => {},
    home: async () => { homes += 1; return true; },
  };
};
/** The page goes away: what its effects handed back runs, last first. */
const leave = () => { for (const done of cleanups.splice(0).reverse()) done(); };
/** Draw the page again over the same cells; the board's five-minute timer is not started for real. */
const page = (props = {}) => {
  seq = 0;
  const [si, ci] = [globalThis.setInterval, globalThis.clearInterval];
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  try { return globalThis.window.CalendarPage(props); } finally { globalThis.setInterval = si; globalThis.clearInterval = ci; }
};
/** A key pressed on the page, as the window hears it; whether the page took it. */
const press = (key) => {
  let taken = false;
  for (const fn of listeners.keydown ?? []) fn({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, preventDefault() { taken = true; } });
  return taken;
};
const stats = (tree) => all(tree, (n) => n.type === globalThis.StatCell);

test("REGRESSION (D14): an appointment opens as a dialog named by its title; Escape closes it, and the board holds still behind it", () => {
  fresh();
  let tree = page();
  const range = () => textOf(byTestId(tree, "cal-range"));
  assert.equal(range(), "Sep 7 – 13");
  const block = byTestId(tree, "cal-block");
  assert.ok(block, "Tuesday's appointment is on the board");
  block.props.onClick();
  tree = page();
  const panel = byTestId(tree, "cal-panel");
  assert.ok(panel, "the panel opened");
  assert.equal(panel.props.role, "dialog");
  assert.equal(panel.props["aria-modal"], "true");
  assert.equal(panel.props.tabIndex, -1, "focus can be put on the dialog itself as it opens");
  assert.equal(typeof panel.props.onKeyDown, "function", "the dialog keeps Tab to itself");
  const title = find(tree, (n) => n !== panel && n.props?.id && n.props.id === panel.props["aria-labelledby"]);
  assert.ok(title, "the dialog is named by an element on it");
  assert.equal(textOf(title), "Ana Ruiz · Color");

  press("ArrowRight");
  tree = page();
  assert.equal(range(), "Sep 7 – 13", "REGRESSION: the arrows moved the week behind an open appointment");
  assert.ok(byTestId(tree, "cal-panel"), "and the appointment stays open");

  assert.equal(press("Escape"), true, "Escape is the dialog's");
  tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null, "Escape closes it");

  press("ArrowRight");
  tree = page();
  assert.equal(range(), "Sep 14 – 20", "with nothing open the arrows move the board again");
});

test("Tab and Shift+Tab walk the dialog's own controls and wrap, so focus never leaves an open appointment for the board behind it", () => {
  const trap = globalThis.window.crTrapTab;
  assert.equal(typeof trap, "function", "the trap is one rule that can be run");
  const focused = [];
  const el = (name) => ({ name, focus() { focused.push(name); } });
  const [first, middle, last] = [el("Open in People"), el("Copy the booking link"), el("Close")];
  const box = { querySelectorAll: () => [first, middle, last], focus() { focused.push("dialog"); } };
  const tab = (at, shiftKey = false) => {
    let prevented = false;
    globalThis.document.activeElement = at;
    trap({ key: "Tab", shiftKey, preventDefault() { prevented = true; } }, box);
    return prevented;
  };
  try {
    assert.equal(tab(last), true);
    assert.deepEqual(focused.splice(0), ["Open in People"], "past the last control, round to the first");
    assert.equal(tab(first, true), true);
    assert.deepEqual(focused.splice(0), ["Close"], "before the first, round to the last");
    assert.equal(tab(box, true), true);
    assert.deepEqual(focused.splice(0), ["Close"], "from the dialog itself, Shift+Tab takes the last control");
    assert.equal(tab(middle), false);
    assert.deepEqual(focused, [], "in between, the browser's own order");
  } finally {
    globalThis.document.activeElement = null;
  }
});

test("REGRESSION (B11): days that could not be read say so with a Retry, and are not left dimmed as if still loading -- a toast said it once and faded", async () => {
  // A window that starts a week after today's: today's week has to be read.
  const later = dto({ from: "2026-09-14", to: "2026-09-20" });
  later.days = later.days.map((d, i) => ({ key: shiftKey("2026-09-14", i), items: [], windows: [] }));
  fresh(later, [false, false, true]);
  let tree = page();
  await settle();
  tree = page();
  assert.equal(reads.length, 1, "one read for the days the window lacks");
  const failed = byTestId(tree, "cal-failed");
  assert.ok(failed, "the page says the days could not be read");
  assert.match(textOf(failed), /Couldn't read those days/);
  const cols = all(tree, (n) => n.props?.["data-testid"] === "cal-col");
  assert.equal(cols.length, 7);
  assert.ok(cols.every((c) => !/\bloading\b/.test(c.props.className)), `REGRESSION: unread days stayed dimmed as loading: ${cols.map((c) => c.props.className).join(" | ")}`);
  assert.equal(stats(tree)[0].props.value, "—", "a count over days that could not be read is not a count");

  byTestId(tree, "cal-failed-retry").props.onClick();
  await settle();
  tree = page();
  assert.equal(reads.length, 2, "Retry reads again");
  assert.ok(byTestId(tree, "cal-failed"), "a second failure still says so");

  byTestId(tree, "cal-failed-retry").props.onClick();
  await settle();
  tree = page();
  assert.equal(reads.length, 3);
  assert.equal(byTestId(tree, "cal-failed"), null, "a read that lands takes the line away");
});

test("REGRESSION (B12): the strip names the days on screen -- it said 'This week' of next week and 'This month' of any month", () => {
  fresh();
  let tree = page();
  const label = () => stats(tree)[0].props.label;
  const go = (id) => { byTestId(tree, id).props.onClick(); tree = page(); };
  assert.equal(label(), "This week");
  go("cal-next");
  assert.equal(label(), "Week of Sep 14");
  go("cal-today");
  assert.equal(label(), "This week");
  go("cal-view-month");
  assert.equal(label(), "This month");
  go("cal-next");
  assert.equal(label(), "October 2026");
  go("cal-today");
  go("cal-view-agenda");
  assert.equal(label(), "Next 14 days");
  go("cal-next");
  assert.equal(label(), "14 days from Sep 22");
  go("cal-today");
  go("cal-view-day");
  assert.equal(label(), "Today");
  go("cal-next");
  assert.equal(label(), "Wed · Sep 9");
});

test("the booking rules come as parts, and a read's unfollowable repeats and undrawn events are explained, with their numbers (B24, B25)", () => {
  const counted = (skipped, dropped) => dto({ feed: { ...dto().feed, skipped_recurring: skipped, dropped } });
  const vm = toCalendarVM(counted(2, 3), NOW);
  assert.deepEqual(vm.ruleParts, ["at least 2h ahead", "15 min between appointments", "up to 14 days out", "30-min slots"]);
  assert.equal(vm.rules, "Offers times at least 2h ahead · 15 min between appointments · up to 14 days out · 30-min slots", "the sentence stays for whoever reads it whole");
  assert.deepEqual([vm.feed.skippedRecurring, vm.feed.dropped], [2, 3]);
  assert.deepEqual(vm.feed.notes.map((n) => [n.id, n.title]), [["repeats", "2 repeating events count only once."], ["undrawn", "3 more events aren't drawn."]]);
  assert.match(vm.feed.notes[0].body, /only the first date is treated as taken/);
  assert.match(vm.feed.notes[1].body, /still treats their times as taken/);
  assert.deepEqual(toCalendarVM(counted(1, 1), NOW).feed.notes.map((n) => n.title), ["1 repeating event counts only once.", "1 more event isn't drawn."]);
  const clean = toCalendarVM(dto(), NOW);
  assert.deepEqual([clean.feed.skippedRecurring, clean.feed.dropped, clean.feed.notes], [0, 0, []], "a read that left nothing out says nothing");
  const unread = toCalendarVM(dto({ feed: { present: true, state: "unavailable", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 4, dropped: 2 } }), NOW);
  assert.deepEqual(unread.feed.notes, [], "nothing to explain about a read that did not happen");

  fresh(counted(2, 3));
  const tree = page();
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "cal-rule").map(textOf), vm.ruleParts, "each rule its own part, so a narrow screen wraps between rules, never inside one");
  assert.ok(byTestId(tree, "cal-feed-note-repeats"), "the repeats explained on the page");
  assert.ok(byTestId(tree, "cal-feed-note-undrawn"), "the undrawn events explained on the page");
  const next = stats(tree).find((c) => c.props.label === "Next opening");
  assert.equal(next.props.meta, "at least 2h ahead", "the rule that decides how soon, not the whole sentence under a number");
});

test("REGRESSION (B28): a phone opens on the agenda -- it opened on a week grid four times the screen's width", () => {
  fresh();
  globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
  try {
    const tree = page();
    assert.equal(byTestId(tree, "cal-view-agenda").props["aria-pressed"], true);
    assert.ok(byTestId(tree, "cal-agenda"), "the days as a list");
    assert.equal(byTestId(tree, "cal-col"), null, "no week grid");
  } finally {
    delete globalThis.window.matchMedia;
  }
  fresh();
  assert.equal(byTestId(page(), "cal-view-week").props["aria-pressed"], true, "a desk keeps the week");
});

test("a link can name a day: the page opens it in Day view, on a phone too", () => {
  fresh();
  globalThis.window.matchMedia = () => ({ matches: true });
  try {
    const tree = page({ initialDay: "2026-09-10" });
    assert.equal(byTestId(tree, "cal-view-day").props["aria-pressed"], true);
    assert.equal(textOf(byTestId(tree, "cal-range")), "Thu · Sep 10");
  } finally {
    delete globalThis.window.matchMedia;
  }
});

test("REGRESSION (B19): a sentence that sends the owner to the calendar's address names the tab it is on -- Settings › Business, not Settings › Workspace", () => {
  assert.equal(toBookingReportVM(null).sub, "Connect your calendar under Settings › Business to see who booked.");
  fresh(dto({ feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 } }));
  const none = textOf(byTestId(page(), "cal-feed-card"));
  assert.ok(none.includes("Settings › Business") && !none.includes("Settings › Workspace"), none);
  fresh(dto({ feed: { present: true, state: "unavailable", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 } }));
  const unread = textOf(byTestId(page(), "cal-feed-card"));
  assert.ok(unread.includes("Settings › Business") && !unread.includes("Settings › Workspace"), unread);
});

/* ------------------- C1: what the page says is true wherever it looks ------------------- */

// `n` empty days from `from`, in the route's shape, keeping the week's hours, closures and rules unless told otherwise.
const span = (from, n, over = {}) => ({
  ...dto(),
  from,
  to: shiftKey(from, n - 1),
  days: Array.from({ length: n }, (_, i) => ({ key: shiftKey(from, i), items: [], windows: [] })),
  ...over,
});
/** The receptionist's next open time as the route sends it: when it starts, or none. */
const opening = (start) => ({ next_opening: start ? { start, end: start } : null });

test("REGRESSION (C1): Next opening is the receptionist's first open time from now, wherever the board is looking, and names its day past this week -- it came from the loaded weeks and said only a weekday", () => {
  const next = (start, over = {}) => toCalendarVM(dto({ ...opening(start), ...over }), NOW).stats.next;
  assert.equal(next("2026-09-08T19:30:00.000Z"), "today 3:30 PM");
  assert.equal(next("2026-09-09T14:00:00.000Z"), "tomorrow 10 AM");
  assert.equal(next("2026-09-11T14:00:00.000Z"), "Fri 10 AM", "this week, the weekday is enough");
  assert.equal(next("2026-09-14T14:00:00.000Z"), "Mon 10 AM");
  assert.equal(next("2026-09-17T14:00:00.000Z"), "Sep 17, 10 AM", "REGRESSION: past this week a weekday alone named a day a week too soon");
  assert.equal(next(null), "—", "nothing it would offer is a dash, whatever the loaded days hold");
  assert.equal(next("2026-09-09T14:00:00.000Z", { feed: { ...dto().feed, state: "unavailable" } }), "—", "a calendar that can't be read offers nothing");
  const december = span("2026-11-23", 63, opening("2026-09-09T14:00:00.000Z"));
  assert.equal(toCalendarVM(december, NOW).stats.next, "tomorrow 10 AM", "REGRESSION: a board looking at December worked the next opening out from December");
});

test("(C1) the last day the receptionist offers is named, and every day past it knows it is", () => {
  const vm = toCalendarVM(span("2026-09-07", 28), NOW);
  assert.deepEqual(vm.offer, { days: 14, until: "2026-09-21", label: "Sep 21" }, "up to 14 days out, from today");
  const beyond = (key) => vm.days.find((d) => d.key === key).beyondOffer;
  assert.deepEqual(["2026-09-07", "2026-09-08", "2026-09-21", "2026-09-22", "2026-10-04"].map(beyond), [false, false, false, true, true]);
  assert.deepEqual(toCalendarVM(span("2026-09-07", 7, { rules: null }), NOW).offer, { days: 14, until: "2026-09-21", label: "Sep 21" }, "no rules on file: the default");
  assert.equal(toCalendarVM(span("2026-09-07", 7, { rules: { max_days_ahead: 3 } }), NOW).offer.until, "2026-09-10");
});

test("REGRESSION (C1): the booking rules the receptionist follows are all on the page -- the party size and the services that need a consultation first were never said, and closures past the sixth vanished", () => {
  const rules = { lead_hours: 2, buffer_min: 15, max_days_ahead: 14, party_max: 6, consult_first: ["Balayage", "Color correction"] };
  const closures = Array.from({ length: 8 }, (_, i) => ({ date: shiftKey("2026-09-19", i * 7), note: i === 0 ? "Wedding" : null }));
  const vm = toCalendarVM(dto({ rules, closures }), NOW);
  assert.deepEqual(vm.ruleParts, ["at least 2h ahead", "15 min between appointments", "up to 14 days out", "30-min slots", "up to 6 people per booking"]);
  assert.deepEqual(vm.consultFirst, ["Balayage", "Color correction"]);
  assert.deepEqual(toCalendarVM(dto(), NOW).consultFirst, [], "none on file, none said");
  assert.deepEqual([vm.closuresAhead.length, vm.closuresMore], [6, 2]);
  assert.equal(toCalendarVM(dto(), NOW).closuresMore, 0);
  fresh(dto({ rules, closures }));
  const tree = page();
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "cal-rule").map(textOf), vm.ruleParts, "REGRESSION: the party size was never said");
  const consult = textOf(byTestId(tree, "cal-rules-consult"));
  assert.ok(consult.includes("Consultation first") && consult.includes("Balayage · Color correction"), `REGRESSION: which services need a consultation was said only inside the service picker: ${consult}`);
  assert.match(textOf(byTestId(tree, "cal-rules")), /\+2 more/, "REGRESSION: the closures past the sixth vanished without a word");
});

test("REGRESSION (C1): the feed line says what was read and leaves what was left out to the notes -- it also said '2 repeating rules read once · 3 more not shown', unexplained, beside the notes that explain them", () => {
  const vm = toCalendarVM(dto({ feed: { ...dto().feed, skipped_recurring: 2, dropped: 3 } }), NOW);
  assert.equal(vm.feed.line, "From your calendar · read 2m ago · 4 events");
  assert.deepEqual(vm.feed.notes.map((n) => n.id), ["repeats", "undrawn"], "said once, in words the owner can act on");
});

test("REGRESSION (C1): the strip counts only what it read -- an unreadable calendar showed '0 · on your calendar', and days still on their way counted as empty", () => {
  const empty = dto().days.map((d) => ({ ...d, items: [], windows: [] }));
  fresh(dto({ feed: { present: true, state: "unavailable", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 }, days: empty }));
  let strip = stats(page());
  assert.deepEqual([strip[0].props.value, strip[0].props.meta], ["—", "couldn't be read"], "REGRESSION: '0 · on your calendar' beside 'Your calendar could not be read'");
  fresh(dto({ feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 }, days: empty }));
  strip = stats(page());
  assert.deepEqual([strip[0].props.value, strip[0].props.meta], ["—", "no calendar connected"]);
  fresh();
  let tree = page();
  byTestId(tree, "cal-next").props.onClick();
  tree = page();
  strip = stats(tree);
  assert.deepEqual([strip[0].props.value, strip[0].props.meta], ["—", "reading those days"], "REGRESSION: next week, still on its way, said nothing was on the calendar");
  assert.deepEqual([strip[1].props.value, strip[1].props.meta], ["—", "reading those days"]);
});

test("REGRESSION (C1): a day past what the receptionist offers says so, and the legend names the last day it offers -- the agenda said 'nothing the receptionist would offer', as if the day were booked solid", () => {
  fresh(span("2026-09-07", 42, { rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 7 } }));
  let tree = page();
  byTestId(tree, "cal-view-agenda").props.onClick();
  tree = page();
  const day = (key) => textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day").find((n) => n.props.key === key));
  assert.match(day("2026-09-15"), /not offered yet — it offers times up to 7 days out/, "REGRESSION: a day past the offer read as a day with nothing to offer");
  assert.ok(!day("2026-09-15").includes("nothing the receptionist would offer"));
  assert.match(day("2026-09-10"), /nothing the receptionist would offer/, "a day inside the offer with no times still says that");
  assert.match(textOf(byTestId(tree, "cal-legend")), /through Sep 14/, "the legend names the last day it offers");
  byTestId(tree, "cal-next").props.onClick();
  tree = page();
  const ahead = stats(tree)[1];
  assert.deepEqual([ahead.props.value, ahead.props.meta], ["—", "it offers times up to 7 days out"], "REGRESSION: '0 · it would offer these' for two weeks it offers nothing in");
  byTestId(tree, "cal-view-day").props.onClick();
  tree = page();
  byTestId(tree, "cal-today").props.onClick();
  tree = page();
  byTestId(tree, "cal-prev").props.onClick();
  tree = page();
  const gone = stats(tree)[1];
  assert.deepEqual([gone.props.value, gone.props.meta], ["—", "these days have passed"]);
});

test("REGRESSION (C1): leaving the Calendar takes the loaded weeks back to today's -- a board left on another month took Today's day and its next opening with it", async () => {
  fresh();
  page();
  assert.equal(homes, 0, "nothing goes home while the page is open");
  leave();
  assert.equal(homes, 1, "REGRESSION: the page left the window wherever it had moved it");
  // The bridge's half: a moved window goes home; one already home is not read again.
  const { getCalendarSpan, setCalendarSpan } = await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
  globalThis.window.__CALENDAR = { vm: toCalendarVM(span("2026-08-31", 63), NOW) };
  setCalendarSpan("2026-11-23", 63);
  assert.equal(await calendar.home(), true, "a window moved to November goes home");
  assert.equal(getCalendarSpan().from, null, "to the weeks around today");
  assert.equal(await calendar.home(), false, "and a window already home stays as it is");
});

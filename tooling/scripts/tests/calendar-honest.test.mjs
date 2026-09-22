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
 * - C2, the page's states: the board read itself every five minutes and offered no way to ask sooner; a calendar that
 *   could not be read sent the owner to Settings with no Try again; days on their way only dimmed; and nothing said
 *   when the calendar was last tried.
 * - C3, one word per thing: the times it would offer were "open windows" on the strip and "next opening" on Today,
 *   beside Business's open times; the rules bar said "Rules" and "Edit in Settings"; hours read 09:00–18:00 over a
 *   board in 9 AM; the zone was America/New_York; the feed's state was a coloured dot here and "Readable" on
 *   Connections; one failed read had three wordings; and the agenda said the receptionist books a consultation.
 * - C4, reach: a day's head was a clickable div no keyboard reached; a month day and an appointment named no date to a
 *   screen reader, and nothing said which day was today; a move of the board changed the range in silence; and a phone
 *   was shown the arrow keys.
 * Run against the contracts, the bridge's arithmetic and the page on a stub React.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hoursLines, shiftKey, stateOf, toBookingReportVM, toCalendarVM, todayDay } from "@chanlytics/contracts";

const TZ = "America/New_York";
// Tuesday noon in New York, the week calendar.test.mjs draws.
const NOW = new Date("2026-09-08T16:00:00.000Z");

// The week as calendar.test.mjs builds it, in the route's shape.
function dto(over = {}) {
  const from = "2026-09-07";
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ key: shiftKey(from, i), items: [], windows: [] });
  days[1].items.push({
    id: "e1",
    start: "2026-09-08T18:00:00.000Z",
    end: "2026-09-08T19:30:00.000Z",
    title: "Ana Ruiz · Color",
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
// What the page said in a toast, newest last.
let toasts = [];
// Effects run once, as most of these tests want; a test that needs one to follow its dependencies, as React's do, sets this.
let honourDeps = false;
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
  useState: (init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = seq++;
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  // Once per effect; with honourDeps, an effect whose dependencies changed runs again, its last cleanup first.
  useEffect: (fn, deps) => {
    const k = seq++;
    const prev = cells[k];
    const moved =
      honourDeps &&
      !!prev &&
      Array.isArray(deps) &&
      Array.isArray(prev.deps) &&
      deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (k in cells && !moved) return;
    if (moved && typeof prev.cleanup === "function") prev.cleanup();
    const cell = { deps };
    cells[k] = cell;
    const done = fn();
    if (typeof done === "function") {
      cell.cleanup = done;
      cleanups.push(done);
    }
  },
  useCallback: (fn) => fn,
};
globalThis.ReactDOM = { createPortal: (node) => node };
globalThis.document = {
  body: {},
  activeElement: null,
  visibilityState: "visible",
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  CHANLY: { nav: (to) => went.push(to), R: { admin: (pane) => `admin/${pane}`, thread: (id) => `inbox/${id}` } },
  appNavigate: (to) => went.push(to),
  __surfaceState: () => "live",
  __DEMO_MODE: false,
  addEventListener: (type, fn) => {
    (listeners[type] ||= []).push(fn);
  },
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  setTimeout: () => 1,
  clearTimeout() {},
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"])
  globalThis[k] = globalThis.window[k];
// One appointment on a list, the row Today's day and the agenda both wear.
await import("../../../apps/dashboard/src/legacy/components/day-agenda.jsx");
for (const k of ["AgendaItem", "AgendaItems", "AgendaOpen"]) globalThis[k] = globalThis.window[k];
globalThis.window.usePPToast = () => [null, (t) => toasts.push(t)];
// A pill's tone and words are contracts', as the shell's chrome bridge publishes them.
globalThis.window.__chrome = { state: stateOf };
// The bridge's own object, with its reads answered here.
const { calendar } = await import("../../../apps/dashboard/src/legacy-bridge/calendar.ts");
await import("../../../apps/dashboard/src/legacy/pages/calendar-real.jsx");
// Today's day, which names the next open time the way the Calendar does.
await import("../../../apps/dashboard/src/legacy/pages/dashboard-a-day.jsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  if (n.rendered) walk(n.rendered, fn);
};
const all = (tree, pred) => {
  const out = [];
  walk(tree, (n) => {
    if (pred(n)) out.push(n);
  });
  return out;
};
const find = (tree, pred) => all(tree, pred)[0] ?? null;
const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);
const textOf = (n) => {
  const out = [];
  walk(n, (x) => {
    for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k));
  });
  return out.join("");
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await tick();
};

let reads = [];
let homes = 0;
/** A fresh page over `week`: each read the page asks for answers the next of `answers` (true once they run out). */
const fresh = (week = dto(), answers = []) => {
  cells = [];
  cleanups = [];
  reads = [];
  homes = 0;
  toasts = [];
  for (const k of Object.keys(listeners)) delete listeners[k];
  globalThis.window.__CALENDAR = { vm: toCalendarVM(week, NOW) };
  globalThis.window.__calendar = {
    ...calendar,
    ensure: (view, anchor) => {
      reads.push([view, anchor]);
      return Promise.resolve(answers.length ? answers.shift() : true);
    },
    refresh: async () => {},
    home: async () => {
      homes += 1;
      return true;
    },
  };
};
/** The page goes away: what its effects handed back runs, last first. */
const leave = () => {
  for (const done of cleanups.splice(0).reverse()) done();
};
/** Draw the page again over the same cells; the board's five-minute timer is not started for real. */
const page = (props = {}) => {
  seq = 0;
  const [si, ci] = [globalThis.setInterval, globalThis.clearInterval];
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  try {
    return globalThis.window.CalendarPage(props);
  } finally {
    globalThis.setInterval = si;
    globalThis.clearInterval = ci;
  }
};
/** A key pressed on the page, as the window hears it; whether the page took it. */
const press = (key) => {
  let taken = false;
  for (const fn of listeners.keydown ?? [])
    fn({
      key,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault() {
        taken = true;
      },
    });
  return taken;
};
/** The three counts over the board, in their order: what is on the calendar, the open times, the next open time. */
const stats = (tree) => ["cal-count-taken", "cal-count-open", "cal-count-next"].map((id) => byTestId(tree, id));

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
  const el = (name) => ({
    name,
    focus() {
      focused.push(name);
    },
  });
  const [first, middle, last] = [el("Open in People"), el("Copy the booking link"), el("Close")];
  const box = {
    querySelectorAll: () => [first, middle, last],
    focus() {
      focused.push("dialog");
    },
  };
  const tab = (at, shiftKey = false) => {
    let prevented = false;
    globalThis.document.activeElement = at;
    trap(
      {
        key: "Tab",
        shiftKey,
        preventDefault() {
          prevented = true;
        },
      },
      box,
    );
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
  assert.ok(
    cols.every((c) => !/\bloading\b/.test(c.props.className)),
    `REGRESSION: unread days stayed dimmed as loading: ${cols.map((c) => c.props.className).join(" | ")}`,
  );
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
  const go = (id) => {
    byTestId(tree, id).props.onClick();
    tree = page();
  };
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
  assert.deepEqual(vm.ruleParts, [
    "at least 2h notice",
    "15 min between appointments",
    "up to 14 days ahead",
    "30-min slots",
  ]);
  assert.equal(
    vm.rules,
    "Offers times with at least 2h notice · 15 min between appointments · up to 14 days ahead · 30-min slots",
    "the sentence stays for whoever reads it whole",
  );
  assert.deepEqual([vm.feed.skippedRecurring, vm.feed.dropped], [2, 3]);
  assert.deepEqual(
    vm.feed.notes.map((n) => [n.id, n.title]),
    [
      ["repeats", "2 repeating events count only once."],
      ["undrawn", "3 more events aren't drawn."],
    ],
  );
  assert.match(vm.feed.notes[0].body, /only the first date is treated as taken/);
  assert.match(vm.feed.notes[1].body, /still treats their times as taken/);
  assert.deepEqual(
    toCalendarVM(counted(1, 1), NOW).feed.notes.map((n) => n.title),
    ["1 repeating event counts only once.", "1 more event isn't drawn."],
  );
  const clean = toCalendarVM(dto(), NOW);
  assert.deepEqual(
    [clean.feed.skippedRecurring, clean.feed.dropped, clean.feed.notes],
    [0, 0, []],
    "a read that left nothing out says nothing",
  );
  const unread = toCalendarVM(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 4,
        dropped: 2,
      },
    }),
    NOW,
  );
  assert.deepEqual(unread.feed.notes, [], "nothing to explain about a read that did not happen");

  fresh(counted(2, 3));
  const tree = page();
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "cal-rule").map(textOf),
    vm.ruleParts,
    "each rule its own part, so a narrow screen wraps between rules, never inside one",
  );
  assert.ok(byTestId(tree, "cal-feed-note-repeats"), "the repeats explained on the page");
  assert.ok(byTestId(tree, "cal-feed-note-undrawn"), "the undrawn events explained on the page");
  const next = stats(tree).find((c) => c.props.label === "Next open time");
  assert.equal(
    next.props.note,
    "at least 2h notice",
    "the rule that decides how soon, not the whole sentence under a number",
  );
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

test("the agenda's rows ARE Today's rows, and a customer is named once: it drew its own grid, the event's whole title, and the name again under it", () => {
  fresh();
  globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
  let tree;
  try {
    tree = page();
  } finally {
    delete globalThis.window.matchMedia;
  }
  const row = all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-item")[0];
  assert.ok(row, "the agenda draws rows");
  // The shared row (components/day-agenda.jsx), not a second one of the Calendar's own.
  const cls = (n) => String((n && (n.rendered || n).props?.className) || "");
  assert.match(cls(row), /\bag-item\b/, "the one row every list of appointments wears");
  assert.equal(
    all(tree, (n) => /\bcal-agenda-item\b/.test(cls(n))).length,
    0,
    "REGRESSION: the Calendar drew its own row beside Today's",
  );
  const part = (c) => textOf(find(row, (n) => cls(n).split(" ").includes(c)));
  assert.equal(part("ag-item-name"), "Ana Ruiz", "who it is for, first");
  assert.equal(
    part("ag-item-sub"),
    "Color · 1h 30m",
    "REGRESSION: what it is FOR and how long -- the event is titled 'Ana Ruiz · Color', and the row printed that whole title and then her name again",
  );
  assert.equal(textOf(row).split("Ana Ruiz").length - 1, 1, "REGRESSION: her name was on the row twice");
  // An appointment nobody is matched to has the service as its headline and nothing under it but the length.
  const allDay = all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-item").find((n) =>
    textOf(n).includes("Team training"),
  );
  assert.ok(allDay, "the all-day entry is on the list");
  assert.equal(textOf(find(allDay, (n) => cls(n).split(" ").includes("ag-item-name"))), "Team training");
  assert.ok(!find(allDay, (n) => cls(n).split(" ").includes("ag-item-sub")), "no service line of its own");
  assert.equal(textOf(allDay).trim(), "All dayTeam training", "the time column, then the entry: nothing else");
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
  fresh(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    }),
  );
  const none = textOf(byTestId(page(), "cal-feed-card"));
  assert.ok(none.includes("Settings › Business") && !none.includes("Settings › Workspace"), none);
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
  );
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
  assert.equal(
    next("2026-09-17T14:00:00.000Z"),
    "Sep 17, 10 AM",
    "REGRESSION: past this week a weekday alone named a day a week too soon",
  );
  assert.equal(next(null), "—", "nothing it would offer is a dash, whatever the loaded days hold");
  assert.equal(
    next("2026-09-09T14:00:00.000Z", { feed: { ...dto().feed, state: "unavailable" } }),
    "—",
    "a calendar that can't be read offers nothing",
  );
  const december = span("2026-11-23", 63, opening("2026-09-09T14:00:00.000Z"));
  assert.equal(
    toCalendarVM(december, NOW).stats.next,
    "tomorrow 10 AM",
    "REGRESSION: a board looking at December worked the next opening out from December",
  );
});

test("(C1) the last day the receptionist offers is named, and every day past it knows it is", () => {
  const vm = toCalendarVM(span("2026-09-07", 28), NOW);
  assert.deepEqual(vm.offer, { days: 14, until: "2026-09-21", label: "Sep 21" }, "up to 14 days out, from today");
  const beyond = (key) => vm.days.find((d) => d.key === key).beyondOffer;
  assert.deepEqual(["2026-09-07", "2026-09-08", "2026-09-21", "2026-09-22", "2026-10-04"].map(beyond), [
    false,
    false,
    false,
    true,
    true,
  ]);
  assert.deepEqual(
    toCalendarVM(span("2026-09-07", 7, { rules: null }), NOW).offer,
    { days: 14, until: "2026-09-21", label: "Sep 21" },
    "no rules on file: the default",
  );
  assert.equal(toCalendarVM(span("2026-09-07", 7, { rules: { max_days_ahead: 3 } }), NOW).offer.until, "2026-09-10");
});

test("REGRESSION (C1): the booking rules the receptionist follows are all on the page -- the party size and the services that need a consultation first were never said, and closures past the sixth vanished", () => {
  const rules = {
    lead_hours: 2,
    buffer_min: 15,
    max_days_ahead: 14,
    party_max: 6,
    consult_first: ["Balayage", "Color correction"],
  };
  const closures = Array.from({ length: 8 }, (_, i) => ({
    date: shiftKey("2026-09-19", i * 7),
    note: i === 0 ? "Wedding" : null,
  }));
  const vm = toCalendarVM(dto({ rules, closures }), NOW);
  assert.deepEqual(vm.ruleParts, [
    "at least 2h notice",
    "15 min between appointments",
    "up to 14 days ahead",
    "30-min slots",
    "up to 6 people per booking",
  ]);
  assert.deepEqual(vm.consultFirst, ["Balayage", "Color correction"]);
  assert.deepEqual(toCalendarVM(dto(), NOW).consultFirst, [], "none on file, none said");
  assert.deepEqual([vm.closuresAhead.length, vm.closuresMore], [6, 2]);
  assert.equal(toCalendarVM(dto(), NOW).closuresMore, 0);
  fresh(dto({ rules, closures }));
  const tree = page();
  assert.deepEqual(
    all(tree, (n) => n.props?.["data-testid"] === "cal-rule").map(textOf),
    vm.ruleParts,
    "REGRESSION: the party size was never said",
  );
  const consult = textOf(byTestId(tree, "cal-rules-consult"));
  assert.ok(
    consult.includes("Consultation first") && consult.includes("Balayage · Color correction"),
    `REGRESSION: which services need a consultation was said only inside the service picker: ${consult}`,
  );
  assert.match(
    textOf(byTestId(tree, "cal-rules")),
    /\+2 more/,
    "REGRESSION: the closures past the sixth vanished without a word",
  );
});

test("REGRESSION (C1): the feed line says what was read and leaves what was left out to the notes -- it also said '2 repeating rules read once · 3 more not shown', unexplained, beside the notes that explain them", () => {
  const vm = toCalendarVM(dto({ feed: { ...dto().feed, skipped_recurring: 2, dropped: 3 } }), NOW);
  assert.equal(vm.feed.line, "From your calendar · read 2m ago · 4 events");
  assert.deepEqual(
    vm.feed.notes.map((n) => n.id),
    ["repeats", "undrawn"],
    "said once, in words the owner can act on",
  );
});

test("REGRESSION (C1): the strip counts only what it read -- an unreadable calendar showed '0 · on your calendar', and days still on their way counted as empty", () => {
  const empty = dto().days.map((d) => ({ ...d, items: [], windows: [] }));
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
      days: empty,
    }),
  );
  let strip = stats(page());
  assert.deepEqual(
    [strip[0].props.value, strip[0].props.meta],
    ["—", "could not be read"],
    "REGRESSION: '0 · on your calendar' beside 'Your calendar could not be read'",
  );
  fresh(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
      days: empty,
    }),
  );
  strip = stats(page());
  assert.deepEqual([strip[0].props.value, strip[0].props.meta], ["—", "no calendar connected"]);
  fresh();
  let tree = page();
  byTestId(tree, "cal-next").props.onClick();
  tree = page();
  strip = stats(tree);
  assert.deepEqual(
    [strip[0].props.value, strip[0].props.meta],
    ["—", "reading those days"],
    "REGRESSION: next week, still on its way, said nothing was on the calendar",
  );
  assert.deepEqual([strip[1].props.value, strip[1].props.meta], ["—", "reading those days"]);
});

test("REGRESSION (C1): a day past what the receptionist offers says so, and the legend names the last day it offers -- the agenda said 'nothing the receptionist would offer', as if the day were booked solid", () => {
  fresh(span("2026-09-07", 42, { rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 7 } }));
  let tree = page();
  byTestId(tree, "cal-view-agenda").props.onClick();
  tree = page();
  const day = (key) =>
    textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day").find((n) => n.props.key === key));
  assert.match(
    day("2026-09-15"),
    /not offered yet — it offers times up to 7 days ahead/,
    "REGRESSION: a day past the offer read as a day with nothing to offer",
  );
  assert.ok(!day("2026-09-15").includes("nothing the receptionist would offer"));
  assert.match(
    day("2026-09-10"),
    /nothing the receptionist would offer/,
    "a day inside the offer with no times still says that",
  );
  assert.match(textOf(byTestId(tree, "cal-legend")), /through Sep 14/, "the legend names the last day it offers");
  byTestId(tree, "cal-next").props.onClick();
  tree = page();
  const ahead = stats(tree)[1];
  assert.deepEqual(
    [ahead.props.value, ahead.props.meta],
    ["—", "it offers times up to 7 days ahead"],
    "REGRESSION: '0 · it would offer these' for two weeks it offers nothing in",
  );
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
  const { getCalendarSpan, setCalendarSpan } =
    await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
  globalThis.window.__CALENDAR = { vm: toCalendarVM(span("2026-08-31", 63), NOW) };
  setCalendarSpan("2026-11-23", 63);
  assert.equal(await calendar.home(), true, "a window moved to November goes home");
  assert.equal(getCalendarSpan().from, null, "to the weeks around today");
  assert.equal(await calendar.home(), false, "and a window already home stays as it is");
});

/* ------------------- C2: refresh, loading, and a calendar that can't be read ------------------- */

test("(C2) the feed line says when the calendar was last tried where that is the news: a read that failed, and a refresh that couldn't reach it", () => {
  const tried = "2026-09-08T15:57:00.000Z"; // three minutes before NOW
  const down = toCalendarVM(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: "2026-09-08T12:00:00.000Z",
        checked_at: tried,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
    NOW,
  );
  assert.equal(down.feed.line, "Your calendar could not be read · tried 3m ago · last read 4h ago");
  const never = toCalendarVM(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        checked_at: tried,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
    NOW,
  );
  assert.equal(never.feed.line, "Your calendar could not be read · tried 3m ago", "never read: only when it was tried");
  const stale = toCalendarVM(dto({ feed: { ...dto().feed, stale: true, reason: "http", checked_at: tried } }), NOW);
  assert.ok(stale.feed.line.includes("· could not be refreshed 3m ago ·"), stale.feed.line);
  assert.equal(
    toCalendarVM(dto({ feed: { ...dto().feed, checked_at: tried } }), NOW).feed.line,
    "From your calendar · read 2m ago · 4 events",
    "a good read says when it read, nothing more",
  );
});

test("REGRESSION (C2): the feed line has a Refresh that reads the calendar afresh and says what came of it -- the board read itself every five minutes and offered no way to ask sooner", async () => {
  fresh();
  const asked = [];
  let release = null;
  globalThis.window.__calendar.refresh = (opts) => {
    asked.push(opts);
    return new Promise((r) => {
      release = r;
    });
  };
  let tree = page();
  const button = () => byTestId(tree, "cal-refresh");
  assert.ok(button(), "REGRESSION: no way to read the calendar again");
  const pressed = button().props.onClick();
  tree = page();
  assert.deepEqual(asked, [{ fresh: true }], "a fresh read, not the cache");
  assert.match(textOf(button()), /Reading your calendar/, "on its way, it says so");
  assert.equal(button().props.disabled, true, "and a second press waits for it");
  button().props.onClick();
  assert.equal(asked.length, 1, "a press that reaches it anyway sends nothing more");
  release(true);
  await pressed;
  tree = page();
  assert.equal(textOf(button()), "Refresh");
  assert.match(textOf(toasts.at(-1).msg), /Read your calendar just now/);
  // It landed, and the calendar still couldn't be reached: the last good read stays, and the toast says so.
  globalThis.window.__calendar.refresh = async () => {
    globalThis.window.__CALENDAR = {
      vm: toCalendarVM(
        dto({ feed: { ...dto().feed, stale: true, reason: "http", problem: "The calendar answered 503." } }),
        NOW,
      ),
    };
    return true;
  };
  await byTestId(page(), "cal-refresh").props.onClick();
  assert.equal(toasts.at(-1).tone, "warn");
  assert.match(textOf(toasts.at(-1).msg), /Couldn't refresh your calendar — showing the last good read/);
  assert.match(textOf(toasts.at(-1).msg), /The calendar answered 503\./, "with why");
  // Nothing landed at all.
  globalThis.window.__calendar.refresh = async () => false;
  await byTestId(page(), "cal-refresh").props.onClick();
  assert.equal(toasts.at(-1).tone, "warn");
  assert.match(textOf(toasts.at(-1).msg), /Couldn't reach Chanlytics/);
});

test("REGRESSION (C2): a calendar that can't be read, or couldn't be refreshed, offers Retry beside the address -- its only way back was Settings", async () => {
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
        problem: "The calendar answered 404.",
      },
    }),
  );
  const asked = [];
  globalThis.window.__calendar.refresh = async (opts) => {
    asked.push(opts);
    return true;
  };
  const retry = byTestId(page(), "cal-feed-retry");
  assert.ok(retry, "REGRESSION: the card's only way back was Settings");
  await retry.props.onClick();
  assert.deepEqual(asked, [{ fresh: true }]);
  assert.equal(toasts.at(-1).tone, "warn");
  assert.match(textOf(toasts.at(-1).msg), /Still couldn't read your calendar/);
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "http" } }));
  globalThis.window.__calendar.refresh = async (opts) => {
    asked.push(opts);
    return true;
  };
  await byTestId(page(), "cal-feed-stale-retry").props.onClick();
  assert.deepEqual(asked, [{ fresh: true }, { fresh: true }], "and the card over the last good read");
});

test("REGRESSION (C2): days on their way say so in words -- the board only dimmed them", () => {
  const later = dto({ from: "2026-09-14", to: "2026-09-20" });
  later.days = later.days.map((d, i) => ({ key: shiftKey("2026-09-14", i), items: [], windows: [] }));
  fresh(later);
  globalThis.window.__calendar.ensure = () => new Promise(() => {});
  page();
  let tree = page();
  const reading = byTestId(tree, "cal-reading");
  assert.ok(reading, "REGRESSION: nothing said the board was reading");
  assert.equal(reading.props.role, "status");
  assert.match(textOf(reading), /Reading those days/);
  // The one rule every page dims by (components.css [data-loading] [data-dims]): it dimmed its own way, at once.
  assert.equal(byTestId(tree, "calendar-real").props["data-loading"], "", "the page says its days are on their way");
  assert.equal(byTestId(tree, "cal-body").props["data-dims"], true, "the board is what dims");
  assert.equal(byTestId(tree, "cal-body").props["aria-busy"], "true");
  assert.ok(!String(byTestId(tree, "cal-body").props.className).includes("is-loading"), "not by a page's own class");
  byTestId(tree, "cal-view-agenda").props.onClick();
  tree = page();
  assert.match(textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day")[0]), /Reading this day/);
  byTestId(tree, "cal-view-month").props.onClick();
  tree = page();
  assert.match(textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-month-cell")[0]), /reading/);
});

test("(C2) the bridge's fresh read asks the route for fresh=1 once, then reads as before", async () => {
  const { calendarOverride, setCalendarFresh } =
    await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
  const seen = [];
  const was = {
    location: globalThis.window.location,
    fetch: globalThis.window.fetch,
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
  };
  Object.assign(globalThis.window, {
    location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com" },
    __WORKSPACES: [{ id: "t1", timezone: TZ }],
    __ACTIVE_WORKSPACE: "t1",
    fetch: async (url) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: { calendar: dto() } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  try {
    setCalendarFresh(true);
    await calendarOverride.apply();
    await calendarOverride.apply();
    assert.equal(seen.length, 2);
    assert.match(seen[0], /[?&]fresh=1(&|$)/, "the first read asks for a fresh one");
    assert.ok(!/fresh=/.test(seen[1]), "and only that one");
  } finally {
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
    });
  }
});

test("(C2) the bridge's refresh reads through the runner, fresh when asked, says whether a read landed, and never leaves fresh behind", async () => {
  const { startSurfaces } = await import("../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const { calendarOverride } = await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
  const seen = [];
  const was = {
    location: globalThis.window.location,
    fetch: globalThis.window.fetch,
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
    cal: globalThis.window.__CALENDAR,
  };
  Object.assign(globalThis.window, {
    location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", reload() {}, assign() {} },
    __WORKSPACES: [{ id: "t1", timezone: TZ }],
    __ACTIVE_WORKSPACE: "t1",
    fetch: async (url) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: { calendar: dto() } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const pause = () => new Promise((r) => setTimeout(r, 5));
  const stop = startSurfaces([calendarOverride]);
  try {
    for (let i = 0; i < 20 && !seen.length; i += 1) await pause();
    await pause();
    seen.length = 0;
    assert.equal(await calendar.refresh({ fresh: true }), true, "a read that landed says so");
    assert.equal(seen.length, 1);
    assert.match(seen[0], /[?&]fresh=1(&|$)/, "REGRESSION: the Refresh read the route's cache");
    await pause();
    assert.equal(await calendar.refresh(), true);
    assert.ok(!/fresh=/.test(seen[1]), "the five-minute read reads as before");
  } finally {
    stop();
  }
  try {
    seen.length = 0;
    assert.equal(
      await calendar.refresh({ fresh: true }),
      false,
      "with no runner nothing lands, and the board is told so",
    );
    await calendarOverride.apply();
    assert.ok(!/fresh=/.test(seen[0]), "and the next read does not ask for a fresh one it was never given");
  } finally {
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
      __CALENDAR: was.cal,
    });
  }
});

test("a window the board has read paints at once on the way back, and is read again behind -- each way was a read of its own", async () => {
  // Measured on the salon's workspace, 22 Sep: the board held one window, so back to this week, and back to December,
  // were 390-500ms of "Reading those days…" each, and leaving for Reports read today's weeks again besides.
  const { startSurfaces } = await import("../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const { calendarOverride, getCalendarSpan } =
    await import("../../../apps/dashboard/src/legacy-bridge/surface-data.ts");
  const { windowFor, zoneDayKey } = await import("@chanlytics/contracts");
  const seen = [];
  const parked = [];
  const was = {
    location: globalThis.window.location,
    fetch: globalThis.window.fetch,
    ws: globalThis.window.__WORKSPACES,
    active: globalThis.window.__ACTIVE_WORKSPACE,
    cal: globalThis.window.__CALENDAR,
  };
  Object.assign(globalThis.window, {
    location: { pathname: "/w/harbor", hash: "", origin: "https://app.chanlytics.com", reload() {}, assign() {} },
    __WORKSPACES: [{ id: "t1", timezone: TZ }],
    __ACTIVE_WORKSPACE: "t1",
    fetch: async (url) => {
      const q = Object.fromEntries(new URL(String(url), "https://app.chanlytics.com").searchParams);
      seen.push(q.from);
      await new Promise((r) => parked.push(r));
      return new Response(JSON.stringify({ ok: true, data: { calendar: span(q.from, Number(q.days)) } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const pause = () => new Promise((r) => setTimeout(r, 5));
  const release = async () => {
    for (let i = 0; i < 40; i += 1) {
      while (parked.length) parked.shift()();
      await pause();
    }
  };
  const home = windowFor(zoneDayKey(Date.now(), TZ)).from;
  const shown = () => globalThis.window.__CALENDAR?.vm?.from;
  const stop = startSurfaces([calendarOverride]);
  try {
    await release();
    assert.equal(shown(), home, "the weeks around today, read at boot");
    const toNov = calendar.goTo("2026-11-23", 63);
    await release();
    assert.equal(await toNov, true);
    assert.equal(shown(), "2026-11-23");
    // Back home: held, so painted before any read lands, and read again behind.
    seen.length = 0;
    let back = false;
    calendar.goTo(null).then(() => {
      back = true;
    });
    await pause();
    assert.equal(shown(), home, "REGRESSION: the weeks around today waited on a read of their own");
    assert.equal(back, true, "and the move answered at once");
    assert.deepEqual(seen, [home], "read again behind all the same");
    await release();
    assert.equal(getCalendarSpan().from, null);
    // And back to November: held too.
    calendar.goTo("2026-11-23", 63);
    await pause();
    assert.equal(shown(), "2026-11-23", "the way back is at once");
    await release();
  } finally {
    stop();
    await release();
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
      __CALENDAR: was.cal,
    });
  }
});

/* ------------------------------- C3: one word per thing ------------------------------- */

// The week with the receptionist's next open time as the route sends it: today at 3:30 PM.
const withNext = (over = {}) =>
  dto({ next_opening: { start: "2026-09-08T19:30:00.000Z", end: "2026-09-08T22:00:00.000Z" }, ...over });

test("REGRESSION (C3): the times the receptionist would offer are open times wherever they are named -- the strip said 'Open windows' and 'Next opening', the service picker 'Windows', and Today 'next opening', while Business and Ask say open times", () => {
  fresh(withNext({ services: [{ name: "Balayage", duration_min: 90, consult_first: false }] }));
  const tree = page();
  assert.deepEqual(
    stats(tree).map((c) => c.props.label),
    ["This week", "Open times", "Next open time"],
    "REGRESSION: 'Open windows' and 'Next opening'",
  );
  assert.equal(stats(tree)[2].props.value, "today 3:30 PM");
  assert.equal(
    byTestId(tree, "cal-service").props["aria-label"],
    "Open times that fit a service",
    "REGRESSION: 'Windows that fit a service'",
  );
  const vm = toCalendarVM(withNext(), NOW);
  assert.equal(todayDay(vm, null).nextOpening, "today 3:30 PM", "REGRESSION: Today's day said 'next opening'");
  const was = { cal: globalThis.window.__CALENDAR, today: globalThis.window.__today };
  Object.assign(globalThis.window, { __CALENDAR: { vm }, __today: { day: todayDay } });
  try {
    cells = [];
    seq = 0;
    const day = globalThis.window.TodayDay({});
    assert.equal(
      textOf(find(day, (n) => n.props?.className === "td-day-sub")),
      "next open time today 3:30 PM",
      "REGRESSION: Today's day said 'next opening'",
    );
  } finally {
    Object.assign(globalThis.window, { __CALENDAR: was.cal, __today: was.today });
  }
});

test("REGRESSION (C3): what could not be read is said one way -- a month's days said 'not read' and the strip 'couldn't be read', beside the Retry line's 'Couldn't read those days'", async () => {
  fresh(dto(), [false]);
  honourDeps = true;
  try {
    let tree = page();
    byTestId(tree, "cal-view-month").props.onClick();
    page();
    await settle();
    tree = page();
    const unread = all(
      tree,
      (n) => n.props?.["data-testid"] === "cal-month-cell" && String(n.props.className).includes("unread"),
    );
    assert.ok(unread.length > 0, "the month's days outside the loaded week could not be read");
    assert.ok(
      unread.every((n) => textOf(n).includes("couldn't read")),
      `REGRESSION: 'not read': ${textOf(unread[0])}`,
    );
    assert.deepEqual(
      stats(tree)
        .slice(0, 2)
        .map((c) => c.props.meta),
      ["couldn't read those days", "couldn't read those days"],
      "REGRESSION: 'couldn't be read', the words of a calendar that can't be read",
    );
    assert.ok(byTestId(tree, "cal-failed"), "beside the Retry line, which says it the same way");
  } finally {
    honourDeps = false;
  }
});

test("REGRESSION (C3): the rules bar says what Business calls each thing -- 'Rules' for the booking rules, 'Edit in Settings' for a tab named Business, and a closure run into its note", () => {
  fresh();
  const bar = byTestId(page(), "cal-rules");
  assert.deepEqual(
    all(bar, (n) => n.props?.className === "cal-rules-label").map(textOf),
    ["Hours", "Closed", "Booking", "Calendar it reads"],
    "REGRESSION: 'Rules'; and the calendar is 'Calendar it reads', here as on Business (spec §10)",
  );
  assert.ok(textOf(bar).includes("Sep 12 (Wedding)"), `REGRESSION: 'Sep 12 Wedding': ${textOf(bar)}`);
  const edit = find(bar, (n) => n.type === "button" && textOf(n).startsWith("Edit in"));
  assert.equal(
    textOf(edit).trim(),
    "Edit in Settings › Business",
    "REGRESSION: 'Edit in Settings', for a tab named Business",
  );
});

test("REGRESSION (C3): hours are said in the board's clock -- the bar said 'Mon–Tue 09:00–18:00' over a board drawn in 9 AM, a morning-to-midnight day could read '10 – 12 AM', and a day with half its hours said the prompt's 'ask them to call' to the owner", () => {
  fresh();
  const bar = textOf(byTestId(page(), "cal-rules"));
  assert.ok(
    bar.includes(
      "Mon–Tue 9 AM – 6 PM · Wed 9 AM – 1 PM and 3 – 7 PM · Thu–Fri 9 AM – 6 PM · Sat 10 AM – 4 PM · Sun closed",
    ),
    `REGRESSION: 09:00–18:00: ${bar}`,
  );
  assert.deepEqual(
    hoursLines({
      mon: { open: "10:00", close: "24:00" },
      tue: { open: "09:00" },
      fri: { open: "20:00", close: "24:00" },
    }),
    ["Mon 10 AM – 12 AM", "Tue hours incomplete", "Wed–Thu closed", "Fri 8 PM – 12 AM", "Sat–Sun closed"],
    "a span to midnight ends in the next day's AM, whichever half it starts in",
  );
});

test("REGRESSION (C3): the feed's state is the pill Connections and Setup use, in their words, with only the details beside it -- it was a coloured dot here and 'Readable' there", () => {
  assert.deepEqual(
    ["ok", "stale", "unavailable", "none"].map((s) => stateOf("calendar", s)),
    [
      { tone: "ok", label: "Readable" },
      { tone: "warn", label: "Last good read" },
      { tone: "warn", label: "Could not be read" },
      { tone: "plain", label: "Not connected" },
    ],
  );
  const tried = "2026-09-08T15:57:00.000Z"; // three minutes before NOW
  const feed = (over) => toCalendarVM(dto({ feed: { ...dto().feed, ...over } }), NOW).feed;
  assert.deepEqual([feed({}).health, feed({}).detail], ["ok", "From your calendar · read 2m ago · 4 events"]);
  assert.equal(feed({ stale: true, reason: "http", checked_at: tried }).health, "stale");
  const down = feed({ state: "unavailable", read_at: "2026-09-08T12:00:00.000Z", checked_at: tried, events: 0 });
  assert.deepEqual([down.health, down.detail], ["unavailable", "tried 3m ago · last read 4h ago"]);
  assert.equal(
    down.line,
    "Your calendar could not be read · tried 3m ago · last read 4h ago",
    "the whole sentence stays, for Ask",
  );
  const none = feed({ present: false, state: "none", read_at: null, events: 0 });
  assert.deepEqual([none.health, none.detail], ["none", ""]);
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: "2026-09-08T12:00:00.000Z",
        checked_at: tried,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
  );
  const chip = byTestId(page(), "cal-feed");
  const pill = find(chip, (n) => n.type === globalThis.StatePill);
  assert.ok(pill, "REGRESSION: a coloured dot, in no word Connections uses");
  assert.deepEqual([pill.props.kind, pill.props.value], ["calendar", "unavailable"]);
  const said = textOf(chip);
  assert.ok(said.includes("Could not be read") && said.includes("tried 3m ago · last read 4h ago"), said);
  assert.ok(!said.includes("Your calendar could not be read"), `the state is said once, by the pill: ${said}`);
});

test("REGRESSION (C3): the page's other words match the product's -- Try again beside FailedRead's Retry, Connect where Setup says paste the address, America/New_York for a zone Settings calls New York, and 'your link' for the booking link", () => {
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
  );
  globalThis.window.__calendar.refresh = () => new Promise(() => {});
  let tree = page();
  assert.equal(textOf(byTestId(tree, "cal-feed-retry")), "Retry", "REGRESSION: 'Try again', beside FailedRead's Retry");
  byTestId(tree, "cal-feed-retry").props.onClick();
  assert.equal(textOf(byTestId(page(), "cal-feed-retry")), "Retrying…");
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "http" } }));
  assert.equal(textOf(byTestId(page(), "cal-feed-stale-retry")), "Retry");
  fresh(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    }),
  );
  const card = byTestId(page(), "cal-feed-card");
  assert.ok(
    all(card, (n) => n.type === "button")
      .map(textOf)
      .includes("Paste the address"),
    "REGRESSION: 'Connect', where Setup and Connections say paste the address",
  );
  fresh();
  tree = page();
  assert.equal(toCalendarVM(dto(), NOW).zoneCity, "New York");
  assert.match(
    textOf(byTestId(tree, "cal-legend")),
    /times are New York time/,
    "REGRESSION: 'times in America/New_York'",
  );
  assert.match(
    textOf(find(tree, (n) => n.props?.className === "cal-about-note")),
    /through your booking link/,
    "REGRESSION: 'your link'",
  );
});

test("REGRESSION (C3): a service that needs a consultation is spoken of as the receptionist handles it -- the agenda said the receptionist 'books a consultation', and it never books; the picker said 'consult first'", () => {
  const services = [{ name: "Color correction", duration_min: 180, consult_first: true }];
  assert.equal(
    toCalendarVM(dto({ services }), NOW).services[0].label,
    "Color correction · 180 min · consultation first",
    "REGRESSION: 'consult first'",
  );
  fresh(dto({ services }));
  let tree = page();
  byTestId(tree, "cal-service").props.onChange({ target: { value: "Color correction" } });
  tree = page();
  byTestId(tree, "cal-view-agenda").props.onClick();
  tree = page();
  const day = textOf(
    all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day").find((n) => n.props.key === "2026-09-09"),
  );
  assert.match(
    day,
    /the receptionist offers a consultation for this, not the service/,
    "REGRESSION: 'books a consultation' -- it never books",
  );
  assert.ok(!day.includes("books"), day);
});

test("(C3) the bridge publishes the hours in the Calendar's words, for the Business card that says them beside the bar", async () => {
  // With the Business tab's helpers (business-tab.ts), which the mockup is handed too.
  const { installBusinessTab } = await import("../../../apps/dashboard/src/legacy-bridge/business-tab.ts");
  const W = globalThis.window;
  const was = { lines: W.__hoursLines, tab: W.__businessTab, limits: W.__configLimits };
  try {
    installBusinessTab();
    // What it says, not which copy of contracts it is: the runner loads the bridge's contracts apart from the test's.
    const week = { mon: { open: "09:00", close: "18:00" }, sat: { open: "10:00", close: "16:00" } };
    assert.equal(
      typeof W.__hoursLines,
      "function",
      "REGRESSION: the card summarised the prompt's runs in the prompt's clock",
    );
    assert.deepEqual(W.__hoursLines(week), ["Mon 9 AM – 6 PM", "Tue–Fri closed", "Sat 10 AM – 4 PM", "Sun closed"]);
    assert.equal(W.__hoursRuns, undefined, "and there is no second way to say them");
  } finally {
    W.__hoursLines = was.lines;
    W.__businessTab = was.tab;
    W.__configLimits = was.limits;
  }
});

/* ------------------- C4: keyboard, screen reader, phone, contrast ------------------- */

test("REGRESSION (C4): a day's head opens that day from the keyboard -- it was a clickable div no Tab reached, named only in a title", () => {
  fresh();
  let tree = page();
  const opens = () => all(tree, (n) => n.props?.["data-testid"] === "cal-dayhead-open");
  assert.equal(opens().length, 7, "REGRESSION: a div with onClick, out of the tab order");
  assert.ok(opens().every((b) => b.type === "button" && b.props.type === "button"));
  assert.equal(opens()[1].props["aria-label"], "Open Tuesday, September 8 in Day view");
  assert.equal(opens()[1].props["aria-current"], "date", "today's head says it is today");
  assert.equal(opens()[0].props["aria-current"], undefined);
  opens()[3].props.onClick();
  tree = page();
  assert.equal(byTestId(tree, "cal-view-day").props["aria-pressed"], true);
  assert.equal(textOf(byTestId(tree, "cal-range")), "Thu · Sep 10");
  assert.equal(opens().length, 0, "in Day view the head opens nothing");
});

test("REGRESSION (C4): a month day names its date and what it holds -- a screen reader heard '8', '1 taken', '1 open' with no date, and nothing said which day was today", async () => {
  fresh(dto(), [false]);
  honourDeps = true;
  try {
    let tree = page();
    byTestId(tree, "cal-view-month").props.onClick();
    page();
    await settle();
    tree = page();
    const cell = (key) =>
      all(tree, (n) => n.props?.["data-testid"] === "cal-month-cell").find((n) => n.props.key === key);
    assert.equal(cell("2026-09-08").props["aria-label"], "Tuesday, September 8: 1 taken, 1 open");
    assert.equal(cell("2026-09-08").props["aria-current"], "date");
    assert.equal(cell("2026-09-09").props["aria-current"], undefined);
    assert.equal(cell("2026-09-10").props["aria-label"], "Thursday, September 10: 1 taken");
    assert.equal(cell("2026-09-12").props["aria-label"], "Saturday, September 12: closed · Wedding");
    assert.equal(cell("2026-09-09").props["aria-label"], "Wednesday, September 9: nothing on the calendar");
    assert.equal(cell("2026-09-20").props["aria-label"], "Sunday, September 20: couldn't read");
  } finally {
    honourDeps = false;
  }
});

test("REGRESSION (C4): an appointment and an all-day event name their time and day -- each said only its title, the day being wherever its column was", () => {
  fresh();
  const tree = page();
  assert.equal(byTestId(tree, "cal-block").props["aria-label"], "Ana Ruiz · Color, 2 – 3:30 PM, Tuesday, September 8");
  assert.equal(
    find(tree, (n) => n.props?.className === "cal-allday").props["aria-label"],
    "Team training, all day, Thursday, September 10",
  );
});

test("REGRESSION (C4): a move of the board is announced, and the key hints are their own part of the legend -- the range changed in silence, and a phone was told to press arrow keys", () => {
  fresh();
  const tree = page();
  assert.equal(
    byTestId(tree, "cal-range").props["aria-live"],
    "polite",
    "REGRESSION: the new range was never announced",
  );
  const keys = find(byTestId(tree, "cal-legend"), (n) => n.props?.className === "cal-keys");
  assert.ok(keys && textOf(keys).includes("← → move · T today"), "the keys, apart, where a touch screen can drop them");
  assert.ok(!textOf(keys).includes("New York"), "and the zone outside them");
});

test("REGRESSION: the Calendar shows the calendar first -- a title the top bar already says, a paragraph, three stat cards and five rows of controls came before the first day, and on a phone the first day sat below the fold", () => {
  fresh(dto({ services: [{ name: "Balayage", duration_min: 90, consult_first: false }] }));
  let tree = page();
  assert.equal(
    find(tree, (n) => /\bcl-(head|page-title|page-sub|controls)\b/.test(String(n.props?.className ?? ""))),
    null,
    "REGRESSION: the page's own head, title and paragraph",
  );
  assert.equal(
    find(tree, (n) => n.type === globalThis.StatStrip || n.type === globalThis.StatCell),
    null,
    "REGRESSION: the counts as three cards",
  );
  // Every control in one bar, and the date field inside the range, which opens it.
  const bar = byTestId(tree, "cal-bar");
  for (const id of [
    "cal-prev",
    "cal-today",
    "cal-next",
    "cal-range",
    "cal-jump",
    "cal-service",
    "cal-view-week",
    "cal-view-day",
    "cal-view-month",
    "cal-view-agenda",
  ])
    assert.ok(byTestId(bar, id), `${id} is in the one bar`);
  const title = find(bar, (n) => n.type === "label" && !!byTestId(n, "cal-jump"));
  assert.ok(title && byTestId(title, "cal-range"), "the range and the date field are one control");
  // The counts as one line of text, each saying what it counts, its number, and what the number means.
  const line = byTestId(tree, "cal-counts");
  assert.equal(line.type, "p", "one line of text");
  assert.ok(stats(line).every(Boolean), "the three counts are in it");
  for (const c of stats(line)) {
    const said = textOf(c);
    for (const part of [c.props.label, c.props.value, c.props.meta, c.props.note].filter((p) => p != null))
      assert.ok(said.includes(String(part)), `"${said}" says ${part}`);
  }
  // The hours, the rules, the calendar's source, Refresh and the booking link wait under the board, one tap away.
  const about = () => byTestId(tree, "cal-about");
  const toggle = () => byTestId(tree, "cal-about-toggle");
  assert.equal(about().props.hidden, true, "shut until asked for");
  assert.equal(toggle().props["aria-expanded"], false);
  assert.equal(toggle().props["aria-controls"], about().props.id);
  for (const id of ["cal-rules", "cal-feed", "cal-refresh", "cal-copy-link"]) {
    assert.ok(byTestId(about(), id), `${id} is behind the toggle`);
    assert.equal(byTestId(bar, id), null, `${id} is not among the controls`);
  }
  toggle().props.onClick();
  tree = page();
  assert.equal(about().props.hidden, false, "one tap shows them");
  assert.equal(toggle().props["aria-expanded"], true);
  toggle().props.onClick();
  tree = page();
  assert.equal(about().props.hidden, true, "and another puts them away");
  // A calendar that can't be read still says so over the board, with its Retry, not behind the toggle.
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
      },
    }),
  );
  tree = page();
  assert.ok(byTestId(tree, "cal-feed-card") && byTestId(tree, "cal-feed-retry"), "the card and its Retry");
  assert.equal(byTestId(about(), "cal-feed-card"), null, "over the board, not behind the toggle");
  assert.deepEqual(
    stats(tree).map((c) => (c ? [c.props.label, c.props.value, c.props.meta] : null)),
    [["This week", "—", "could not be read"], null, null],
    "one count and why: two more dashes said 'needs the calendar' under the card that says so",
  );
});

/* ---------------- C5b: a service that needs a consultation first ---------------- */

test("REGRESSION (C5b): the board sizes a consultation-first service's open times as a consultation, the rule the phone and the assistant follow -- it filtered them by the service's own three hours", () => {
  const services = [
    { name: "Color correction", duration_min: 180, consult_first: true },
    { name: "Consultation", duration_min: 30, consult_first: false },
  ];
  const week = dto({ services, rules: { ...dto().rules, consult_first: ["Color correction"] } });
  assert.deepEqual(
    toCalendarVM(week, NOW).services.map((s) => [s.name, s.offerMinutes]),
    [
      ["Color correction", 30],
      ["Consultation", 30],
    ],
  );
  fresh(week);
  let tree = page();
  byTestId(tree, "cal-service").props.onChange({ target: { value: "Color correction" } });
  tree = page();
  assert.deepEqual(
    [stats(tree)[1].props.value, stats(tree)[1].props.note],
    [2, "for a consultation"],
    "REGRESSION: '0 · that fit Color correction'",
  );
  assert.match(textOf(byTestId(tree, "cal-legend")), /would offer it for a consultation, through Sep 21/);
  assert.match(
    textOf(byTestId(tree, "cal-consult-note")),
    /The open times here are for a consultation, about 30 minutes\./,
  );
  byTestId(tree, "cal-view-agenda").props.onClick();
  tree = page();
  const day = (key) =>
    textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day").find((n) => n.props.key === key));
  assert.match(
    day("2026-09-08"),
    /Open for a consultation:3:30 – 6 PM/,
    "REGRESSION: the three-hour filter hid a two-and-a-half-hour open time",
  );
  // A service booked as itself is still sized by its own length.
  fresh(dto({ services: [{ name: "Balayage", duration_min: 140, consult_first: false }] }));
  tree = page();
  byTestId(tree, "cal-service").props.onChange({ target: { value: "Balayage" } });
  tree = page();
  assert.deepEqual([stats(tree)[1].props.value, stats(tree)[1].props.note], [1, "that fit Balayage"]);
});

test("the page publishes how long it keeps a read and its words for a read that gives no reason, and says those words itself", () => {
  // Settings › Business states the same calendar's last read in a row of its own (business-tab-open.jsx), for as long
  // as this board keeps one, and in these words: one number and one spelling, this page's.
  const keeps = globalThis.window.__calendarPage;
  assert.equal(keeps.refreshMs, 5 * 60 * 1000, "the five minutes after which the board reads itself again");
  assert.deepEqual(Object.keys(keeps.words).sort(), ["stale", "unavailable"]);
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "unreachable", problem: null } }));
  assert.ok(
    textOf(byTestId(page(), "cal-feed-stale")).includes(keeps.words.stale),
    "the card over a last good read says them",
  );
  fresh(
    dto({
      feed: {
        present: true,
        state: "unavailable",
        read_at: null,
        events: 0,
        recurring_expanded: 0,
        skipped_recurring: 0,
        problem: null,
      },
    }),
  );
  assert.ok(
    textOf(byTestId(page(), "cal-feed-card")).includes(keeps.words.unavailable),
    "and the card over a calendar that could not be read",
  );
  // A reason of the read's own wins over both.
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "http", problem: "The calendar answered 503." } }));
  const said = textOf(byTestId(page(), "cal-feed-stale"));
  assert.ok(said.includes("The calendar answered 503.") && !said.includes(keeps.words.stale), said);
});

/**
 * Calendar: an appointment opens in the desk's peek or the phone's sheet, a failed read says so, and the page names the days it shows.
 * The page is the TSX module (apps/dashboard/src/surfaces/calendar, decision 0015) executed on a stub React, over the view
 * models the seam gives it (surface-values.ts).
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
import { after, test } from "node:test";
import assert from "node:assert/strict";
import {
  DEAL_ACT_WORDS,
  calendarPeekDeal,
  hoursLines,
  noProposalSince,
  shiftKey,
  stateOf,
  toBookingReportVM,
  toCalendarVM,
  todayDay,
} from "@chanlytics/contracts";
import { createRequire } from "node:module";
import { hookFrames } from "../_hook-frames.mjs";
import { keysDrawn } from "../_keys.mjs";
import { kitHooks, kitPages } from "../_legacy-react.mjs";

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
    booking_link: "https://book.example.com/marisas",
    days,
    ...over,
  };
}

/* -------------------------------- the page, drawn -------------------------------- */

let cells = [];
// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
const frames = hookFrames();
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
    if (typeof type === "function") node.rendered = frames.render(type, props);
    return node;
  },
  useState: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = typeof init === "function" ? init() : init;
    return [
      cells[k],
      (v) => {
        cells[k] = typeof v === "function" ? v(cells[k]) : v;
      },
    ];
  },
  useReducer: (red, init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = init;
    return [
      cells[k],
      (a) => {
        cells[k] = red(cells[k], a);
      },
    ];
  },
  useRef: (init) => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = { current: init };
    return cells[k];
  },
  useMemo: (fn) => fn(),
  // An id that stays with its component across draws (the kit's segmented control names its options by it).
  useId: () => {
    const k = frames.key();
    if (!(k in cells)) cells[k] = `:r${Object.keys(cells).length.toString(36)}:`;
    return cells[k];
  },
  // Once per effect; with honourDeps, an effect whose dependencies changed runs again, its last cleanup first.
  useEffect: (fn, deps) => {
    const k = frames.key();
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
  // A store outside React (the seam): the value it holds now, which each draw here asks again.
  useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
};
// A layout effect is an effect here, as it is on the kit's stub (_legacy-react.mjs): the board fits its hour in one. One
// with no dependencies runs after every draw, as React runs it: the page says its bar to the frame so (kit/head/standing.ts
// useStanding), and the frame draws what the last draw said.
globalThis.React.useLayoutEffect = (fn, deps) => {
  if (deps !== undefined) return globalThis.React.useEffect(fn, deps);
  const k = frames.key();
  const cell = cells[k];
  if (cell) cell.cleanup?.();
  else cleanups.push(() => cells[k]?.cleanup?.());
  const done = fn();
  cells[k] = { cleanup: typeof done === "function" ? done : null };
};
// The TSX surface imports its hooks from "react", which under this runner has none: the same stub is set on that module.
const reactModule = createRequire(new URL("../../../../apps/dashboard/src/legacy-bridge/_.js", import.meta.url))(
  "react",
);
for (const hook of [
  "useState",
  "useReducer",
  "useRef",
  "useMemo",
  "useId",
  "useEffect",
  "useLayoutEffect",
  "useCallback",
  "useSyncExternalStore",
])
  reactModule[hook] = globalThis.React[hook];
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
await import("../../../../apps/dashboard/src/legacy/components/data-bits.jsx");
// The bridge's hook: these tests draw once, and the redraw is proved in shell/surfaces.
globalThis.useSurface = () => 0;
// A stub React attaches no ref, so the dialog's element does not exist here: the one focus helper (data-bits trapFocus,
// proved on a document of its own in shell/focus-trap.test.mjs) is handed a stand-in for it, and every ask is kept.
const trapped = [];
const realTrapFocus = globalThis.window.trapFocus;
const dialogBox = {
  addEventListener() {},
  removeEventListener() {},
  contains: (n) => !!n,
  getAttribute: () => "-1",
  setAttribute() {},
  focus() {
    globalThis.document.activeElement = dialogBox;
  },
};
globalThis.window.trapFocus = (box) => {
  trapped.push(box);
  return realTrapFocus(box ?? dialogBox);
};
Object.assign(globalThis.window, kitPages);
for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"])
  globalThis[k] = globalThis.window[k];
// One appointment on a list, the row Today's day and the agenda both wear (the kit's, which kitPages publishes).
for (const k of ["AgendaItem", "AgendaItems", "AgendaOpen"]) globalThis[k] = globalThis.window[k];
globalThis.window.usePPToast = () => [null, (t) => toasts.push(t)];
// A pill's tone and words are contracts', as the shell's chrome bridge publishes them.
globalThis.window.__chrome = { state: stateOf };
// The surface's own verbs, with their reads answered here, and the seam that holds what the page draws.
const S = "../../../../apps/dashboard/src/surfaces";
const { calendar } = await import(`${S}/calendar/verbs.ts`);
const { CalendarPage } = await import(`${S}/calendar/calendar-page.tsx`);
const { CALENDAR_PAGE, CR_WARM_MS, fitHourPx } = await import(`${S}/calendar/words.ts`);
// The floor an hour never goes under on a phone: what the fit answers for no room at all (words.ts keeps the number).
const CR_HOUR_MIN_PX = fitHourPx(0, 1);
const { setSurfaceValue } = await import(`${S}/surface-values.ts`);
const { standingSaid } = await import(`${S}/kit/head/standing.ts`);
const { calendarAddress, calendarParam } = await import(`${S}/calendar/address.ts`);
const realVerbs = { ...calendar };
globalThis.window.__calendar = calendar;
// Today's day (TSX since decision 0015), the one derivation the strip and the brief read, which names the next open time
// the way the Calendar does: the hooks it imports are the stub's, set on the module it imports them from.
kitHooks();
const { useDayVm } = await import("../../../../apps/dashboard/src/surfaces/today/pages/day.tsx");

const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  // A kit component's control (the date picker's, a menu's) is a prop: Base UI draws it, and the popup it opens only when
  // a person does, so the stub walks the control as a child.
  if (n.props?.trigger && typeof n.props.trigger === "object") walk(n.props.trigger, fn);
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
// The views are the frame's strip (chrome.ts), each tab a link to its view's address, which the page follows: a press on
// one is a move to that address (the stub's frame below adopts it on the next draw).
const pickView = (_tree, id) => {
  went.push(`calendar/${id}`);
};
// The view the page draws, by its body: the month, the agenda, a day's one column, or the week's seven.
const shownView = (tree) => {
  if (byTestId(tree, "cal-month")) return "month";
  if (byTestId(tree, "cal-agenda")) return "agenda";
  if (find(tree, (n) => /\bcal-grid-day\b/.test(String(n.props?.className ?? "")))) return "day";
  return byTestId(tree, "cal-col") ? "week" : null;
};
// The kit's date picker, which the range opens: the one node that takes a day and today.
const picker = (tree) =>
  find(tree, (n) => typeof n.props?.today === "string" && typeof n.props?.onValueChange === "function");
// What a node says: a component's text is what it drew (its children go through it, and a kit button hands its words to the
// press that hands them to the element, so counting each layer's children says them three times), a host's is its own words
// and what is inside it.
const textOf = (n) => {
  const out = [];
  const visit = (x) => {
    if (x == null || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach(visit);
    if (x.rendered !== undefined) return visit(x.rendered);
    const kids = x.props?.children ?? [];
    for (const k of kids) if (typeof k === "string" || typeof k === "number") out.push(String(k));
    for (const k of kids) visit(k);
  };
  visit(n);
  return out.join("");
};
// The element a node draws: a kit button is a component around a press around the <button>, and its classes are the element's.
const hostOf = (n) => (n && n.rendered && !Array.isArray(n.rendered) ? hostOf(n.rendered) : n);
// What a sheet holds: the kit's Sheet is Base UI's Dialog, which the suite stands in for with parts that draw nothing
// (shared/_stand-in-base-ui.mjs), so its words are read off the children it was handed, each layer's (a word may be
// counted more than once: ask whether it is there, never how often).
const textIn = (n) => {
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

/**
 * The frame, as far as the page needs one: the address it is drawn for (app/(os)/w/[workspace]/calendar/[[...param]]),
 * which follows every move the page makes (a tab, a day, a visit opened, closed or walked), as the router does.
 */
let addr = {};
let followed = 0;
const addressOf = (route) => {
  const param = calendarParam(route);
  return { param, ...calendarAddress(param) };
};
/** Open the page at a route, as a link does. */
const at = (route) => {
  addr = addressOf(route);
};

let reads = [];
let homes = 0;
// The weeks the board asked to have read ahead of need: [view, anchor] each time its timer ran.
let warmed = [];
/** The page goes away: what its effects handed back runs, last first. */
const leave = () => {
  for (const done of cleanups.splice(0).reverse()) done();
};
// The last page goes too, and its timers with it.
after(() => leave());
/** A fresh page over `week`: each read the page asks for answers the next of `answers` (true once they run out). */
const fresh = (week = dto(), answers = []) => {
  // The page before goes, as React lets go of it: its effects' cleanups run, its minute's timer with them, which kept
  // the file from ever ending.
  leave();
  trapped.length = 0;
  addr = {};
  followed = went.length;
  cells = [];
  cleanups = [];
  reads = [];
  homes = 0;
  warmed = [];
  toasts = [];
  for (const k of Object.keys(listeners)) delete listeners[k];
  setSurfaceValue("calendar", { vm: toCalendarVM(week, NOW), fetchedAt: 1 });
  Object.assign(calendar, realVerbs, {
    ensure: (view, anchor) => {
      reads.push([view, anchor]);
      return Promise.resolve(answers.length ? answers.shift() : true);
    },
    refresh: async () => {},
    home: async () => {
      homes += 1;
      return true;
    },
    warmAround: (view, anchor) => {
      warmed.push([view, anchor]);
    },
  });
};
/**
 * Draw the page again over the same cells, at the address the frame holds (where the page's last moves took it); the
 * board's five-minute timer is not started for real.
 */
const page = (props = {}) => {
  for (; followed < went.length; followed += 1) {
    const to = went[followed];
    if (typeof to === "string" && /^calendar(\/|$)/.test(to)) addr = addressOf(to);
  }
  frames.begin();
  const [si, ci] = [globalThis.setInterval, globalThis.clearInterval];
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  try {
    const drawn = CalendarPage({ ...addr, ...props });
    // The frame draws the page's act on its row of views (board-parts.tsx calendarAct: the bar on a desk, Settings on a
    // phone): here it hangs from the page's node, so a search of the page finds it where a person does, beside the board.
    const act = standingSaid()?.act;
    return act ? { ...drawn, props: { ...drawn.props, children: [...(drawn.props.children ?? []), act] } } : drawn;
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
/** The open times the board draws: the ones the service picker leaves, on the days on screen. */
const openTimes = (tree) => all(tree, (n) => n.props?.["data-testid"] === "cal-window");
/** The board's columns, by day. */
const columns = (tree) => all(tree, (n) => n.props?.["data-testid"] === "cal-col");
const classes = (n) => String(n.props.className).split(" ");
/** The month's days: each a cell (its look: closed, unread, loading) round the button that opens it and names it. */
const monthCells = (tree) => all(tree, (n) => String(n.props?.className ?? "").split(" ")[0] === "cal-month-cell");
/** One day of the month, by its key: the button a reader hears it by. */
const monthDay = (tree, key) => {
  const cell = monthCells(tree).find((n) => n.props.key === key);
  return cell ? find(cell, (n) => n.props?.["data-testid"] === "cal-month-cell") : null;
};
/** The lines of one group of Hours and rules (the kit's sheet Settings opens, drawn closed in the tree), by its name. */
const ruleLines = (tree, name) => {
  const group = all(byTestId(tree, "cal-rules"), (n) => n.props?.className === "cal-rules-group").find(
    (g) => textOf(find(g, (n) => n.props?.className === "cal-rules-label")).trim() === name,
  );
  return all(group, (n) => n.props?.className === "cal-rules-line").map(textOf);
};
/** A menu of the bar's, by the name it is read by: Show's capsule ("Show") or Settings ("Calendar settings"). */
const barMenu = (tree, label) => find(tree, (n) => n.props?.label === label && Array.isArray(n.props?.groups));
/** The legend, Show's caption: what each look on the board means, where the switches that draw them are. */
const legend = (tree) =>
  (barMenu(tree, "Show") ?? barMenu(tree, "Calendar settings"))?.props.groups.find((g) => g.header === "Show")
    ?.caption ?? "";
/** An item of Settings' menu, by its words. */
const settingsItem = (tree, label) =>
  barMenu(tree, "Calendar settings")
    .props.groups.flatMap((g) => g.items ?? [])
    .find((i) => i.label === label);

test("REGRESSION (D14): on a desk an appointment opens in the peek at the board's edge, named by its title; Escape closes it, and the board holds still behind it", () => {
  // The visit opened as Ask's legacy modal (lane E): it is the peek People's, the Pipeline's and Leads' pages draw, beside
  // a board that stays live, never a modal that holds the page.
  fresh();
  let tree = page();
  const range = () => textOf(byTestId(tree, "cal-range"));
  assert.equal(range(), "Sep 7 – 13");
  const block = byTestId(tree, "cal-block");
  assert.ok(block, "Tuesday's appointment is on the board");
  block.props.onClick();
  tree = page();
  const panel = byTestId(tree, "cal-panel");
  assert.ok(panel, "the peek opened");
  assert.equal(panel.type, "aside");
  assert.ok(classes(panel).includes("cal-side"));
  assert.equal(panel.props.role, "dialog");
  assert.equal(panel.props["aria-modal"], undefined, "not modal: the board beside it stays live");
  assert.equal(panel.props["aria-label"], "Color", "named by what it is for");
  assert.equal(textOf(byTestId(panel, "cal-visit-door")), "Ana Ruiz", "who it is with, a door to their page");
  assert.equal(byTestId(tree, "calendar-real").props["data-peek"], "", "the board makes room for it (calendar.css)");

  press("ArrowRight");
  tree = page();
  assert.equal(range(), "Sep 7 – 13", "REGRESSION: the arrows moved the week behind an open appointment");
  assert.ok(byTestId(tree, "cal-panel"), "and the appointment stays open");

  assert.equal(press("Escape"), true, "Escape is the peek's");
  tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null, "Escape closes it");

  press("ArrowRight");
  tree = page();
  assert.equal(range(), "Sep 14 – 20", "with nothing open the arrows move the board again");
});

test("(lane E) the desk's peek walks the day's visits: its ‹ › and J and K open the next in its place, round the day, and say where it is", () => {
  const week = dto();
  week.days[1].items.push({
    id: "e4",
    start: "2026-09-08T20:00:00.000Z",
    end: "2026-09-08T21:00:00.000Z",
    title: "Bo Chen · Cut",
    all_day: false,
    person: null,
  });
  fresh(week);
  let tree = page();
  byTestId(tree, "cal-block").props.onClick();
  tree = page();
  const label = () => byTestId(tree, "cal-panel")?.props["aria-label"];
  const where = () => textOf(byTestId(tree, "cal-side-walk"));
  assert.equal(label(), "Color");
  assert.match(where(), /1 of 2/);
  assert.equal(press("j"), true, "J walks the day");
  tree = page();
  assert.equal(label(), "Bo Chen · Cut");
  assert.match(where(), /2 of 2/);
  press("j");
  tree = page();
  assert.equal(label(), "Color", "round the day");
  press("k");
  tree = page();
  assert.equal(label(), "Bo Chen · Cut", "and back");
  assert.equal(textOf(byTestId(tree, "cal-range")), "Sep 7 – 13", "the board holds still under the walk");
});

test("on a phone the visit is the kit's sheet from the bottom edge, its pull, handle and Escape the kit's; on a desk the peek", () => {
  // On a phone the card stood at the screen's foot with its own touch handlers (8 October 2026); it is the kit's Sheet now,
  // which every sheet a phone raises is, so a pull down lets it go as theirs does (kit/sheet/sheet.tsx touchSwipe).
  fresh();
  let tree = page();
  byTestId(tree, "cal-block").props.onClick();
  tree = page();
  assert.equal(byTestId(tree, "cal-panel").type, "aside", "a desk: the peek");
  globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    tree = page();
    const sheet = find(tree, (n) => n.props?.testid === "cal-panel" && typeof n.props.onClose === "function");
    assert.ok(sheet, "a phone: the kit's sheet");
    assert.equal(sheet.props.open, true);
    assert.equal(sheet.props.title, "Color");
    assert.ok(byTestId(tree, "cal-visit"), "the same parts, the same view model");
    assert.equal(
      find(tree, (n) => n.type === "aside"),
      null,
      "and no peek beside it",
    );
    sheet.props.onClose();
    tree = page();
    assert.equal(
      find(tree, (n) => n.props?.testid === "cal-panel" && n.props.open === true),
      null,
      "the kit's close lets it go",
    );
  } finally {
    delete globalThis.window.matchMedia;
  }
});

/* ------------------------------ the peek knows the deal (0008) ------------------------------ */

const HOUR = 3_600_000;
/** Ana, as the board's read matched her in People, with what it knows of her (calendar-person-facts.ts). */
const ANA = {
  id: "p1",
  name: "Ana Ruiz",
  facts: {
    state: "active",
    business: null,
    deal: null,
    step: null,
    last: { at: null, by: "No contact recorded" },
    phone: null,
    email: null,
  },
};
/** Ana's consultation on Tuesday, 2 – 3:30 PM, its title naming a consult-first service, as the route marks it. */
const consultWeek = (over = {}) => {
  const week = dto();
  week.days[1].items = [
    {
      id: "e1",
      start: "2026-09-08T18:00:00.000Z",
      end: "2026-09-08T19:30:00.000Z",
      title: "Kitchen remodel consult · Ana Ruiz",
      all_day: false,
      person: ANA,
      consultation: true,
      consult_service: "Kitchen remodel",
      ...over,
    },
  ];
  return week;
};
const END = Date.parse("2026-09-08T19:30:00.000Z");
/**
 * People, as far as the peek reads it: whether deals are on, and Ana's row with her deal's stage and when that stage
 * began (for a pass or an end, when it came). By default a day before the consultation ended.
 */
const peopleWith = (stage, dealsOn = true, sinceMs = END - 86_400_000) => ({
  dealsOn,
  rows: [{ id: "p1", name: "Ana Ruiz", deal: stage ? { stage, sinceMs } : null }],
});
let sheets = [];
/** Draw with the clock at `nowMs`: the visit asks contracts whether the consultation is over by the clock it runs on. */
const drawnAt = (nowMs, draw) => {
  const real = Date.now;
  Date.now = () => nowMs;
  try {
    return draw();
  } finally {
    Date.now = real;
  }
};
/**
 * The board over `week` with Ana's appointment open, in a workspace that sells by proposal (deals on) unless told not to;
 * the deal sheet installed as a stand-in that counts what it is asked for; the clock at `nowMs`.
 */
const peek = ({ week = consultWeek(), dealsOn = true, nowMs = END + HOUR } = {}) => {
  fresh(week);
  sheets = [];
  globalThis.window.__WORKSPACES = [{ id: "t-salon", sells_by: dealsOn ? "proposal" : "booking" }];
  globalThis.window.__ACTIVE_WORKSPACE = "t-salon";
  globalThis.window.openDealSheet = (args) => sheets.push(args);
  let tree = drawnAt(nowMs, () => page());
  byTestId(tree, "cal-block").props.onClick();
  tree = drawnAt(nowMs, () => page());
  assert.ok(byTestId(tree, "cal-panel"), "the appointment is open");
  return tree;
};
const forgetPeek = () => {
  delete globalThis.window.__WORKSPACES;
  delete globalThis.window.__ACTIVE_WORKSPACE;
  delete globalThis.window.openDealSheet;
};
const startAct = (tree) => byTestId(tree, "cal-visit-primary-proposal");

test("(0008) the peek's rule: the deal's stage where deals are on and People holds them, and the sheet's own act once a consultation is over with no proposal since", () => {
  const block = toCalendarVM(consultWeek(), new Date(END - 4 * HOUR)).days[1].blocks[0];
  assert.deepEqual(
    [block.consultation, block.consultService],
    [true, "Kitchen remodel"],
    "the route's marks, on the block",
  );
  const after = END + HOUR;
  // The sheet's own act: its words (DEAL_ACT_WORDS) and the mode it opens the sheet in, a new proposal always.
  const act = { id: "propose", label: DEAL_ACT_WORDS.propose, mode: "propose" };
  assert.equal(act.label, "Start a proposal");
  const start = { act, personId: "p1", service: "Kitchen remodel" };
  assert.deepEqual(calendarPeekDeal(block, peopleWith(null), after), { stage: null, start });
  // A pass or an end before the consultation ended: it began something new, and a new proposal follows it.
  assert.deepEqual(calendarPeekDeal(block, peopleWith("lost"), after), { stage: "lost", start });
  assert.deepEqual(calendarPeekDeal(block, peopleWith("ended"), after), { stage: "ended", start });
  // A pass or an end as it ended or after: the proposal that followed it was answered. Nothing to start.
  assert.deepEqual(calendarPeekDeal(block, peopleWith("lost", true, END), after), { stage: "lost", start: null });
  assert.deepEqual(calendarPeekDeal(block, peopleWith("lost", true, END + HOUR), after), {
    stage: "lost",
    start: null,
  });
  assert.deepEqual(calendarPeekDeal(block, peopleWith("ended", true, END + HOUR), after), {
    stage: "ended",
    start: null,
  });
  // An open deal already has its proposal.
  assert.deepEqual(calendarPeekDeal(block, peopleWith("proposed"), after), { stage: "proposed", start: null });
  assert.deepEqual(calendarPeekDeal(block, peopleWith("won"), after), { stage: "won", start: null });
  // One rule with the week's count (noProposalSince), asked of this consultation's end.
  for (const [stage, sinceMs] of [
    [null, 0],
    ["lost", END - HOUR],
    ["lost", END + HOUR],
    ["ended", END],
    ["won", END - HOUR],
  ])
    assert.equal(
      !!calendarPeekDeal(block, peopleWith(stage, true, sinceMs), after).start,
      noProposalSince(stage ? { stage, sinceMs } : null, END),
      `${stage} at ${sinceMs - END}`,
    );
  // Not over yet: the stage, and nothing to start.
  assert.deepEqual(calendarPeekDeal(block, peopleWith("lost"), END - HOUR), { stage: "lost", start: null });
  // A consultation that named no service starts a proposal for no service in particular.
  assert.equal(calendarPeekDeal({ ...block, consultService: null }, peopleWith(null), after).start.service, null);
  // Not a consultation: the stage only.
  assert.deepEqual(calendarPeekDeal({ ...block, consultation: false }, peopleWith(null), after), {
    stage: null,
    start: null,
  });
  // Nothing where deals are off, where People does not hold them, where nobody was matched, or before People lands.
  const nothing = { stage: null, start: null };
  assert.deepEqual(calendarPeekDeal(block, peopleWith("proposed", false), after), nothing);
  assert.deepEqual(calendarPeekDeal(block, { dealsOn: true, rows: [{ id: "p2", deal: null }] }, after), nothing);
  assert.deepEqual(calendarPeekDeal({ ...block, person: null }, peopleWith("lost"), after), nothing);
  assert.deepEqual(calendarPeekDeal(block, null, after), nothing);
});

test("REGRESSION (0008): the proposal act closes the visit first and opens the one deal sheet on the next task, in its own mode, so the sheet takes over from it", async () => {
  // Opened in the same press, the sheet took focus first and the visit's way back took it out of the sheet again.
  try {
    const tree = peek();
    const act = startAct(tree);
    assert.ok(act, "a consultation over, no proposal since, deals on: the foot leads with it");
    assert.equal(textOf(act), "Start a proposal");
    assert.ok(classes(hostOf(act)).includes("btn-primary"), "the visit's one primary act");
    act.props.onClick();
    assert.deepEqual(sheets, [], "not in the same press: the visit goes first");
    assert.equal(byTestId(page(), "cal-panel"), null, "the visit closed");
    await settle(2);
    assert.deepEqual(sheets, [{ personId: "p1", mode: "propose", service: "Kitchen remodel" }], "the act's own mode");
  } finally {
    forgetPeek();
  }
});

test("REGRESSION: More's Set a step closes the visit first and opens the step sheet on the next task, as the proposal act does -- opened over the visit, the record sheet stood hidden behind it, and nothing seemed to happen (census, 13 Oct 2026)", async () => {
  const steps = [];
  globalThis.window.openStepSheet = (ask) => steps.push(ask);
  try {
    const tree = peek();
    const more = find(
      byTestId(tree, "cal-visit-foot"),
      (n) => n.props?.label === "More" && Array.isArray(n.props?.groups),
    );
    const item = (more?.props.groups ?? []).flatMap((g) => g.items).find((i) => /step/i.test(String(i.label)));
    assert.ok(item, "More offers it");
    item.onSelect();
    assert.deepEqual(steps, [], "not in the same press: the visit goes first");
    assert.equal(byTestId(page(), "cal-panel"), null, "the visit closed");
    await settle(2);
    assert.deepEqual(steps, [{ personId: "p1" }], "the step sheet, for them");
  } finally {
    delete globalThis.window.openStepSheet;
    forgetPeek();
  }
});

test("(0008) the proposal act is gated as the sheet's Save is: a role that may not record a deal is told why at the button, and nothing opens", async () => {
  const hadStore = globalThis.window.ST_STORE;
  globalThis.window.ST_STORE = { can: () => false, myRole: () => "viewer" };
  try {
    const tree = peek();
    const act = startAct(tree);
    assert.ok(act, "the visit's primary act is shown, gated, to a role that may not press it");
    assert.equal(act.props["aria-disabled"], true);
    assert.equal(typeof act.props["aria-description"], "string", "the reason, at the control");
    assert.equal(act.props["aria-description"], act.props["data-tip"]);
    act.props.onClick({ preventDefault() {}, stopPropagation() {}, currentTarget: act });
    await settle(2);
    assert.deepEqual(sheets, [], "nothing opens");
    assert.ok(byTestId(page(), "cal-panel"), "and the visit stays");
  } finally {
    if (hadStore === undefined) delete globalThis.window.ST_STORE;
    else globalThis.window.ST_STORE = hadStore;
    forgetPeek();
  }
  // A role that may: no gate on it.
  try {
    assert.equal(startAct(peek()).props["aria-disabled"], undefined);
  } finally {
    forgetPeek();
  }
});

test("(lane D) the visit says the person's standing, business and deal from the board's own read, and the page reads no People for it -- it read People's whole book a second time, for one pill and a deal", () => {
  // Which deal, standing and words a visit says is contracts' (calendar-panel.test.mjs, visitSheetOf); here, that the page
  // draws them from the read it already has, and never reaches for People's.
  const readsOfPeople = [];
  Object.defineProperty(globalThis.window, "__PEOPLE", {
    configurable: true,
    get() {
      readsOfPeople.push("read");
      return undefined;
    },
  });
  try {
    const deal = {
      deal_id: "d1",
      deal_stage: "proposed",
      deal_service: "Kitchen remodel",
      deal_proposed_at: "2026-09-07T15:00:00.000Z",
    };
    const tree = peek({ week: consultWeek({ person: { ...ANA, facts: { ...ANA.facts, deal } } }) });
    const person = byTestId(tree, "cal-visit-person");
    assert.ok(person, "who it is with");
    assert.match(textOf(person), /Active/, "their standing, in People's word");
    assert.match(
      textOf(byTestId(tree, "cal-visit-deal")),
      /^Proposal out · Kitchen remodel/,
      "their deal, a door to it",
    );
    assert.equal(startAct(tree), null, "a proposal out already is the next step");
    assert.deepEqual(readsOfPeople, [], "REGRESSION: the visit read People's book");
    assert.equal((listeners["surface:clients"] ?? []).length, 0, "and listens for none");
  } finally {
    delete globalThis.window.__PEOPLE;
    forgetPeek();
  }
});

test("REGRESSION (0008): the board's keys hold still under anything open over the page, the deal sheet among them, and leave a key something else took", () => {
  fresh();
  let tree = page();
  const range = () => textOf(byTestId(tree, "cal-range"));
  assert.equal(range(), "Sep 7 – 13");
  // A key as the window hears it, after anything under it had its turn.
  const key = (k, defaultPrevented = false) => {
    let taken = false;
    for (const fn of listeners.keydown ?? [])
      fn({
        key: k,
        defaultPrevented,
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
  // What is open in the app's root, as the page asks the document (People's PL_OVERLAY rule).
  let open = null;
  const hadQuery = globalThis.document.querySelector;
  globalThis.document.querySelector = (sel) => (open && sel.split(",").some((s) => s.trim() === open) ? {} : null);
  try {
    // The board's own peek is no overlay over it: the board asks it first, and its Escape closes it.
    byTestId(tree, "cal-block").props.onClick();
    tree = page();
    assert.ok(byTestId(tree, "cal-panel"));
    assert.equal(key("Escape"), true, "Escape is the peek's");
    tree = page();
    assert.equal(byTestId(tree, "cal-panel"), null, "and closes it");
    // Something open over the peek (its More, the deal sheet) has the keys, Escape too.
    byTestId(tree, "cal-block").props.onClick();
    tree = page();
    open = '.app-root [role="menu"]';
    assert.equal(key("Escape"), false, "Escape is the menu's over the peek");
    assert.equal(key("j"), false, "and the walk waits for it");
    tree = page();
    assert.ok(byTestId(tree, "cal-panel"), "the peek stays under it");
    open = null;
    key("Escape");
    tree = page();
    // The deal sheet, the kit's sheets, or anything else open over the page, has the keys.
    open = '.app-root [role="dialog"]:not(.cal-side)';
    for (const k of ["ArrowRight", "ArrowLeft", "t"]) assert.equal(key(k), false, `${k} is the sheet's`);
    tree = page();
    assert.equal(range(), "Sep 7 – 13", "REGRESSION: the arrows in the deal sheet moved the board behind it");
    open = '.sheet[role="dialog"]';
    assert.equal(
      key("ArrowRight"),
      false,
      "REGRESSION: a kit sheet (Hours and rules) let the arrows move the days behind it",
    );
    open = '.app-root [role="menu"]';
    assert.equal(key("ArrowRight"), false, "a menu has the keys too");
    open = null;
    assert.equal(key("ArrowRight", true), false, "a key something took before the window heard it is not the board's");
    tree = page();
    assert.equal(range(), "Sep 7 – 13");
    assert.equal(key("ArrowRight"), true, "with nothing open the arrows move the board");
    tree = page();
    assert.equal(range(), "Sep 14 – 20");
  } finally {
    if (hadQuery === undefined) delete globalThis.document.querySelector;
    else globalThis.document.querySelector = hadQuery;
  }
});

test("REGRESSION (B11): days that could not be read say so with a Retry, and are not left dimmed as if still loading -- a toast said it once and faded", async () => {
  // A window that starts a week after today's: today's week has to be read.
  const later = dto({ from: "2026-09-14", to: "2026-09-20" });
  later.days = later.days.map((d, i) => ({ key: shiftKey("2026-09-14", i), items: [], windows: [] }));
  fresh(later, [false, false, true]);
  page();
  await settle();
  let tree = page();
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
  assert.ok(
    cols.every((c) => classes(c).includes("unread")),
    "the board marks the days it could not read",
  );

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

test("the views are the frame's strip, where every page's row of views stands, and not the page's: the bar is the range with its steps, then the page's options", () => {
  // They were a segmented control of the page's own, dressed as the strip, inside the page's view: it wore the strip's glass
  // a beat late on every arrival (Ruben, 11 Oct 2026). The frame draws them now (chrome.ts, calendar-surface.test.mjs).
  fresh();
  const tree = page();
  const bar = byTestId(tree, "cal-bar");
  const parts = (bar.props.children ?? []).flat().filter((n) => n && typeof n === "object");
  assert.deepEqual(
    parts.map((n) => n.props.className),
    ["cal-when", "cal-tools"],
    "the range with its steps, then the page's options",
  );
  assert.equal(
    find(
      tree,
      (n) => Array.isArray(n.props?.options) && n.props.options.some((o) => o.testid?.startsWith("cal-view-")),
    ),
    null,
    "REGRESSION: a strip of views of the page's own",
  );
});

test("REGRESSION (B12): the range names the days on screen in every view -- a line over the board said 'This week' of next week and 'This month' of any month", () => {
  fresh();
  let tree = page();
  const label = () => textOf(byTestId(tree, "cal-range"));
  const go = (id) => {
    if (id.startsWith("cal-view-")) pickView(tree, id.slice("cal-view-".length));
    else byTestId(tree, id).props.onClick();
    tree = page();
  };
  assert.equal(label(), "Sep 7 – 13");
  go("cal-next");
  assert.equal(label(), "Sep 14 – 20");
  go("cal-today");
  assert.equal(label(), "Sep 7 – 13");
  go("cal-view-month");
  assert.equal(label(), "September 2026");
  go("cal-next");
  assert.equal(label(), "October 2026");
  go("cal-today");
  go("cal-view-agenda");
  assert.equal(label(), "Sep 8 – 21");
  go("cal-next");
  assert.equal(label(), "Sep 22 – Oct 5");
  go("cal-today");
  go("cal-view-day");
  assert.equal(label(), "Tue · Sep 8");
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
    ruleLines(tree, "Booking"),
    vm.ruleParts,
    "each rule a line of its own in Hours and rules, so a narrow screen wraps between rules, never inside one",
  );
  // The board says one thing at a time over its days (CAL-12): the first the read left out, explained; the next when it is gone.
  assert.match(textOf(byTestId(tree, "cal-notice-note-repeats")), /2 repeating events count only once\./);
  assert.equal(byTestId(tree, "cal-notice-note-undrawn"), null, "one notice, never a stack of them over the first day");
  fresh(counted(0, 3));
  assert.match(textOf(byTestId(page(), "cal-notice-note-undrawn")), /3 more events aren't drawn\./);
});

test("the board is drawn in hours of the stylesheet's hour (--cal-hour): one value moves every block, band, tick and the now line, so a phone fits the day by setting it", () => {
  // The blocks stood at 64px an hour in pixels of their own; a phone's board that fits the room the page leaves needs
  // the hour to be one value (blocks.tsx CrBoard sets it, calendar.css reads it), and every length a share of it.
  fresh();
  const tree = page();
  const vm = toCalendarVM(dto(), NOW);
  const grid = find(tree, (n) => /\bcal-grid\b/.test(String(n.props?.className ?? "")));
  assert.ok(grid, "the week grid");
  assert.equal(
    grid.props.style["--cal-hours"],
    vm.hours.end - vm.hours.start,
    "how many hours tall, for the stylesheet",
  );
  const cols = all(tree, (n) => n.props?.["data-testid"] === "cal-col");
  assert.equal(cols.length, 7);
  assert.ok(
    cols.every((c) => c.props.style === undefined),
    "a column's height is the stylesheet's (--cal-hours of --cal-hour), not pixels of its own",
  );
  const hours = /^calc\([\d.]+ \* var\(--cal-hour\)\)$/;
  const block = byTestId(tree, "cal-block");
  assert.ok(block, "the week's appointment");
  assert.match(block.props.style.top, hours, "a block starts so many hours down");
  assert.match(
    block.props.style.height,
    /^max\(22px, calc\([\d.]+ \* var\(--cal-hour\)\) - 2px\)$/,
    "and runs so many hours, never under the two lines it holds",
  );
  const tick = find(tree, (n) => /\bcal-hour\b/.test(String(n.props?.className ?? "")));
  assert.match(tick.props.style.top, hours, "an hour's label stands at its hour");
  const band = find(tree, (n) => /\bcal-unavail\b/.test(String(n.props?.className ?? "")));
  assert.ok(band, "a band outside the hours");
  assert.match(band.props.style.top, hours);
  assert.match(band.props.style.height, hours);
});

test("what fits a phone's board: the room shared by the day's hours, in whole pixels, never under the floor a half-hour block needs", () => {
  assert.equal(fitHourPx(540, 9), 60, "a salon's nine hours in 540px: sixty to the hour, and the day holds still");
  assert.equal(fitHourPx(545, 9), 60, "whole pixels, so the hour lines stay crisp");
  assert.equal(
    fitHourPx(373, 9),
    41,
    "nine hours in the room a 375px phone leaves: just over the floor, and the day fits",
  );
  assert.equal(
    fitHourPx(373, 11),
    CR_HOUR_MIN_PX,
    "eleven hours there would be 33: the floor holds, and the day scrolls inside its pane",
  );
  assert.equal(
    fitHourPx(450, 14),
    CR_HOUR_MIN_PX,
    "seven in the morning to eight at night in 450px would be 32: the floor too",
  );
  assert.equal(fitHourPx(0, 9), CR_HOUR_MIN_PX, "no room yet (nothing laid out) is the floor, never nothing");
  assert.equal(fitHourPx(-10, 9), CR_HOUR_MIN_PX, "a room the heads outgrow is the floor too");
  assert.equal(fitHourPx(500, 0), 500, "a day of no hours divides by one, never by nothing");
});

test("REGRESSION (B28): a phone opens on the agenda -- it opened on a week grid four times the screen's width", () => {
  fresh();
  globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
  try {
    const tree = page();
    assert.equal(shownView(tree), "agenda");
    assert.ok(byTestId(tree, "cal-agenda"), "the days as a list");
    assert.equal(byTestId(tree, "cal-col"), null, "no week grid");
  } finally {
    delete globalThis.window.matchMedia;
  }
  fresh();
  assert.equal(shownView(page()), "week", "a desk keeps the week");
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
  // The shared row (the kit's agenda), not a second one of the Calendar's own.
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
  globalThis.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  try {
    at("calendar/2026-09-10");
    const tree = page();
    assert.equal(shownView(tree), "day");
    assert.equal(textOf(byTestId(tree, "cal-range")), "Thu · Sep 10");
  } finally {
    delete globalThis.window.matchMedia;
  }
});

// The week with the record's row for each visit on it (CalendarItemDto.visit): Tuesday's Ana Ruiz is row v-ana, and one
// said cancelled (struck on the board, but drawn) is row v-gone.
const withVisits = () => {
  const week = dto();
  week.days[1].items[0].visit = { id: "v-ana", status: "booked" };
  week.days[4].items.push({
    id: "e3",
    start: "2026-09-11T18:00:00.000Z",
    end: "2026-09-11T19:00:00.000Z",
    title: "Lia Mora · Cut",
    all_day: false,
    person: null,
    visit: { id: "v-gone", status: "cancelled" },
  });
  return week;
};
/** The open visit's name (the peek's), or null. */
const openName = (tree) => byTestId(tree, "cal-panel")?.props["aria-label"] ?? null;

test("(A1, D1) a link to a visit opens its panel once its block is drawn, on the day it names; closed, the address is the day's again", () => {
  fresh(withVisits());
  at("calendar/2026-09-08:a-v-ana");
  let tree = page();
  assert.equal(shownView(tree), "day", "the day it names is opened");
  tree = page();
  assert.equal(openName(tree), "Color", "the visit the id names, found by its row and not by its block's id");
  assert.equal(textOf(byTestId(tree, "cal-visit-door")), "Ana Ruiz");
  went.length = followed = 0;
  assert.equal(press("Escape"), true, "closed as any panel is");
  assert.deepEqual(went, ["calendar/2026-09-08"], "a panel a link opened closes to the place the board stands");
  tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null);
  press("ArrowRight");
  tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null, "and it opens once: a move of the board does not open it again");
});

test("(lane A) a visit opened on the board names the view and the day behind it in the address, so a refresh or a copied link opens the same; a walk replaces it", () => {
  fresh(withVisits());
  at("calendar/week");
  let tree = page();
  went.length = followed = 0;
  byTestId(tree, "cal-block").props.onClick();
  assert.deepEqual(went, ["calendar/week:2026-09-08:a-v-ana"], "the week stays the week behind it");
  tree = page();
  assert.equal(shownView(tree), "week");
  assert.equal(openName(tree), "Color");
  // Opened again from that address alone (a refresh): the same visit, over the same week.
  fresh(withVisits());
  at("calendar/week:2026-09-08:a-v-ana");
  page();
  tree = page();
  assert.equal(shownView(tree), "week", "REGRESSION: a visit's link opened Day view, whatever it was opened over");
  assert.equal(openName(tree), "Color");
});

test("(A1) calendar/a-<id>, which names no day, opens the panel of a visit among the days the board holds, and a cancelled visit is still a visit to read", () => {
  fresh(withVisits());
  at("calendar/a-v-gone");
  page();
  const tree = page();
  assert.ok(byTestId(tree, "cal-panel"), "the Calendar's week holds it, struck as it is on the board");
  assert.match(openName(tree), /Cut/);
  assert.equal(textOf(byTestId(tree, "cal-visit-state")), "Cancelled");
});

test("(A1) a visit the days drawn do not hold opens nothing, and says nothing wrong", () => {
  fresh(withVisits());
  at("calendar/2026-09-08:a-v-nobody");
  page();
  const tree = page();
  assert.equal(byTestId(tree, "cal-panel"), null, "no panel for a row the board does not draw");
  assert.ok(byTestId(tree, "calendar-real"), "the board is as it is for the day alone");
});

test("(A1) a window the tab held does not decide for a visit it lacks: the fresh read behind it, landing later, opens the panel", () => {
  honourDeps = true;
  try {
    // The surface value fresh() sets is a held window: read before this page mounted (fetchedAt 1).
    fresh(withVisits());
    at("calendar/2026-09-08:a-v-late");
    let tree = page();
    assert.equal(byTestId(tree, "cal-panel"), null, "the held window does not hold the visit");
    // The read behind it lands, a visit richer.
    const week = withVisits();
    week.days[2].items.push({
      id: "e9",
      start: "2026-09-09T15:00:00.000Z",
      end: "2026-09-09T16:00:00.000Z",
      title: "Noor Ali · Gloss",
      all_day: false,
      person: null,
      visit: { id: "v-late", status: "booked" },
    });
    setSurfaceValue("calendar", { vm: toCalendarVM(week, NOW), fetchedAt: Date.now() + 1000 });
    page();
    tree = page();
    assert.ok(
      byTestId(tree, "cal-panel"),
      "REGRESSION: the held window had marked the visit as not there, and the fresh one never opened it",
    );
    assert.match(openName(tree), /Gloss/);
  } finally {
    honourDeps = false;
  }
});

test("REGRESSION (B19): a sentence that sends the owner to the calendar's address names the tab it is on -- Settings › Business, not Settings › Workspace", () => {
  assert.equal(toBookingReportVM(null).sub, "Add a calendar link under Settings › Business to see who booked.");
  fresh(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    }),
  );
  // With no calendar the card names no tab now: its press opens the Business row itself (the one answer's door,
  // contracts CALENDAR_SETTING_ROUTE), where the sentence sent the owner to the top of a tab to find it.
  const none = textOf(byTestId(page(), "cal-notice-feed"));
  assert.ok(!none.includes("Settings › Workspace"), none);
  went.length = 0;
  byTestId(page(), "cal-feed-door").props.onClick();
  assert.deepEqual(went, ["admin/workspace/calendar"], "the row, not the top of the tab");
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
  const unread = textOf(byTestId(page(), "cal-notice-feed"));
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
/**
 * GET calendar/runs, answered at once: while the board draws its campaigns it reads them beside its weeks on every move
 * (runs-surface.ts), and a test of the board's own reads neither waits on them nor counts them.
 */
const runsRead = (url) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  if (!u.pathname.endsWith("/calendar/runs")) return null;
  const q = Object.fromEntries(u.searchParams);
  const runs = {
    timezone: TZ,
    from: q.from ?? "2026-08-31",
    days: Number(q.days ?? 63),
    paused: false,
    runs: [],
    moments: [],
  };
  return new Response(JSON.stringify({ ok: true, data: { runs } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};

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
  assert.deepEqual(ruleLines(tree, "Booking"), vm.ruleParts, "REGRESSION: the party size was never said");
  const consult = textOf(byTestId(tree, "cal-rules-consult"));
  assert.ok(
    consult.includes("Consultation first") && consult.includes("Balayage · Color correction"),
    `REGRESSION: which services need a consultation was said only inside the service picker: ${consult}`,
  );
  assert.match(
    textIn(byTestId(tree, "cal-rules")),
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

test("REGRESSION (C1): the page says only what it read -- an unreadable calendar showed '0 · on your calendar', and days still on their way counted as empty", () => {
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
  let tree = page();
  assert.match(textOf(byTestId(tree, "cal-notice-feed")), /Your calendar could not be read\./);
  fresh(
    dto({
      feed: { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
      days: empty,
    }),
  );
  tree = page();
  assert.match(textOf(byTestId(tree, "cal-notice-feed")), /No calendar connected\./);
  fresh();
  tree = page();
  byTestId(tree, "cal-next").props.onClick();
  tree = page();
  assert.ok(
    columns(tree).every((c) => classes(c).includes("loading")),
    "REGRESSION: next week, still on its way, read as a week with nothing on the calendar",
  );
});

test("REGRESSION (C1): a day past what the receptionist offers says so, and the legend names the last day it offers -- the agenda said 'nothing the receptionist would offer', as if the day were booked solid", () => {
  fresh(span("2026-09-07", 42, { rules: { lead_hours: 2, buffer_min: 15, max_days_ahead: 7 } }));
  let tree = page();
  pickView(tree, "agenda");
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
  assert.match(legend(tree), /through Sep 14/, "the legend names the last day it offers");
});

test("REGRESSION (C1): leaving the Calendar takes the loaded weeks back to today's -- a board left on another month took Today's day and its next opening with it", async () => {
  fresh();
  page();
  assert.equal(homes, 0, "nothing goes home while the page is open");
  leave();
  assert.equal(homes, 1, "REGRESSION: the page left the window wherever it had moved it");
  // The bridge's half: a moved window goes home; one already home is not read again.
  const { getCalendarSpan, setCalendarSpan } = await import(`${S}/calendar/surface.ts`);
  setSurfaceValue("calendar", { vm: toCalendarVM(span("2026-08-31", 63), NOW), fetchedAt: 1 });
  setCalendarSpan("2026-11-23", 63);
  assert.equal(await realVerbs.home(), true, "a window moved to November goes home");
  assert.equal(getCalendarSpan().from, null, "to the weeks around today");
  assert.equal(await realVerbs.home(), false, "and a window already home stays as it is");
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
  assert.match(textOf(button()), /^Reading…$/, "on its way, it says so");
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
    setSurfaceValue("calendar", {
      vm: toCalendarVM(
        dto({ feed: { ...dto().feed, stale: true, reason: "http", problem: "The calendar answered 503." } }),
        NOW,
      ),
      fetchedAt: 2,
    });
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
  assert.match(textOf(reading), /^Reading…$/, "in the range, where the days on screen are named");
  // The one rule every page dims by (components.css [data-loading] [data-dims]): it dimmed its own way, at once.
  assert.equal(byTestId(tree, "calendar-real").props["data-loading"], "", "the page says its days are on their way");
  assert.equal(byTestId(tree, "cal-body").props["data-dims"], true, "the board is what dims");
  assert.equal(byTestId(tree, "cal-body").props["aria-busy"], "true");
  assert.ok(!String(byTestId(tree, "cal-body").props.className).includes("is-loading"), "not by a page's own class");
  pickView(tree, "agenda");
  tree = page();
  assert.match(textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-day")[0]), /Reading this day/);
  pickView(tree, "month");
  tree = page();
  assert.match(textOf(all(tree, (n) => n.props?.["data-testid"] === "cal-month-cell")[0]), /reading/);
});

test("(C2) the bridge's fresh read asks the route for fresh=1 once, then reads as before", async () => {
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  const { calendarOverride, setCalendarFresh } = await import(`${S}/calendar/surface.ts`);
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
      const runs = runsRead(url);
      if (runs) return runs;
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
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  const { startSurfaces } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const { calendarOverride } = await import(`${S}/calendar/surface.ts`);
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
      const runs = runsRead(url);
      if (runs) return runs;
      seen.push(String(url));
      return new Response(JSON.stringify({ ok: true, data: { calendar: dto() } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const pause = () => new Promise((r) => setTimeout(r, 5));
  // The board watches the record's rows (00345), so the runner wants a feed to join: none of these cases exercises it.
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    for (let i = 0; i < 20 && !seen.length; i += 1) await pause();
    await pause();
    seen.length = 0;
    assert.equal(await realVerbs.refresh({ fresh: true }), true, "a read that landed says so");
    assert.equal(seen.length, 1);
    assert.match(seen[0], /[?&]fresh=1(&|$)/, "REGRESSION: the Refresh read the route's cache");
    await pause();
    assert.equal(await realVerbs.refresh(), true);
    assert.ok(!/fresh=/.test(seen[1]), "the five-minute read reads as before");
  } finally {
    stop();
  }
  try {
    seen.length = 0;
    assert.equal(
      await realVerbs.refresh({ fresh: true }),
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
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  // Measured on the salon's workspace, 22 Sep: the board held one window, so back to this week, and back to December,
  // were 390-500ms of "Reading those days…" each, and leaving for Reports read today's weeks again besides.
  const { startSurfaces } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const { calendarOverride, getCalendarSpan } = await import(`${S}/calendar/surface.ts`);
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
      const runs = runsRead(url);
      if (runs) return runs;
      const q = Object.fromEntries(new URL(String(url), "https://app.chanlytics.com").searchParams);
      // The weeks around today are the route's to work out (`around`), as the board's first read asks for them.
      const w = q.around === "today" ? windowFor(zoneDayKey(Date.now(), TZ)) : { from: q.from, days: Number(q.days) };
      seen.push(w.from);
      await new Promise((r) => parked.push(r));
      return new Response(JSON.stringify({ ok: true, data: { calendar: span(w.from, w.days) } }), {
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
  // The board watches the record's rows (00345), so the runner wants a feed to join: none of these cases exercises it.
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    await release();
    assert.equal(shown(), home, "the weeks around today, read at boot");
    const toNov = realVerbs.goTo("2026-11-23", 63);
    await release();
    assert.equal(await toNov, true);
    assert.equal(shown(), "2026-11-23");
    // Back home: held, so painted before any read lands, and read again behind.
    seen.length = 0;
    let back = false;
    realVerbs.goTo(null).then(() => {
      back = true;
    });
    await pause();
    assert.equal(shown(), home, "REGRESSION: the weeks around today waited on a read of their own");
    assert.equal(back, true, "and the move answered at once");
    assert.deepEqual(seen, [home], "read again behind all the same");
    await release();
    assert.equal(getCalendarSpan().from, null);
    // And back to November: held too.
    realVerbs.goTo("2026-11-23", 63);
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

test("REGRESSION: two moves whose reads overlap land as the second, and neither says it could not read the days -- the first, its answer dropped, put the span back under the second, whose own answer was then dropped too", async () => {
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  const { startSurfaces } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  const { calendarOverride, getCalendarSpan, setCalendarSpan } = await import(`${S}/calendar/surface.ts`);
  const { windowFor, zoneDayKey } = await import("@chanlytics/contracts");
  setCalendarSpan(null);
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
      const runs = runsRead(url);
      if (runs) return runs;
      const q = Object.fromEntries(new URL(String(url), "https://app.chanlytics.com").searchParams);
      const w = q.around === "today" ? windowFor(zoneDayKey(Date.now(), TZ)) : { from: q.from, days: Number(q.days) };
      await new Promise((r) => parked.push(r));
      return new Response(JSON.stringify({ ok: true, data: { calendar: span(w.from, w.days) } }), {
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
  const shown = () => globalThis.window.__CALENDAR?.vm?.from;
  // The board watches the record's rows (00345), so the runner wants a feed to join: none of these cases exercises it.
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    await release();
    // Two windows this tab has never read, so each move waits on its read; the second asked while the first is out.
    const first = "2027-03-01";
    const second = "2027-05-03";
    const toFirst = realVerbs.goTo(first, 63);
    await pause();
    const toSecond = realVerbs.goTo(second, 63);
    await pause();
    assert.equal(parked.length, 2, "both reads are out at once");
    await release();
    assert.equal(await toFirst, true, "REGRESSION: the first move said its days could not be read");
    assert.equal(await toSecond, true, "REGRESSION: and so did the second, though every read landed");
    assert.equal(getCalendarSpan().from, second, "REGRESSION: the first move put the span back under the second");
    assert.equal(shown(), second, "the board shows the weeks asked for last");
  } finally {
    stop();
    await release();
    setCalendarSpan(null);
    Object.assign(globalThis.window, {
      location: was.location,
      fetch: was.fetch,
      __WORKSPACES: was.ws,
      __ACTIVE_WORKSPACE: was.active,
      __CALENDAR: was.cal,
    });
  }
});

test("the weeks a few moves on are the ones to read ahead: none where the loaded weeks cover them, each way's nearest where they do not", async () => {
  const { windowsToWarm } = await import(`${S}/calendar/warm.ts`);
  // Nine weeks from Mon Aug 24 to Sun Oct 25, the window around Sep 8.
  const loaded = toCalendarVM(span("2026-08-24", 63), NOW).days;
  assert.deepEqual(
    windowsToWarm({ view: "week", anchor: "2026-09-08", loaded: [] }),
    [],
    "nothing loaded, nothing to measure from",
  );
  assert.deepEqual(
    windowsToWarm({ view: "week", anchor: "2026-10-06", loaded }),
    [{ from: "2026-09-21", days: 63 }],
    "three weeks from the end: the October window, the one stepping to the week of Oct 26 would read",
  );
  assert.deepEqual(
    windowsToWarm({ view: "week", anchor: "2026-09-08", loaded }),
    [{ from: "2026-07-20", days: 63 }],
    "mid-window, forward is covered for three weeks and back is not: the August window, the one a step before Aug 24 reads",
  );
  assert.deepEqual(
    windowsToWarm({ view: "day", anchor: "2026-09-20", loaded }),
    [],
    "a day looks three days on, which the weeks cover on both sides",
  );
  assert.deepEqual(
    windowsToWarm({ view: "day", anchor: "2026-10-23", loaded }),
    [{ from: "2026-09-21", days: 63 }],
    "and three days from the end it reads ahead",
  );
  assert.deepEqual(
    windowsToWarm({ view: "month", anchor: "2026-09-08", loaded }),
    [
      { from: "2026-09-21", days: 63 },
      { from: "2026-07-20", days: 63 },
    ],
    "a month's neighbours are never in the nine weeks: both are read, the next first",
  );
  assert.deepEqual(
    windowsToWarm({ view: "agenda", anchor: "2026-09-08", loaded }),
    [
      { from: "2026-09-21", days: 63 },
      { from: "2026-07-20", days: 63 },
    ],
    "the agenda steps fortnights, so three steps either way leave the nine weeks",
  );
});

test("a window read ahead is held and paints at once when the board gets there; one for a workspace left is dropped", async () => {
  // The board of the test before goes first: a page still drawn would read its campaigns on every move here.
  leave();
  const { warmCalendar, calendarOverride, setCalendarSpan } = await import(`${S}/calendar/surface.ts`);
  const { startSurfaces } = await import("../../../../apps/dashboard/src/legacy-bridge/surface-runner.ts");
  // The weeks the board last looked at stay with the module: this one begins on the weeks around today.
  setCalendarSpan(null);
  const { windowFor, zoneDayKey, shiftMonth: monthOf } = await import("@chanlytics/contracts");
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
      const runs = runsRead(url);
      if (runs) return runs;
      const q = Object.fromEntries(new URL(String(url), "https://app.chanlytics.com").searchParams);
      // The weeks around today are the route's to work out (`around`), as the board's first read asks for them.
      const w = q.around === "today" ? windowFor(zoneDayKey(Date.now(), TZ)) : { from: q.from, days: Number(q.days) };
      seen.push(w.from);
      await new Promise((r) => parked.push(r));
      return new Response(JSON.stringify({ ok: true, data: { calendar: span(w.from, w.days) } }), {
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
  const today = zoneDayKey(Date.now(), TZ);
  const home = windowFor(today).from;
  const next = windowFor(monthOf(today, 1)).from;
  const before = windowFor(monthOf(today, -1)).from;
  const shown = () => globalThis.window.__CALENDAR?.vm?.from;
  // The board watches the record's rows (00345), so the runner wants a feed to join: none of these cases exercises it.
  const stop = startSurfaces([calendarOverride], () => () => {});
  try {
    await release();
    assert.equal(shown(), home, "the weeks around today, read at boot");
    seen.length = 0;
    realVerbs.warmAround("month", today);
    await release();
    assert.deepEqual([...seen].sort(), [before, next].sort(), "the month either side was read, and nothing else");
    assert.equal(shown(), home, "reading ahead paints nothing");
    // Again: they are held, so no read is made for them.
    seen.length = 0;
    realVerbs.warmAround("month", today);
    await release();
    assert.deepEqual(seen, [], "a window already held is not read twice");
    // And the move to one paints before any read lands; the read behind keeps it current.
    const arrived = realVerbs.goTo(next, 63);
    await pause();
    assert.equal(shown(), next, "REGRESSION: stepping to a month read ahead waited on a read of its own");
    assert.equal(await arrived, true);
    await release();
    // A window that lands after the tab changed workspace is not held under the other one.
    seen.length = 0;
    const far = windowFor(monthOf(today, 7)).from;
    const reading = warmCalendar({ from: far, days: 63 });
    await pause();
    assert.deepEqual(seen, [far], "the read was made");
    // The workspace is the address's (/w/<slug>): the tab moved to another while the read was on its way.
    globalThis.window.location.pathname = "/w/ridge";
    await release();
    await reading;
    // Held under the workspace it landed in, it would paint there at once: it was read for the one the tab left.
    realVerbs.goTo(far, 63);
    await pause();
    assert.notEqual(shown(), far, "REGRESSION: the weeks of a workspace the tab left were held for the one it is on");
    await release();
    globalThis.window.location.pathname = "/w/harbor";
    setCalendarSpan(null);
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

test("a read ahead that fails costs nothing: the move reads the window when it is made", async () => {
  const { warmCalendar } = await import(`${S}/calendar/surface.ts`);
  const was = globalThis.window.fetch;
  globalThis.window.fetch = async () => new Response("{}", { status: 500 });
  try {
    await warmCalendar({ from: "2031-03-03", days: 63 });
  } finally {
    globalThis.window.fetch = was;
  }
});

test("the board reads the weeks beside it once it has stood still for a second: not as it draws, not in a demo, not after it has gone", () => {
  const timers = [];
  const real = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
  globalThis.setTimeout = (fn, ms) => {
    timers.push({ fn, ms, cleared: false });
    return timers.length - 1;
  };
  globalThis.clearTimeout = (id) => {
    if (timers[id]) timers[id].cleared = true;
  };
  const warmTimers = () => timers.filter((t) => t.ms === CR_WARM_MS);
  try {
    fresh();
    page();
    assert.deepEqual(warmed, [], "nothing is read the moment the board draws");
    assert.equal(warmTimers().length, 1, "it waits a beat first");
    warmTimers()[0].fn();
    assert.deepEqual(warmed, [["week", "2026-09-08"]], "then asks for the weeks round the view on screen");
    leave();
    assert.equal(warmTimers()[0].cleared, true, "a board that goes first reads nothing");
    // A demo has no calendar to read from.
    timers.length = 0;
    globalThis.window.__DEMO_MODE = true;
    fresh();
    page();
    assert.equal(warmTimers().length, 0, "a demo asks for no read");
  } finally {
    globalThis.window.__DEMO_MODE = false;
    globalThis.setTimeout = real.set;
    globalThis.clearTimeout = real.clear;
  }
});

test("the view the member chose is the one the board opens on again in this tab; a link's day and the phone's agenda are only defaults", () => {
  const kept = [];
  const store = {};
  globalThis.window.__tabMemory = {
    place: (p, v) => store[`${p}|${v}`] ?? null,
    keepPlace: (p, v, place) => {
      kept.push([p, v, place]);
      store[`${p}|${v}`] = place;
    },
  };
  // The view kept follows the address's word as it changes, as React runs an effect whose dependency moved.
  honourDeps = true;
  try {
    fresh();
    let tree = page();
    assert.equal(shownView(tree), "week", "nothing kept: a desk opens on the week");
    pickView(tree, "month");
    page();
    assert.deepEqual(kept, [["calendar", "board", { view: "month" }]], "picking a view keeps it");
    fresh();
    assert.equal(shownView(page()), "month", "a refresh, or a trip away and back, opens on it");
    globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
    try {
      fresh();
      assert.equal(shownView(page()), "month", "and a phone that chose it keeps it over the agenda");
    } finally {
      delete globalThis.window.matchMedia;
    }
    fresh();
    at("calendar/2026-09-10");
    assert.equal(shownView(page()), "day", "a link to a day opens the day");
    assert.equal(kept.length, 1, "which is where the board went, not a choice, and keeps nothing");
    store["calendar|board"] = { view: "year" };
    fresh();
    assert.equal(shownView(page()), "week", "a view the board does not draw is not opened on");
  } finally {
    honourDeps = false;
    delete globalThis.window.__tabMemory;
  }
});

/* ------------------------------- C3: one word per thing ------------------------------- */

// The week with the receptionist's next open time as the route sends it: today at 3:30 PM.
const withNext = (over = {}) =>
  dto({ next_opening: { start: "2026-09-08T19:30:00.000Z", end: "2026-09-08T22:00:00.000Z" }, ...over });

test("REGRESSION (C3): the times the receptionist would offer are open times wherever they are named -- the strip said 'Open windows' and 'Next opening', the service picker 'Windows', and Today 'next opening', while Business and Ask say open times", () => {
  fresh(withNext({ services: [{ name: "Balayage", duration_min: 90, consult_first: false }] }));
  const tree = page();
  assert.match(legend(tree), /Open is a time the receptionist would offer, through/);
  assert.equal(
    byTestId(tree, "cal-service").props.label,
    "Open times that fit a service",
    "REGRESSION: 'Windows that fit a service'",
  );
  const vm = toCalendarVM(withNext(), NOW);
  assert.equal(todayDay(vm, null).nextOpening, "today 3:30 PM", "REGRESSION: Today's day said 'next opening'");
  const was = { cal: globalThis.window.__CALENDAR };
  Object.assign(globalThis.window, { __CALENDAR: { vm } });
  try {
    cells = [];
    frames.begin();
    // The strip draws it as "Next open time {this}" (strip.tsx), from the day the strip and the brief both read.
    assert.equal(useDayVm().nextOpening, "today 3:30 PM", "REGRESSION: Today's day said 'next opening'");
  } finally {
    Object.assign(globalThis.window, { __CALENDAR: was.cal });
  }
});

test("REGRESSION (C3): what could not be read is said one way -- a month's days said 'not read' and the strip 'couldn't be read', beside the Retry line's 'Couldn't read those days'", async () => {
  fresh(dto(), [false]);
  honourDeps = true;
  try {
    let tree = page();
    pickView(tree, "month");
    page();
    await settle();
    tree = page();
    const unread = all(
      tree,
      (n) =>
        String(n.props?.className ?? "").split(" ")[0] === "cal-month-cell" &&
        String(n.props.className).includes("unread"),
    );
    assert.ok(unread.length > 0, "the month's days outside the loaded week could not be read");
    assert.ok(
      unread.every((n) => textOf(n).includes("couldn't read")),
      `REGRESSION: 'not read': ${textOf(unread[0])}`,
    );
    assert.match(
      textOf(byTestId(tree, "cal-failed")),
      /Couldn't read those days/,
      "beside the Retry line, which says it the same way",
    );
  } finally {
    honourDeps = false;
  }
});

test("REGRESSION (C3): the rules bar says what Business calls each thing -- 'Rules' for the booking rules, 'Edit in Settings' for a tab named Business, and a closure run into its note", () => {
  fresh();
  const bar = byTestId(page(), "cal-rules");
  assert.deepEqual(
    all(bar, (n) => n.props?.className === "cal-rules-label").map(textOf),
    ["Hours ", "Closed ", "Booking ", "Booking tool "],
    "REGRESSION: 'Rules'; and what the business books with is 'Booking tool', here as on Business (spec §10)",
  );
  // Each name is the door to the Business row of that name (7 Oct 2026): the sheet had one door, to the top of the tab.
  went.length = 0;
  for (const row of ["hours", "closures", "booking_rules", "calendar"])
    byTestId(bar, `cal-rules-door-${row}`).props.onClick();
  assert.deepEqual(went, [
    "admin/workspace/hours",
    "admin/workspace/closures",
    "admin/workspace/booking_rules",
    "admin/workspace/calendar",
  ]);
  assert.ok(textIn(bar).includes("Sep 12 (Wedding)"), `REGRESSION: 'Sep 12 Wedding': ${textIn(bar)}`);
  // Each door says where it goes, for a tab named Business: 'Edit in Settings' named a tab there is none of.
  assert.deepEqual(
    [...new Set(all(bar, (n) => /^cal-rules-door-/.test(n.props?.["data-testid"] ?? "")).map((n) => n.props.title))],
    ["Change it in Settings › Business"],
    "REGRESSION: 'Edit in Settings', for a tab named Business",
  );
  assert.equal(
    find(bar, (n) => n.type === "button" && textOf(n).startsWith("Edit in")),
    null,
    "and no second door",
  );
});

test("REGRESSION (C3): hours are said in the board's clock -- the bar said 'Mon–Tue 09:00–18:00' over a board drawn in 9 AM, a morning-to-midnight day could read '10 – 12 AM', and a day with half its hours said the prompt's 'ask them to call' to the owner", () => {
  fresh();
  // Each run of days on a line of its own (24 Sep): they ran on in one sentence joined by dots.
  const hours = find(
    byTestId(page(), "cal-rules"),
    (n) => n.props?.className === "cal-rules-group" && textOf(n).startsWith("Hours"),
  );
  assert.deepEqual(
    all(hours, (n) => n.props?.className === "cal-rules-line").map(textOf),
    ["Mon–Tue 9 AM – 6 PM", "Wed 9 AM – 1 PM and 3 – 7 PM", "Thu–Fri 9 AM – 6 PM", "Sat 10 AM – 4 PM", "Sun closed"],
    `REGRESSION: 09:00–18:00: ${textOf(hours)}`,
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
  const card = byTestId(page(), "cal-notice-feed");
  assert.deepEqual(
    all(card, (n) => n.type === "button").map(textOf),
    ["Connect your calendar"],
    "REGRESSION: 'Paste the address', to a business that may have no address to paste: the one answer's own press",
  );
  assert.match(textOf(card), /No calendar connected\./);
  // Bookings arriving by email and no calendar (00345): the card says so in the one answer's words, and asks for a
  // press only where something is the owner's to do -- the emails held for a look.
  const feedNone = {
    present: false,
    state: "none",
    read_at: null,
    events: 0,
    recurring_expanded: 0,
    skipped_recurring: 0,
  };
  const byEmail = (over = {}) => ({
    tool: "booksy",
    address: "salon@mail.example.com",
    last_at: "2026-09-08T14:00:00.000Z",
    count: 3,
    held: 0,
    held_list: [],
    forwarding: null,
    ...over,
  });
  fresh(dto({ feed: { ...feedNone, notices: byEmail() } }));
  tree = page();
  assert.equal(byTestId(tree, "cal-feed-door"), null, "emails that work ask nothing: no press");
  assert.equal(
    byTestId(tree, "cal-notice-feed"),
    null,
    "and nothing over the board: the board says only the exception",
  );
  assert.match(textIn(byTestId(tree, "cal-rules")), /Booksy/, "Hours and rules says where the bookings come from");
  fresh(dto({ feed: { ...feedNone, notices: byEmail({ held: 2 }) } }));
  let door = byTestId(page(), "cal-feed-door");
  assert.equal(textOf(door), "Look at them");
  assert.equal(door.props.variant, "primary", "emails held for a look are the primary act");
  assert.match(textOf(byTestId(page(), "cal-feed-notices")), /2 booking emails need a look\./);
  // A tool named and no email yet: the steps, offered quietly; a business that books by hand is told nothing.
  fresh(dto({ feed: { ...feedNone, notices: byEmail({ last_at: null, count: 0 }) } }));
  door = byTestId(page(), "cal-feed-door");
  assert.equal(textOf(door), "See the steps");
  assert.equal(door.props.variant, "quiet");
  fresh(dto({ feed: { ...feedNone, by_hand: true } }));
  assert.equal(byTestId(page(), "cal-notice-feed"), null, "booked by hand, by the owner's own word: no card");
  fresh();
  tree = page();
  assert.equal(toCalendarVM(dto(), NOW).zoneCity, "New York");
  assert.match(legend(tree), /Times are New York time/, "REGRESSION: 'times in America/New_York'");
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
  byTestId(tree, "cal-service").props.onValueChange("Color correction");
  tree = page();
  pickView(tree, "agenda");
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
  const { installBusinessTab } = await import("../../../../apps/dashboard/src/legacy-bridge/business-tab.ts");
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
  page();
  tree = page();
  assert.equal(shownView(tree), "day");
  assert.equal(textOf(byTestId(tree, "cal-range")), "Thu · Sep 10");
  assert.equal(opens().length, 0, "in Day view the head opens nothing");
});

test("REGRESSION (C4): a month day names its date and what it holds -- a screen reader heard '8', '1 taken', '1 open' with no date, and nothing said which day was today", async () => {
  fresh(dto(), [false]);
  honourDeps = true;
  try {
    let tree = page();
    pickView(tree, "month");
    page();
    await settle();
    tree = page();
    const cell = (key) => monthDay(tree, key);
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

test("REGRESSION (C4): a move of the board is announced -- the range changed in silence", () => {
  fresh();
  const tree = page();
  assert.equal(
    byTestId(tree, "cal-range").props["aria-live"],
    "polite",
    "REGRESSION: the new range was never announced",
  );
});

test("REGRESSION: the Calendar draws no key -- its legend said ← → move · T today, and Previous, Today and Next named ←, T and → in their tips, beside the ? sheet that lists them", () => {
  fresh();
  const tree = page();
  assert.equal(
    find(tree, (n) => n.props?.className === "cal-keys"),
    null,
    "the legend's keys",
  );
  assert.match(legend(tree), /Times are New York time\.$/, "the zone, the legend's last word");
  assert.equal(
    find(tree, (n) => n.props?.testid === "cal-rules")?.props.sub,
    "Times are New York time",
    "and Hours and rules says it under its name",
  );
  assert.deepEqual(
    ["cal-prev", "cal-today", "cal-next"].map((id) => byTestId(tree, id).props.title),
    ["Previous", undefined, "Next"],
    "the arrows' tips name them, and Today says Today already",
  );
  assert.deepEqual(keysDrawn(tree), []);
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
  // Every control in one bar, and the kit's date picker opened by the range; the views are the frame's strip over it.
  const bar = byTestId(tree, "cal-bar");
  for (const id of [
    "cal-prev",
    "cal-today",
    "cal-next",
    "cal-range",
    "cal-jump",
    "cal-service",
    "cal-show",
    "cal-options",
  ])
    assert.ok(byTestId(bar, id), `${id} is in the one bar`);
  assert.equal(
    find(bar, (n) => n.type === "select"),
    null,
    "REGRESSION: a native select in the bar",
  );
  const pick = picker(bar);
  assert.ok(pick, "the range opens the kit's date picker, not the browser's date field");
  assert.ok(
    byTestId(pick.props.trigger, "cal-range") && byTestId(pick.props.trigger, "cal-jump") === pick.props.trigger,
    "the range and the control that opens the picker are one",
  );
  assert.equal(
    find(bar, (n) => n.type === "input" && n.props?.type === "date"),
    null,
    "REGRESSION: a native date input",
  );
  // On a desk the bar is the act on the frame's row of views (board-parts.tsx calendarAct), and the page draws no head of its
  // own: a line of counts under the bar said again what the board draws (22 Sep), and the bar's own row stood between the
  // views and the first day (Ruben, 14 Oct 2026: one row, where the tabs are).
  assert.equal(
    find(tree, (n) => n.props?.className === "cal-head"),
    null,
    "no head between the views and the board on a desk",
  );
  assert.equal(bar.props.className, "cal-act", "the bar is the act the frame draws beside the views");
  // The hours, the rules, the calendar's source and Refresh are a sheet Settings opens (D6), never a fold under the board,
  // whose foot took the room an eleven-hour day needed on a phone; the booking link is Settings' own two items.
  const rules = () => find(tree, (n) => n.props?.testid === "cal-rules");
  assert.equal(rules().props.open, false, "shut until asked for");
  for (const id of ["cal-feed", "cal-refresh"]) {
    assert.ok(byTestId(rules(), id), `${id} is in Hours and rules`);
    assert.equal(byTestId(bar, id), null, `${id} is not among the controls`);
  }
  assert.deepEqual(
    barMenu(tree, "Calendar settings").props.groups.map((g) => [g.header, g.items.map((i) => i.label)]),
    [
      ["Booking link", ["Open the booking page", "Copy the link"]],
      ["Calendar", ["Read it again now", "Hours and rules", "Booking tool"]],
    ],
    "what the calendar offers its owner, in one menu at the bar's end",
  );
  assert.ok(settingsItem(tree, "Copy the link").copy, "the link copied in place, the menu held open (CAL-23)");
  settingsItem(tree, "Hours and rules").onSelect();
  tree = page();
  assert.equal(rules().props.open, true, "one tap shows them");
  rules().props.onClose();
  tree = page();
  assert.equal(rules().props.open, false, "and the sheet's close puts them away");
  assert.equal(
    find(tree, (n) => n.props?.["data-testid"] === "cal-about"),
    null,
    "REGRESSION: the fold under the board",
  );
  // A calendar that can't be read still says so over the board, with its Retry, not in the sheet.
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
  assert.ok(byTestId(tree, "cal-notice-feed") && byTestId(tree, "cal-feed-retry"), "the notice and its Retry");
  assert.equal(byTestId(rules(), "cal-notice-feed"), null, "over the board, not in the sheet");
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
  byTestId(tree, "cal-service").props.onValueChange("Color correction");
  tree = page();
  assert.equal(openTimes(tree).length, 2, "REGRESSION: no open time fit Color correction");
  assert.match(legend(tree), /would offer for a consultation, through Sep 21/);
  assert.match(
    textOf(byTestId(tree, "cal-notice-consult")),
    /The open times here are for a consultation, about 30 minutes\./,
  );
  pickView(tree, "agenda");
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
  byTestId(tree, "cal-service").props.onValueChange("Balayage");
  tree = page();
  assert.equal(openTimes(tree).length, 1);
  assert.match(legend(tree), /would offer for Balayage,/);
});

test("the page publishes how long it keeps a read and its words for a read that gives no reason, and says those words itself", () => {
  // Settings › Business states the same calendar's last read in a row of its own (surfaces/settings/business/open.tsx), for as long
  // as this board keeps one, and in these words: one number and one spelling, this page's.
  const keeps = CALENDAR_PAGE;
  assert.equal(keeps.refreshMs, 5 * 60 * 1000, "the five minutes after which the board reads itself again");
  assert.deepEqual(Object.keys(keeps.words).sort(), ["stale", "unavailable"]);
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "unreachable", problem: null } }));
  assert.ok(
    textOf(byTestId(page(), "cal-notice-stale")).includes(keeps.words.stale),
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
    textOf(byTestId(page(), "cal-notice-feed")).includes(keeps.words.unavailable),
    "and the card over a calendar that could not be read",
  );
  // A reason of the read's own wins over both.
  fresh(dto({ feed: { ...dto().feed, stale: true, reason: "http", problem: "The calendar answered 503." } }));
  const said = textOf(byTestId(page(), "cal-notice-stale"));
  assert.ok(said.includes("The calendar answered 503.") && !said.includes(keeps.words.stale), said);
});

test("the Calendar tells Ask what it draws (the Phase 2 plan, D3): the span on screen, and the people its appointments there name, in the board's order", () => {
  // Nine weeks loaded, one drawn.
  fresh(span("2026-08-31", 63));
  const vm = globalThis.window.__CALENDAR.vm;
  // Two appointments in the week on screen name people; one a month out does not count.
  const day = vm.days.find((d) => d.key === vm.today);
  const ahead = vm.days[vm.days.length - 1];
  const block = (id, name) => ({
    ...(day.blocks[0] ?? {}),
    id: `b-${id}`,
    person: {
      id,
      name,
      via: null,
      threadId: null,
      bookingLinkAction: {
        label: "Send the booking link",
        short: "Send the link",
        title: "",
        ready: false,
        offered: true,
      },
    },
  });
  day.blocks = [block("p-rosa", "Rosa Díaz"), block("p-ana", "Ana Ruiz"), block("p-rosa", "Rosa Díaz")];
  ahead.blocks = [block("p-far", "Far Away")];
  delete globalThis.window.__askOnScreen;
  page();
  const s = globalThis.window.__askOnScreen;
  assert.equal(s.key, "calendar");
  assert.match(s.view, /^\d{4}-\d{2}-\d{2}\/\d+$/, "the span drawn: its first day and how many");
  assert.deepEqual(s.ids, ["p-rosa", "p-ana"], "each person once, in the board's order, and only the days on screen");
  assert.deepEqual(s.labels, ["Rosa Díaz", "Ana Ruiz"]);
  leave();
  assert.equal(globalThis.window.__askOnScreen, null, "the board gone, its people are no longer on screen");
});

test("every testid the page is known by is drawn in its view, the date picker follows the anchor, and nothing on the page moves, cancels, syncs two ways or prices", () => {
  const services = [{ name: "Balayage", duration_min: 90, consult_first: true }];
  const week = dto({
    services,
    rules: { ...dto().rules, consult_first: ["Balayage"] },
    feed: { ...dto().feed, skipped_recurring: 1, dropped: 1 },
  });
  fresh(week);
  let tree = page();
  const drawn = [];
  const has = (id) => !!byTestId(tree, id);
  const expectIds = (view, ids) => {
    for (const id of ids) assert.ok(has(id), `${view}: ${id}`);
    drawn.push(textOf(tree));
  };
  expectIds("week", [
    "calendar-real",
    "cal-pane",
    "cal-bar",
    "cal-prev",
    "cal-today",
    "cal-next",
    "cal-range",
    "cal-jump",
    "cal-service",
    "cal-body",
    "cal-dayhead",
    "cal-dayhead-open",
    "cal-col",
    "cal-block",
    "cal-window",
    "cal-show",
    "cal-options",
    "cal-rules",
    "cal-feed",
    "cal-feed-state",
    "cal-refresh",
    "cal-notice-note-repeats",
  ]);
  assert.equal(picker(tree).props.value, "2026-09-08", "the date picker follows the anchor");
  assert.equal(picker(tree).props.today, "2026-09-08", "and is told which day is today, the business's");
  byTestId(tree, "cal-next").props.onClick();
  tree = page();
  assert.equal(picker(tree).props.value, "2026-09-15", "and the anchor is what a step moves");
  picker(tree).props.onValueChange("2026-09-22");
  tree = page();
  assert.equal(picker(tree).props.value, "2026-09-22", "a day chosen in the picker is where the board goes");
  byTestId(tree, "cal-today").props.onClick();
  byTestId(tree, "cal-service").props.onValueChange("Balayage");
  tree = page();
  expectIds("a service that needs a consultation", ["cal-notice-consult"]);
  pickView(tree, "month");
  tree = page();
  expectIds("month", ["cal-month", "cal-month-cell"]);
  pickView(tree, "agenda");
  tree = page();
  expectIds("agenda", ["cal-agenda", "cal-agenda-day", "cal-agenda-item"]);
  pickView(tree, "day");
  tree = page();
  expectIds("day", ["cal-col", "cal-block"]);
  byTestId(tree, "cal-block").props.onClick();
  tree = page();
  expectIds("the appointment", ["cal-panel", "cal-panel-when", "cal-visit", "cal-visit-person", "cal-visit-foot"]);
  for (const feed of [
    { present: false, state: "none", read_at: null, events: 0, recurring_expanded: 0, skipped_recurring: 0 },
    { ...dto().feed, stale: true, reason: "http" },
  ]) {
    fresh(dto({ feed }));
    tree = page();
    expectIds(feed.state, [has("cal-notice-feed") ? "cal-notice-feed" : "cal-notice-stale"]);
  }
  // A viewer: the owner's booking link books, so nothing here moves, cancels, syncs two ways, or prices an appointment.
  assert.doesNotMatch(
    drawn.join("\n"),
    /drag|Move |cancel\(|Waitlist|two-way|Two-way|Apple iCal|Utilization|\$\d/,
    "a viewer: nothing moved, cancelled, synced two ways, or priced",
  );
});

test("what became of a visit (0002 step 8): an ended one not marked yet says so quietly, never Done, and asks Kept or Missed; a word said shows on the block and in the visit, corrected from More", () => {
  const withVisit = (status) => {
    const week = dto();
    week.days[1].items[0].visit = { id: "a1", status };
    return week;
  };
  /** What the visit's More offers, by its words. */
  const more = (tree) =>
    (
      find(byTestId(tree, "cal-visit-foot"), (n) => n.props?.label === "More" && Array.isArray(n.props?.groups))?.props
        .groups ?? []
    ).flatMap((g) => g.items.map((i) => i.label));
  // Booked and over (the fixture's Tuesday is behind any clock this runs on): whether they came is the member's to say.
  fresh(withVisit("booked"));
  let tree = page();
  // The board says which visits still wait for that word: a ring on a block the record keeps a row for, said to a reader.
  const waiting = byTestId(tree, "cal-block");
  assert.equal(waiting.props["data-visit"], "unmarked");
  assert.match(waiting.props["aria-label"], /, not marked yet$/);
  waiting.props.onClick();
  tree = page();
  assert.equal(
    textOf(byTestId(tree, "cal-visit-state")),
    "Not marked yet",
    "REGRESSION: an ended visit said Done, as if they came",
  );
  const ask = byTestId(tree, "cal-visit-ask");
  assert.ok(ask, "the one question an ended visit asks");
  assert.match(textOf(ask), /^Did Ana come/);
  assert.ok(byTestId(ask, "cal-visit-ask-kept") && byTestId(ask, "cal-visit-ask-missed"));
  assert.equal(byTestId(ask, "cal-visit-ask-cancelled"), null, "an ended visit is not cancelled now");
  assert.ok(!more(tree).some((l) => /cancel/i.test(l)), "nor from More");
  leave();

  // Said missed: the block says it, the visit says it, and More offers the one correction.
  fresh(withVisit("missed"));
  tree = page();
  const block = byTestId(tree, "cal-block");
  assert.equal(block.props["data-visit"], "missed");
  assert.match(block.props["aria-label"], /, missed$/);
  block.props.onClick();
  tree = page();
  assert.equal(textOf(byTestId(tree, "cal-visit-state")), "Missed");
  assert.equal(byTestId(tree, "cal-visit-ask"), null, "said: nothing asked");
  assert.ok(more(tree).includes("Change to Kept"));
  assert.ok(!more(tree).includes("Change to Missed"));
  leave();

  // An event the record has not kept yet: nothing to say it on, and nothing offered or said.
  fresh();
  tree = page();
  byTestId(tree, "cal-block").props.onClick();
  tree = page();
  assert.equal(byTestId(tree, "cal-visit-ask"), null);
  assert.equal(byTestId(tree, "cal-visit-state"), null);
  leave();
});

test("the word is said on every view: the agenda (a phone's own) says it under the name, and the month counts a cancelled visit as no time taken", () => {
  const week = dto();
  week.days[1].items[0].visit = { id: "a1", status: "missed" };
  week.days[3].items[0].visit = { id: "a2", status: "cancelled" };
  fresh(week);
  globalThis.window.matchMedia = (q) => ({ matches: /max-width:\s*720px/.test(q) });
  let tree;
  try {
    tree = page();
  } finally {
    delete globalThis.window.matchMedia;
  }
  const cls = (n) => String((n && (n.rendered || n).props?.className) || "");
  const rows = all(tree, (n) => n.props?.["data-testid"] === "cal-agenda-item");
  const ana = rows.find((n) => textOf(n).includes("Ana Ruiz"));
  assert.equal(
    textOf(find(ana, (n) => cls(n).split(" ").includes("ag-item-sub"))),
    "Color · Missed · 1h 30m",
    "REGRESSION: the agenda, a phone's default, never said what became of a visit",
  );
  assert.ok(textOf(rows.find((n) => textOf(n).includes("Team training"))).includes("Cancelled"));

  fresh(week);
  tree = page();
  pickView(tree, "month");
  tree = page();
  const thursday = all(tree, (n) => n.props?.["data-testid"] === "cal-month-cell").find((n) =>
    String(n.props["aria-label"]).includes("September 10"),
  );
  assert.ok(thursday, "the month draws the day");
  assert.doesNotMatch(String(thursday.props["aria-label"]), /taken/, "a cancelled visit is no time taken");
});

/**
 * The world the tests of calendar-page/ share. Split by behaviour from calendar-honest.test.mjs on 25 Nov 2026 (layer
 * 14: a test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
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
import { after } from "node:test";
import assert from "node:assert/strict";
import { shiftKey, stateOf, toCalendarVM } from "@chanlytics/contracts";
import { createRequire } from "node:module";
import { hookFrames } from "../../_hook-frames.mjs";
import { kitHooks } from "../../_stub-react.mjs";
import { bridgeHolds, drawsInPlace, holdFrameParts, provided } from "../../shell/_bridge-holds.mjs";

export const TZ = "America/New_York";

// Tuesday noon in New York, the week calendar.test.mjs draws.
export const NOW = new Date("2026-09-08T16:00:00.000Z");

// The week as calendar.test.mjs builds it, in the route's shape.
export function dto(over = {}) {
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

export let cells = [];

// Where each hook keeps its state: by the component that calls it, as React keeps it (_hook-frames.mjs).
export const frames = hookFrames();

// What each effect hands back to be run when the page goes away, as React runs them on unmount.
export let cleanups = [];

// What the page said in a toast, newest last.
export let toasts = [];

// Effects run once, as most of these tests want; a test that needs one to follow its dependencies, as React's do, sets this.
export let honourDeps = false;

export const went = [];

export const listeners = {};

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

// A layout effect is an effect here, as it is on the kit's stub (_stub-react.mjs): the board fits its hour in one. One
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
export const reactModule = createRequire(new URL("../../../apps/dashboard/src/bridge/_.js", import.meta.url))("react");

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

drawsInPlace();

globalThis.document = {
  body: {},
  activeElement: null,
  visibilityState: "visible",
  addEventListener() {},
  removeEventListener() {},
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};

bridgeHolds({ parts: { surfaceState: () => "live" } }, { fresh: true });
globalThis.window = {
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
bridgeHolds({ doors: { navigate: (to) => went.push(to) } });

holdFrameParts();

for (const k of ["StatStrip", "StatCell", "EmptyState", "FailedRead", "StatePill"])
  globalThis[k] = globalThis.window[k];

// One appointment on a list, the row Today's day and the agenda both wear (the kit's, which kitPages publishes).
for (const k of ["AgendaItem", "AgendaItems", "AgendaOpen"]) globalThis[k] = globalThis.window[k];

bridgeHolds({ parts: { toast: () => [null, (t) => toasts.push(t)] } });

// A pill's tone and words are contracts', as the shell's chrome bridge publishes them.
bridgeHolds({ parts: { chrome: { state: stateOf } } });

// The surface's own verbs, with their reads answered here, and the seam that holds what the page draws.
export const S = "../../../apps/dashboard/src/surfaces";

export const { calendar } = await import(`${S}/calendar/verbs.ts`);

export const { CalendarPage } = await import(`${S}/calendar/calendar-page.tsx`);

export const { calendarRunsOverride } = await import(`${S}/calendar/runs-surface.ts`);

export const { CALENDAR_PAGE, CR_WARM_MS, fitDeskHourPx, fitHourPx } = await import(`${S}/calendar/words.ts`);

// The floor an hour never goes under on a phone: what the fit answers for no room at all (words.ts keeps the number).
export const CR_HOUR_MIN_PX = fitHourPx(0, 1);

export const { setSurfaceValue, surfaceValue } = await import(`${S}/surface-values.ts`);

export const { setStatus } = await import("../../../apps/dashboard/src/bridge/surface-status.ts");

export const { standingSaid } = await import(`${S}/kit/head/standing.ts`);

export const { calendarAddress, calendarParam } = await import(`${S}/calendar/address.ts`);

export const realVerbs = { ...calendar };

bridgeHolds({ parts: { calendar: calendar } });

// Today's day (TSX since decision 0015), the one derivation the strip and the brief read, which names the next open time
// the way the Calendar does: the hooks it imports are the stub's, set on the module it imports them from.
kitHooks();

export const { useDayVm } = await import("../../../apps/dashboard/src/surfaces/today/zones/day-vm.ts");

export const walk = (n, fn) => {
  if (n == null || typeof n !== "object") return;
  // What a part drew may be its children as they came (the suite's stand-in for Base UI's Dialog draws a sheet's parts).
  if (Array.isArray(n)) {
    for (const k of n) walk(k, fn);
    return;
  }
  fn(n);
  for (const k of n.props?.children ?? []) walk(k, fn);
  // A kit component's control (the date picker's, a menu's) is a prop: Base UI draws it, and the popup it opens only when
  // a person does, so the stub walks the control as a child.
  if (n.props?.trigger && typeof n.props.trigger === "object") walk(n.props.trigger, fn);
  if (n.rendered) walk(n.rendered, fn);
};

export // Each node counts once: a sheet's rows are the children it was handed and what Base UI's Dialog drew of them.
const all = (tree, pred) => {
  const out = [];
  const seen = new Set();
  walk(tree, (n) => {
    if (!seen.has(n) && pred(n)) {
      seen.add(n);
      out.push(n);
    }
  });
  return out;
};

export const find = (tree, pred) => all(tree, pred)[0] ?? null;

export const byTestId = (tree, id) => find(tree, (n) => n.props?.["data-testid"] === id);

// The views are the frame's strip (chrome.ts), each tab a link to its view's address, which the page follows: a press on
// one is a move to that address (the stub's frame below adopts it on the next draw).
export const pickView = (_tree, id) => {
  went.push(`calendar/${id}`);
};

// The view the page draws, by its body: the month, the agenda, a day's one column, or the week's seven.
export const shownView = (tree) => {
  if (byTestId(tree, "cal-month")) return "month";
  if (byTestId(tree, "cal-agenda")) return "agenda";
  if (find(tree, (n) => /\bcal-grid-day\b/.test(String(n.props?.className ?? "")))) return "day";
  return byTestId(tree, "cal-col") ? "week" : null;
};

// The kit's date picker, which the range opens: the one node that takes a day and today.
export const picker = (tree) =>
  find(tree, (n) => typeof n.props?.today === "string" && typeof n.props?.onValueChange === "function");

// What a node says: a component's text is what it drew (its children go through it, and a kit button hands its words to the
// press that hands them to the element, so counting each layer's children says them three times), a host's is its own words
// and what is inside it.
export const textOf = (n) => {
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
export const hostOf = (n) => (n && n.rendered && !Array.isArray(n.rendered) ? hostOf(n.rendered) : n);

// What a sheet holds: the kit's Sheet is Base UI's Dialog, which the suite stands in for with parts that draw nothing
// (shared/_stand-in-base-ui.mjs), so its words are read off the children it was handed, each layer's (a word may be
// counted more than once: ask whether it is there, never how often).
export const textIn = (n) => {
  const out = [];
  walk(n, (x) => {
    for (const k of x.props?.children ?? []) if (typeof k === "string" || typeof k === "number") out.push(String(k));
  });
  return out.join("");
};

export const tick = () => new Promise((r) => setTimeout(r, 0));

export const settle = async (n = 6) => {
  for (let i = 0; i < n; i += 1) await tick();
};

/**
 * The frame, as far as the page needs one: the address it is drawn for (app/(os)/w/[workspace]/calendar/[[...param]]),
 * which follows every move the page makes (a tab, a day, a visit opened, closed or walked), as the router does.
 */
export let addr = {};

export let followed = 0;

export const addressOf = (route) => {
  const param = calendarParam(route);
  return { param, ...calendarAddress(param) };
};

/** Open the page at a route, as a link does. */
export const at = (route) => {
  addr = addressOf(route);
};

export let reads = [];

export let homes = 0;

// The weeks the board asked to have read ahead of need: [view, anchor] each time its timer ran.
export let warmed = [];

/** The page goes away: what its effects handed back runs, last first. */
export const leave = () => {
  for (const done of cleanups.splice(0).reverse()) done();
};

// The last page goes too, and its timers with it.
after(() => leave());

/** A fresh page over `week`: each read the page asks for answers the next of `answers` (true once they run out). */
export const fresh = (week = dto(), answers = []) => {
  // The page before goes, as React lets go of it: its effects' cleanups run, its minute's timer with them, which kept
  // the file from ever ending.
  leave();
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
export const page = (props = {}) => {
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
    // What the page hands the frame (its act; on a phone the bar under the views) hangs from its node, beside the board.
    const put = [standingSaid()?.act, standingSaid()?.under].filter(Boolean);
    const kids = put.length ? [...(drawn.props.children ?? []), ...put] : null;
    return kids ? { ...drawn, props: { ...drawn.props, children: kids } } : drawn;
  } finally {
    globalThis.setInterval = si;
    globalThis.clearInterval = ci;
  }
};

/** A key pressed on the page, as the window hears it; whether the page took it. */
export const press = (key) => {
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
export const openTimes = (tree) => all(tree, (n) => n.props?.["data-testid"] === "cal-window");

/** The board's columns, by day. */
export const columns = (tree) => all(tree, (n) => n.props?.["data-testid"] === "cal-col");

export const classes = (n) => String(n.props.className).split(" ");

/** The month's days: each a cell (its look: closed, unread, loading) round the button that opens it and names it. */
export const monthCells = (tree) =>
  all(tree, (n) => String(n.props?.className ?? "").split(" ")[0] === "cal-month-cell");

/** One day of the month, by its key: the button a reader hears it by. */
export const monthDay = (tree, key) => {
  const cell = monthCells(tree).find((n) => n.props.key === key);
  return cell ? find(cell, (n) => n.props?.["data-testid"] === "cal-month-cell") : null;
};

/** The lines of one group of Hours and rules (the kit's sheet Settings opens, drawn closed in the tree), by its name. */
export const ruleLines = (tree, name) => {
  const group = all(byTestId(tree, "cal-rules"), (n) => n.props?.className === "cal-rules-group").find(
    (g) => textOf(find(g, (n) => n.props?.className === "cal-rules-label")).trim() === name,
  );
  return all(group, (n) => n.props?.className === "cal-rules-line").map(textOf);
};

/** A menu of the bar's, by the name it is read by: Show's capsule ("Show") or Settings ("Calendar settings"). */
export const barMenu = (tree, label) => find(tree, (n) => n.props?.label === label && Array.isArray(n.props?.groups));

/** The legend, Show's caption: what each look on the board means, where the switches that draw them are. */
export const legend = (tree) =>
  (barMenu(tree, "Show") ?? barMenu(tree, "Calendar settings"))?.props.groups.find((g) => g.header === "Show")
    ?.caption ?? "";

/** An item of Settings' menu, by its words. */
export const settingsItem = (tree, label) =>
  barMenu(tree, "Calendar settings")
    .props.groups.flatMap((g) => g.items ?? [])
    .find((i) => i.label === label);

/* ------------------------------ the peek knows the deal (0008) ------------------------------ */

export const HOUR = 3_600_000;

/** Ana, as the board's read matched her in People, with what it knows of her (calendar-person-facts.ts). */
export const ANA = {
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
export const consultWeek = (over = {}) => {
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

export const END = Date.parse("2026-09-08T19:30:00.000Z");

/**
 * People, as far as the peek reads it: whether deals are on, and Ana's row with her deal's stage and when that stage
 * began (for a pass or an end, when it came). By default a day before the consultation ended.
 */
export const peopleWith = (stage, sinceMs = END - 86_400_000, nextVisitMs = null) => ({
  rows: [{ id: "p1", name: "Ana Ruiz", deal: stage ? { stage, sinceMs } : null, nextVisitMs }],
});

export let sheets = [];

/** Draw with the clock at `nowMs`: the visit asks contracts whether the consultation is over by the clock it runs on. */
export const drawnAt = (nowMs, draw) => {
  const real = Date.now;
  Date.now = () => nowMs;
  try {
    return draw();
  } finally {
    Date.now = real;
  }
};

/**
 * The board over `week` with Ana's appointment open, in a workspace whose retired answer said proposals (its word a meeting);
 * the deal sheet installed as a stand-in that counts what it is asked for; the clock at `nowMs`.
 */
export const peek = ({ week = consultWeek(), nowMs = END + HOUR } = {}) => {
  fresh(week);
  sheets = [];
  bridgeHolds({ who: { workspaces: [{ id: "t-salon", appointment_word: "meeting" }] } });
  bridgeHolds({ who: { activeWorkspaceId: "t-salon" } });
  bridgeHolds({ parts: { sheets: { ...provided("sheets"), openDeal: (args) => sheets.push(args) } } });
  let tree = drawnAt(nowMs, () => page());
  byTestId(tree, "cal-block").props.onClick();
  tree = drawnAt(nowMs, () => page());
  assert.ok(byTestId(tree, "cal-panel"), "the appointment is open");
  return tree;
};

export const forgetPeek = () => {
  bridgeHolds({ who: { workspaces: undefined } });
  bridgeHolds({ who: { activeWorkspaceId: undefined } });
};

export const startAct = (tree) => byTestId(tree, "cal-visit-primary-proposal");

// The week with the record's row for each visit on it (CalendarItemDto.visit): Tuesday's Ana Ruiz is row v-ana, and one
// said cancelled (struck on the board, but drawn) is row v-gone.
export const withVisits = () => {
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
export const openName = (tree) => byTestId(tree, "cal-panel")?.props["aria-label"] ?? null;

/* ------------------- C1: what the page says is true wherever it looks ------------------- */

// `n` empty days from `from`, in the route's shape, keeping the week's hours, closures and rules unless told otherwise.
export const span = (from, n, over = {}) => ({
  ...dto(),
  from,
  to: shiftKey(from, n - 1),
  days: Array.from({ length: n }, (_, i) => ({ key: shiftKey(from, i), items: [], windows: [] })),
  ...over,
});

/** The receptionist's next open time as the route sends it: when it starts, or none. */
export const opening = (start) => ({ next_opening: start ? { start, end: start } : null });

/**
 * GET calendar/runs, answered at once: while the board draws its campaigns it reads them beside its weeks on every move
 * (runs-surface.ts), and a test of the board's own reads neither waits on them nor counts them.
 */
export const runsRead = (url) => {
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

/* ------------------------------- C3: one word per thing ------------------------------- */

// The week with the receptionist's next open time as the route sends it: today at 3:30 PM.
export const withNext = (over = {}) =>
  dto({ next_opening: { start: "2026-09-08T19:30:00.000Z", end: "2026-09-08T22:00:00.000Z" }, ...over });

/** Sets the world's `followed` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setFollowed = (value) => (followed = value);

/** Sets the world's `honourDeps` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setHonourDeps = (value) => (honourDeps = value);

/** Sets the world's `cells` for a test, as its assignment did: a module that imports a binding cannot assign it. */
export const setCells = (value) => (cells = value);

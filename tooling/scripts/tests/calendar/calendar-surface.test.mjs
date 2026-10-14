/**
 * The Calendar as a surface that has left the shell (decision 0015, step 6): its one value in the seam, kept by the tab's
 * cache and mirrored for the pages that have not moved, the address its page takes, what the frame draws around it, the
 * demo's sample, and what the page does with no read at all.
 *
 * The real store, the real cache and the real hook, over a window with sessionStorage and the page tests' stub React. The
 * page's own behaviour is executed in calendar-honest.test.mjs; the equality with the JSX it replaced was proved by a
 * recorder before the JSX went (the pull request says what it ran).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { coversSpan, routeOfPath, spanForView } from "@chanlytics/contracts";
import { fresh, again, byTestId, find, installLegacyReact, textOf, unmount } from "../_legacy-react.mjs";

const CACHE = "chanlytics.surfaces.v1";
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    peek: (k) => m.get(k),
  };
};
installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live" });
globalThis.sessionStorage = storage();
globalThis.__ACTIVE_WORKSPACE = "t-salon";

const S = "../../../../apps/dashboard/src";
const values = await import(`${S}/surfaces/surface-values.ts`);
const cache = await import(`${S}/legacy-bridge/surface-cache.ts`);
const { calendarOverride } = await import(`${S}/surfaces/calendar/surface.ts`);
const { calendarAddress, calendarParam } = await import(`${S}/surfaces/calendar/address.ts`);
const { calendarChrome } = await import(`${S}/surfaces/calendar/chrome.ts`);
const { calendarSample } = await import(`${S}/surfaces/calendar/sample.ts`);
const { CalendarPage } = await import(`${S}/surfaces/calendar/calendar-page.tsx`);
const { calendar, installCalendar } = await import(`${S}/surfaces/calendar/verbs.ts`);
const { CALENDAR_PAGE } = await import(`${S}/surfaces/calendar/words.ts`);
const { standingSaid } = await import(`${S}/surfaces/kit/head/standing.ts`);
const { SURFACE_ROUTES, routeHasPage } = await import(`${S}/surfaces/routes.ts`);

const NOW = Date.parse("2026-09-08T16:00:00.000Z");
const CALENDAR = { vm: { bookingLink: "https://book.example/luna" }, fetchedAt: 1 };

test("the Calendar's read is one typed value in the seam, mirrored under the name Today, Ask, People and the Business tab read", () => {
  assert.equal(calendarOverride.value, "calendar", "the cache keeps the typed value beside the surface's snapshot");
  assert.equal(calendarOverride.globals, undefined, "and there is no window global the surface owns any more");
  assert.equal(values.surfaceValue("calendar"), undefined, "before the first read there is nothing");
  values.setSurfaceValue("calendar", CALENDAR);
  assert.equal(values.surfaceValue("calendar"), CALENDAR, "held as it was published, by identity");
  assert.equal(globalThis.__CALENDAR, CALENDAR, "and mirrored under its old name, the one object");
  values.setSurfaceValue("calendar", undefined);
  assert.equal(globalThis.__CALENDAR, undefined, "the mirror goes with the value");
});

test("the tab's cache gives the Calendar's value back before React draws, so a reload paints the last read", () => {
  values.setSurfaceValue("calendar", CALENDAR);
  cache.snapshotSurface("calendar", [], "t-salon", undefined, "calendar");
  cache.flushSurfaceCache();
  assert.deepEqual(JSON.parse(globalThis.sessionStorage.peek(CACHE)).surfaces.calendar, { $value: CALENDAR });
  values.setSurfaceValue("calendar", undefined);
  assert.ok(cache.hydrateSurfaceCache().has("calendar"), "the surface has its real data before it draws");
  assert.deepEqual(values.surfaceValue("calendar"), CALENDAR);
  assert.deepEqual(globalThis.__CALENDAR, CALENDAR);
  values.setSurfaceValue("calendar", undefined);
});

test("an address under the Calendar: a whole date opens that day, a visit's id names the visit to open, and the page takes every param", () => {
  const param = (path) => calendarParam(routeOfPath(path));
  assert.equal(param("/w/acme/calendar"), null, "the route alone");
  assert.equal(param("/w/acme/calendar/2026-09-10"), "2026-09-10");
  assert.equal(param("/w/acme/calendar/a-lin"), "a-lin");
  assert.equal(param("/w/acme/inbox/th-1"), null, "another route names no param of this one");
  assert.equal(param("/w/acme"), null);
  assert.deepEqual(calendarAddress("2026-09-10"), { initialVisitId: null, initialDay: "2026-09-10" });
  assert.deepEqual(
    calendarAddress("a-1"),
    { initialVisitId: "1", initialDay: null },
    "a visit's id is not a day, and the page opens the visit it names (links/a-visit-has-an-address-that-opens-it)",
  );
  assert.deepEqual(
    calendarAddress("2026-9-10"),
    { initialVisitId: null, initialDay: null },
    "only a whole date names a day",
  );
  assert.deepEqual(calendarAddress(null), { initialVisitId: null, initialDay: null });
  // The router draws the page for every param, as the frame's row did.
  for (const p of ["2026-09-10", "a-1", "anything", "x/y"]) {
    assert.equal(SURFACE_ROUTES.calendar.takes(p), true, p);
    assert.equal(routeHasPage(`calendar/${p}`), true, p);
  }
  assert.equal(routeHasPage("calendar"), true);
});

test("the frame's chrome for the Calendar: one mount, the four views as the frame's strip, no act on a real workspace, and a demo's Ask door", () => {
  const chrome = (param = null) => calendarChrome({ param });
  globalThis.__DEMO_MODE = false;
  values.setSurfaceValue("calendar", undefined);
  const before = chrome();
  assert.deepEqual(
    [before.crumbs, before.mount, before.act],
    [["Calendar"], "calendar", null],
    "nothing to offer until the Calendar has loaded",
  );
  // The views are the frame's strip, each tab a link to its view's address, the one lit the one the page draws.
  assert.deepEqual(
    chrome("month").views.tabs.map((t) => [t.id, t.to]),
    [
      ["week", "calendar/week"],
      ["day", "calendar/day"],
      ["month", "calendar/month"],
      ["agenda", "calendar/agenda"],
    ],
  );
  assert.equal(chrome("month").views.picked, "month");
  assert.equal(chrome("2026-09-10").views.picked, "day", "a day the address names is Day view");
  assert.equal(chrome("agenda:2026-09-10:a-1").views.picked, "agenda", "a visit opened over a view keeps its view lit");
  assert.equal(chrome("week:2026-09-10").mount, "calendar", "every address is one mount");
  values.setSurfaceValue("calendar", CALENDAR);
  assert.equal(chrome().act, null, "a real workspace's booking link is in the page's own menu, not the frame");
  values.setSurfaceValue("calendar", { vm: { bookingLink: null }, fetchedAt: 1 });
  assert.equal(chrome().act, null, "and one with no link offers none");
  values.setSurfaceValue("calendar", undefined);
  globalThis.__DEMO_MODE = true;
  assert.deepEqual(
    chrome().act,
    { ask: true, label: "Book", glyph: "plus", primary: true },
    "the demo keeps its detour",
  );
  values.setSurfaceValue("calendar", CALENDAR);
  assert.equal(chrome().act, null, "a read wins over the demo");
  values.setSurfaceValue("calendar", undefined);
  globalThis.__DEMO_MODE = false;
  assert.deepEqual(SURFACE_ROUTES.calendar.crumbs, ["Calendar"]);
  assert.equal(SURFACE_ROUTES.calendar.activeNav, "calendar");
  assert.equal(SURFACE_ROUTES.calendar.pane, true);
});

test("the demo's sample: the weeks around today, so every view reads without a request, in the sample day's own words", () => {
  const s = calendarSample(NOW);
  assert.equal(calendarSample(NOW), s, "the same minute is the same value, kept rather than rebuilt on every draw");
  assert.notEqual(calendarSample(NOW + 61_000), s, "and a later minute is built again");
  const { vm } = s;
  assert.equal(vm.today, "2026-09-08");
  assert.equal(vm.days.length, 63, "the nine weeks a read loads");
  for (const view of ["week", "day", "month", "agenda"]) {
    const need = spanForView(view, vm.today);
    assert.equal(coversSpan(vm.days, need.from, need.days), true, `${view} is a slice of it`);
  }
  assert.equal(vm.feed.state, "ok");
  const today = vm.days.find((d) => d.key === vm.today);
  assert.equal(today.blocks.length, 6, "the day Today draws: six on the calendar today");
  assert.equal(vm.days.find((d) => d.key === "2026-09-09").blocks.length, 3, "three tomorrow");
  const yesterday = vm.days.find((d) => d.key === "2026-09-07");
  assert.equal(yesterday.blocks.length, 4, "four yesterday");
  assert.deepEqual(
    yesterday.blocks.map((b) => b.visit?.status),
    ["kept", "missed", "booked", "booked"],
    "one kept, one missed, two still to mark",
  );
  assert.equal(
    vm.days.filter((d) => d.blocks.length + d.allDay.length > 0).length,
    3,
    "and nothing invented beyond them",
  );
  // Every way a visit stands that its sheet draws has one to draw.
  const all = vm.days.flatMap((d) => d.blocks);
  assert.ok(
    all.some((b) => b.tool && b.visit?.status === "proposed"),
    "a request a booking tool sent",
  );
  assert.ok(
    all.some((b) => !b.person && !b.guess && !b.contacts.e164.length),
    "an event that is nobody's",
  );
  assert.ok(
    all.some((b) => !b.person && b.guess && b.contacts.e164.length),
    "someone People does not hold",
  );
  assert.ok(
    all.some((b) => b.person?.facts?.deal),
    "someone with a deal",
  );
  assert.match(vm.bookingLink, /^https:\/\/book\.example\.com\//, "a made-up booking link, so its acts are drawn");
});

test("the page draws what the seam holds; a demo session with none draws the sample; no read and no demo draws the board's frame", () => {
  // The board keeps itself current with a five-minute clock while it is open: it is not started for real here, and the tree is
  // let go of after each draw, as React lets go of it.
  const draw = (props = {}) => {
    fresh();
    const [si, ci] = [globalThis.setInterval, globalThis.clearInterval];
    globalThis.setInterval = () => 0;
    globalThis.clearInterval = () => {};
    try {
      return CalendarPage(props);
    } finally {
      globalThis.setInterval = si;
      globalThis.clearInterval = ci;
    }
  };
  globalThis.__DEMO_MODE = false;
  values.setSurfaceValue("calendar", undefined);
  // Nothing read, no demo: the board's frame, still, saying it is reading (CAL-25). It drew nothing, and the strip of
  // views stood over an empty page until the weeks landed.
  const cold = draw();
  assert.ok(byTestId(cold, "calendar-cold"), "the board's frame while the weeks are read");
  assert.equal(byTestId(cold, "calendar-real"), null, "and no board drawn over days it has not read");
  // On a desk the bar is the act on the frame's row of views (board-parts.tsx calendarAct), so the reading is said there.
  assert.match(textOf(standingSaid()?.act), /Reading…/);
  // A demo session draws the one Calendar there is, over the sample.
  // The sample covers what the page draws, so a demo session asks for no read (there is nothing to read from).
  const realEnsure = calendar.ensure;
  const asked = [];
  calendar.ensure = (view, anchor) => {
    asked.push([view, anchor]);
    return Promise.resolve(true);
  };
  globalThis.__DEMO_MODE = true;
  const demo = draw();
  assert.deepEqual(asked, [], "the demo reads nothing");
  const board = byTestId(demo, "calendar-real");
  assert.ok(board, "a demo draws the page over the sample");
  // The range is the control that opens the kit's date picker, which holds it as a prop (Base UI draws it), in the bar the
  // page hands the frame's row of views.
  const pick = find(
    standingSaid()?.act,
    (n) => typeof n.props?.today === "string" && typeof n.props?.onValueChange === "function",
  );
  assert.match(textOf(byTestId(pick.props.trigger, "cal-range")), /\d+ – .*\d+/, "the range names the days on screen");
  assert.ok(
    find(demo, (n) => n.props?.["data-testid"] === "cal-block"),
    "with the sample's appointments on it",
  );
  // A read of its own wins over the sample, and the page draws it again as it moves.
  values.setSurfaceValue("calendar", calendarSample(NOW));
  assert.ok(
    byTestId(
      again(() => CalendarPage({})),
      "calendar-real",
    ),
  );
  values.setSurfaceValue("calendar", undefined);
  globalThis.__DEMO_MODE = false;
  calendar.ensure = realEnsure;
  unmount();
});

test("what the pages that have not moved still read of the Calendar stays published: the verbs and the page's two words, by their old names", () => {
  const was = { verbs: globalThis.__calendar, page: globalThis.__calendarPage };
  delete globalThis.__calendar;
  delete globalThis.__calendarPage;
  installCalendar();
  assert.equal(typeof globalThis.__calendar.refresh, "function", "the Business tab asks for a read");
  assert.equal(typeof globalThis.__calendar.previewFeed, "function", "and checks a pasted address");
  assert.equal(
    globalThis.__calendarPage,
    CALENDAR_PAGE,
    "and states the last read for as long as the board keeps one, in its words",
  );
  assert.equal(CALENDAR_PAGE.refreshMs, 5 * 60 * 1000);
  Object.assign(globalThis, { __calendar: was.verbs, __calendarPage: was.page });
});

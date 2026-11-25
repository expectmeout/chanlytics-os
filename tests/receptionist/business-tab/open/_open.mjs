/**
 * The world the tests of open/ share. Split by behaviour from business-tab-open.test.mjs on 25 Nov 2026 (layer 14: a
 * test file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * Settings › Business, *When you're open*, EXECUTED on the stub React: the week as a fold, the zone, the
 * closed days, and the calendar it reads. The page, the fixture and the presses are _business-tab-harness.mjs; every
 * claim here is something the page drew, or something a press on it sent.
 */
import { after } from "node:test";
import { calendarHoursLines, toCalendarVM, zoneDayKey } from "@chanlytics/contracts";
import { unmount, find, byTestId, textOf, press } from "../../../_stub-react.mjs";
import { foldOf, marisa, redrawTab } from "../../../_business-tab-harness.mjs";

export const { setSurfaceValue, surfaceValue } =
  await import("../../../../apps/dashboard/src/surfaces/surface-values.ts");

// The last page this file drew goes as React would take it away (the harness says why).
after(() => unmount());

/** A shift's place in its day, as its box is named: the second, third, fourth shift. */
export const place = (n) => ["", "", "second", "third", "fourth", "fifth", "sixth"][n];

/** The week's one menu: open it, then press the copy it names. */
export const copyTo = (tree, flash, words) => {
  press(find(byTestId(tree, "rec-hours-copy"), (n) => n.type === "button" && n.props["aria-haspopup"] === "menu"));
  const opened = redrawTab(flash);
  press(find(byTestId(opened, "rec-hours-copy"), (n) => n.props?.role === "menuitem" && textOf(n) === words));
  return redrawTab(flash);
};

/** The card's summary is the composer's own run-collapsing, joined. Never a second implementation. */
export const summaryOf = (hours) => calendarHoursLines(hours).join(" · ");

/* ---- the days the week does not apply to ---- */

export const XMAS = { date: "2099-12-24", until: "2099-12-26", note: "Christmas" };

export const NEW_YEAR = { date: "2100-01-01", note: "New Year's Day" };

/* ---- the calendar it reads ---- */

/** The Calendar surface as the bridge publishes it: contracts' own view model of the route's answer, read just now. */
export const calendarRead = (feed, agoMs = 0) => {
  const today = zoneDayKey(Date.now(), "America/New_York");
  const dto = {
    timezone: "America/New_York",
    from: today,
    to: today,
    feed,
    hours: marisa.hours,
    closures: [],
    rules: null,
    services: [],
    booking_link: null,
    next_opening: null,
    days: [{ key: today, items: [], windows: [] }],
  };
  return { vm: toCalendarVM(dto, new Date()), fetchedAt: Date.now() - agoMs };
};

export const readOk = (over = {}) => ({
  present: true,
  source: "Google Calendar",
  state: "ok",
  read_at: new Date(Date.now() - 4 * 60000).toISOString(),
  checked_at: new Date(Date.now() - 4 * 60000).toISOString(),
  events: 12,
  recurring_expanded: 0,
  skipped_recurring: 0,
  reason: null,
  status: null,
  problem: null,
  stale: false,
  dropped: 0,
  ...over,
});

/** The fold's picker, as the page hands it its value: what a person choosing an option does (the kit proves the rest). */
export const pickBooksWith = (tree, value) =>
  find(tree, (n) => n.props?.testid === "bto-bookings-tool").props.onChange(value);

/** The calendar link's box in the open fold. */
export const linkBox = (tree) =>
  find(foldOf(tree, "calendar"), (n) => n.type === "input" && n.props?.id === "bt-calendar");

/** Past the fold's pause after the last keystroke (BTO_FEED_CHECK_MS), and the preview's answer landed. */
export const pastTheCheck = () => new Promise((r) => setTimeout(r, 650));

/**
 * The page's clock and its timers, held by the test: what is scheduled is recorded, and runs when the test says. The
 * last page drawn goes first, with the real clearTimeout, so no real timer of its (the calendar row's five minutes)
 * outlives the fake clock; and a handle the fake did not make is cleared by the real one. `live()` counts only the
 * calendar row's own timer, by the name the row gives it (btoReadExpires): a toast's setTimeout is not the row's.
 */
export const clock = () => {
  unmount();
  const real = { now: Date.now, set: globalThis.setTimeout, clear: globalThis.clearTimeout };
  const timers = [];
  let at = real.now();
  Date.now = () => at;
  globalThis.setTimeout = (fn, ms) => {
    const t = { fn, ms, at: at + ms, cleared: false };
    timers.push(t);
    return t;
  };
  globalThis.clearTimeout = (t) => {
    if (timers.includes(t)) t.cleared = true;
    else real.clear(t);
  };
  return {
    timers,
    live: () => timers.filter((t) => !t.cleared && !t.fired && t.fn.name === "btoReadExpires"),
    /** Time passes, and every timer due by then fires, in order. */
    pass(ms) {
      at += ms;
      for (const t of timers.filter((x) => !x.cleared && !x.fired && x.at <= at)) {
        t.fired = true;
        t.fn();
      }
    },
    /** The wall clock moves by `ms`, and every live timer fires whether or not it reads as due: a timer runs on the
     *  monotonic clock, so a wall clock stepped back, or one a browser coarsens, reads "not yet" as it fires. */
    early(ms) {
      at += ms;
      for (const t of timers.filter((x) => !x.cleared && !x.fired)) {
        t.fired = true;
        t.fn();
      }
    },
    restore() {
      Date.now = real.now;
      globalThis.setTimeout = real.set;
      globalThis.clearTimeout = real.clear;
    },
  };
};

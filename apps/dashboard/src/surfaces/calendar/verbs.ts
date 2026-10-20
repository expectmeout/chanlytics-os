/**
 * Calendar, the verbs and the arithmetic (moved from legacy-bridge/calendar.ts, decision 0015: the amendment takes a
 * surface's bridge modules with it). The page imports `calendar`; the Business tab reads it as `window.__calendar`
 * (installCalendar below), and imports the page's two words (words.ts CALENDAR_PAGE).
 *
 * The page keeps one loaded WINDOW of days (nine weeks around the day it looks at) and derives every view from it — a
 * week, a day, six weeks for a month, two weeks for the agenda — so switching views is a slice, never a fetch. Only a
 * move outside the window reads again, through the runner, so the cache and the pill agree with what is on screen. The
 * span arithmetic lives in contracts and is exposed here, so the page and the tests use one implementation.
 *
 * The preview is a read of a feed the workspace has not saved yet; it changes nothing.
 */
import {
  clockLabel,
  coversSpan,
  durationLabel,
  frameOf,
  monthLabelOf,
  shiftKey,
  shiftMonth,
  spanForView,
  windowFor,
  type CalendarView,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { surfaceValue } from "../surface-values";
import {
  calendarOverride,
  getCalendarSpan,
  paintHeldCalendar,
  setCalendarFresh,
  setCalendarSpan,
  warmCalendar,
} from "./surface";
import { calendarRunsOverride, paintHeldRuns, runsWanted } from "./runs-surface";
import { windowsToWarm } from "./warm";

/**
 * Load `days` days starting on `from` (a day key); a null `from` is the window around today. `runs`: whether the
 * campaigns over the same days are read too, which they are while the board draws them.
 */
async function goTo(from: string | null, days = 63, runs = runsWanted()): Promise<boolean> {
  const prev = getCalendarSpan();
  setCalendarSpan(from, days);
  const asked = getCalendarSpan();
  api().forget();
  // The campaigns over the same days follow the board where it draws them (runs-surface.ts): painted at once where this tab
  // holds them, and read behind, never waited for.
  if (runs) {
    paintHeldRuns();
    void refreshSurfaces([calendarRunsOverride]);
  }
  // A window this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a window never read waits for its read.
  if (paintHeldCalendar()) {
    void refreshSurfaces([calendarOverride]);
    return true;
  }
  await refreshSurfaces([calendarOverride]);
  // A newer move was made while this one read: the surface dropped this answer (a span left), and the newer move
  // decides what the board keeps and says. This one failed nothing, so it takes nothing back: putting the span back
  // here undid the newer move, whose own answer was then dropped too, and the board said it could not read the days
  // though every read had landed (Reports' period pick keeps the same rule).
  const now = getCalendarSpan();
  if (now.from !== asked.from || now.days !== asked.days) return true;
  const got = surfaceValue("calendar")?.vm;
  if ((from && got?.from !== from) || (got?.days && got.days.length !== days)) {
    setCalendarSpan(prev.from, prev.days);
    return false;
  }
  return true;
}

/** Make sure the window covers what a view needs from its anchor; reads only when it does not. */
async function ensure(view: CalendarView, anchor: string): Promise<boolean> {
  const need = spanForView(view, anchor);
  const have = surfaceValue("calendar")?.vm.days ?? [];
  if (coversSpan(have, need.from, need.days)) return true;
  const w = windowFor(anchor);
  return goTo(w.from, w.days);
}

/**
 * Leaving the Calendar: the loaded window goes back to the weeks around today. Today's day, its next open time and its
 * facts read this same surface, so a board left on another month took them with it until a reload (C1). Reads only when
 * the window had moved, and says whether it had.
 */
async function home(): Promise<boolean> {
  if (getCalendarSpan().from === null) return false;
  // The page has gone, so nothing draws the campaigns: only the board's weeks go home.
  await goTo(null, undefined, false);
  return true;
}

/**
 * Read ahead the windows a few moves from where the board is, the ones the loaded weeks do not cover (warm.ts), and hold
 * them. Reads nothing the board would not read itself on getting there, and nothing for a window it already holds.
 */
function warmAround(view: CalendarView, anchor: string): void {
  const loaded = surfaceValue("calendar")?.vm.days ?? [];
  for (const w of windowsToWarm({ view, anchor, loaded })) void warmCalendar(w);
}

/** What a feed holds, or the refusal's words. A read: nothing refreshes. Never throws. */
async function previewFeed(url: string) {
  return api()("POST calendar/preview", { body: { url } });
}

/**
 * Read the loaded window again: the board keeps itself current while it is open, so the now line, the next open time and
 * the windows follow the clock. `fresh` is the owner's Refresh (C2): the route reads the calendar itself rather than its
 * few minutes' cache. Says whether a read landed, so the board can say so when none did.
 */
async function refresh(opts: { fresh?: boolean } = {}): Promise<boolean> {
  const stamp = () => surfaceValue("calendar")?.fetchedAt;
  const before = stamp();
  setCalendarFresh(!!opts.fresh);
  api().forget();
  try {
    await refreshSurfaces([calendarOverride]);
  } finally {
    // A read that never ran must not leave the next ordinary one asking for fresh.
    setCalendarFresh(false);
  }
  return stamp() !== before;
}

export const calendar = {
  goTo,
  ensure,
  home,
  warmAround,
  previewFeed,
  refresh,
  spanFor: spanForView,
  windowFor,
  covers: coversSpan,
  frameOf,
  shiftKey,
  shiftMonth,
  monthLabel: monthLabelOf,
  clockLabel,
  // The agenda's rows say how long an appointment runs, as Today's do: one spelling, the view model's.
  durationLabel,
};

/**
 * The Calendar's verbs under the name the Business tab's calendar row reads them by: it asks for a read
 * (`__calendar.refresh`) and checks a pasted address (`previewFeed`). A line to delete when the tab imports them (the
 * one-system plan, step 9).
 */
export function installCalendar(): void {
  Object.assign(window, { __calendar: calendar });
}

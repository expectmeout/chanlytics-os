/**
 * The Calendar's override: the span the page shows, held between reads, and the bookings over it (moved from
 * legacy-bridge/surfaces/calendar.ts, decision 0015). Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the page
 * reads what it publishes through `useSurface("calendar")`.
 */
import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { getActiveWorkspace, routeOnScreen } from "@/legacy-bridge/workspace";
import { knownZone } from "@/legacy-bridge/zone";
import { toCalendarVM, windowFor, zoneDayKey, type CalendarVM } from "@chanlytics/contracts";
import { declareSurfaceValue, setSurfaceValue, shareUnchanged, surfaceValue } from "../surface-values";
import { calendarAddress, calendarParam } from "./address";
import { CR_REFRESH_MS } from "./words";

// Today, Ask, People and the Business tab, which have not moved, still read this under its old name.
declareSurfaceValue("calendar", "__CALENDAR");

/* ------------------------------- Calendar -------------------------------- */

/** The window loaded: a day key and a length in days; null is the window around today. Not persisted — a reload opens on today. */
let calendarFrom: string | null = null;
let calendarDays = 63;
/** The next read asks the calendar itself, not the route's few minutes' cache: the board's Refresh (C2). Taken by that read. */
let calendarFresh = false;
/** Whether the surface has made its first read, which alone takes its window from the address. */
let calendarBooted = false;

export function setCalendarFresh(on: boolean): void {
  calendarFresh = on;
}

export function getCalendarSpan(): { from: string | null; days: number } {
  return { from: calendarFrom, days: calendarDays };
}

export function setCalendarSpan(from: string | null, days = 63): void {
  calendarFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
  calendarDays = Math.min(63, Math.max(1, Math.round(days) || 63));
}

export interface CalendarSurface {
  vm: CalendarVM;
  fetchedAt: number;
}

/** GET calendar's answer, as the view model is made from it. */
type CalendarAnswer = Parameters<typeof toCalendarVM>[0];

/**
 * The answer each view model was made from, beside it and never in what the cache keeps: the board's "today", its now
 * line, a block's phase and the next opening are the clock's, and the clock makes them again from it (`rederive`) with no
 * read. A window the cache painted from an earlier visit has none, and waits for its read.
 */
const answers = new WeakMap<CalendarSurface, CalendarAnswer>();

/** A window's surface from its answer, at `now`, with the answer kept beside it. */
function calendarSurfaceOf(answer: CalendarAnswer, now: Date, fetchedAt: number): CalendarSurface {
  const surface: CalendarSurface = { vm: toCalendarVM(answer, now), fetchedAt };
  answers.set(surface, answer);
  return surface;
}

/**
 * The window on screen made again at `now` from the answer it was made from, published where anything moved; whether it
 * did. What a page draws of the day (the board, Today's strip, its "Did they come?" rows) follows the clock between reads,
 * and the day turns at the business's midnight in a tab left open overnight (the wiring's second audit, W-visit-deal-1, S2-3).
 */
function rederiveCalendar(now: Date): boolean {
  const was = surfaceValue("calendar");
  const answer = was ? answers.get(was) : undefined;
  if (!was || !answer) return false;
  const next = shareUnchanged(was, calendarSurfaceOf(answer, now, was.fetchedAt));
  if (next === was) return false;
  answers.set(next, answer);
  setSurfaceValue("calendar", next);
  return true;
}

/**
 * The windows this tab has read (the loading standard's held views): going back to one paints at once, and the read
 * behind it keeps it current. Measured on the salon's workspace: the board held one window, so back to this week and
 * back to December were 390-500ms of "Reading those days…" each. Keyed by the span a window covers, so the weeks
 * around today and the same weeks reached by their date are one.
 */
const calendarHeld = heldViews<CalendarSurface>(6);
const calendarSpanKey = (w: { from: string; days: number }) => `${w.from}|${w.days}`;
/** The span a window asked for covers: its own, or the weeks around the business's today (unknown before the zone is). */
function calendarSpanOf(from: string | null, days: number): { from: string; days: number } | null {
  if (from) return { from, days };
  const zone = knownZone();
  return zone ? windowFor(zoneDayKey(Date.now(), zone)) : null;
}
/** Paint a window this tab holds for the span now asked for; whether it did. The read behind it is the caller's. */
export function paintHeldCalendar(): boolean {
  const w = calendarSpanOf(calendarFrom, calendarDays);
  const have = w ? calendarHeld.get(calendarSpanKey(w)) : undefined;
  if (!have) return false;
  setSurfaceValue("calendar", have);
  window.dispatchEvent(new CustomEvent("surface:calendar"));
  return true;
}

/** Windows being read ahead of need, by workspace and span: a board that draws again asks for none twice. */
const warming = new Set<string>();

/**
 * Read a window the board is likely to move to and hold it, so the move paints at once (warm.ts says which). A window
 * already held or already on its way is left alone; a read that fails costs nothing, since the move reads it when it is
 * made; and one that lands after the tab changed workspace is dropped, never held under the other one.
 */
export async function warmCalendar(w: { from: string; days: number }): Promise<void> {
  const key = calendarSpanKey(w);
  const scope = () => `${getActiveWorkspace() ?? "-"}|${key}`;
  const at = scope();
  if (calendarHeld.has(key) || warming.has(at)) return;
  warming.add(at);
  try {
    const data = await read("GET calendar", { query: { from: w.from, days: String(w.days) } });
    if (scope() !== at) return;
    calendarHeld.hold(key, calendarSurfaceOf(data.calendar, new Date(), Date.now()));
  } catch {
    /* the move reads it when it is made */
  } finally {
    warming.delete(at);
  }
}

/**
 * Calendar: the owner's calendar as the receptionist reads it — what the feed says is taken, the hours and closures, and
 * the windows a caller would be offered — one span of days by the business's clock. The feed's address never reaches the
 * browser; the route reads it.
 */
export const calendarOverride: SurfaceOverride = {
  key: "calendar",
  value: "calendar",
  events: ["surface:calendar"],
  // A booking that arrived by email is a row written (00345): the board repaints as it lands, without a reload. And the two
  // records beside it that the board and its panel draw (0047): a booking email the reader held for a look, or settled
  // (appointment_notices: the held list the card and Settings > Business both draw), and the business's hours, closures and
  // services (tenant_config: the open times, the windows a caller is offered), which a save in another tab or by a teammate
  // moved only in the board's own five minutes. A few a day. This tab's own save is read once, by the refresh map. And the person
  // a visit is matched to: a stop, by any channel, takes "Text the link" off the visit and marks them asked to stop, and a rename
  // or a number fixed is who the visit is (the wiring's second audit, W-person-list-lead-6, W-thread-wait-step-7, W-visit-deal-2).
  // The feed tells a person's update for their identity and answers alone (00408), a few a day, and the board is one read. A person
  // made is no visit's until the board's next read matches them (a lead run's leads, an import's people): not heard.
  // And the mailbox: the Business tab's Booking tool row names its address, and the code Gmail mails to confirm a forward is shown
  // there with a one-press confirm (the wiring's second audit, S4-4): told when it is kept (00431), a few times a workspace.
  ...declareReads("calendar", {
    reads: ["visit", "facts", "person", "channel"],
    fresh: "live",
    omit: [
      {
        tables: ["tenant_channels", "lines", "mailbox_connections", "capability_activations", "business_records"],
        why: "the board and the Business tab draw the workspace's mailbox of the channels; the numbers, a line, a connected mailbox, an activation and the carriers' record are none of theirs",
      },
    ],
    when: (c) => c.table !== "contacts" || c.event !== "INSERT",
  }),
  // A span's reads take their turn; a move to another span is read at once (activateOverride).
  view: () => `${calendarFrom ?? "today"}|${calendarDays}`,
  // The clock's: what the board and Today say of now, next and today, made again each minute where they are drawn.
  rederive: rederiveCalendar,
  // The owner's own calendar tells the feed nothing: a booking made there is read every five minutes on any page that draws the
  // board (the Calendar, Today's day card, the Business pane), where it was read only while the Calendar page was open (S2-3).
  readEveryMs: CR_REFRESH_MS,
  // And the weeks around today move with the day: read again at the business's midnight.
  readAtMidnight: true,
  apply: async () => {
    // A cold boot on a day the address names (calendar/<day>, or a visit on its day, calendar/<day>:a-<id>) reads the weeks
    // around that day: the page's own read. It read today's weeks first, and the page read the day's after them. Only the
    // first read looks at the address.
    if (!calendarBooted) {
      calendarBooted = true;
      const named = calendarAddress(
        calendarParam(typeof window !== "undefined" && window.location ? routeOnScreen() : null),
      ).initialDay;
      if (named && calendarFrom === null) {
        const w = windowFor(named);
        setCalendarSpan(w.from, w.days);
      }
    }
    const from = calendarFrom;
    const days = calendarDays;
    // A Refresh asks once: the flag goes with the read that takes it.
    const fresh = calendarFresh;
    calendarFresh = false;
    // The window around the business's today, not the browser's, is the route's to work out (`around`): the page asked
    // for it by its first day, which it could not say until it knew the zone, so its first read waited for who is
    // looking and the document's head could not start it (contracts PREFETCH_READS). A day the board moved to is said.
    const data = await read("GET calendar", {
      query: {
        ...(from ? { from, days: String(days) } : { around: "today" as const }),
        ...(fresh ? { fresh: "1" as const } : {}),
      },
    });
    // Two moves in a row: the earlier read may land after the later one. A
    // read for a span the page has since left is dropped, never painted.
    if (from !== calendarFrom || days !== calendarDays) return;
    const surface = calendarSurfaceOf(data.calendar, new Date(), Date.now());
    // Held under the span the answer covers, which is the one a later move back to these weeks asks for by its day.
    const w = from ? { from, days } : { from: data.calendar.from, days: data.calendar.days.length };
    calendarHeld.hold(calendarSpanKey(w), surface);
    setSurfaceValue("calendar", surface);
  },
};

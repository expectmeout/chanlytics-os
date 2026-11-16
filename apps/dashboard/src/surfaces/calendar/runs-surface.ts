/**
 * Campaigns over the Calendar's days (the Calendar's lane C): GET calendar/runs for the span the board holds, published as
 * `calendar_runs` for the page's marks (contracts calendarRunMarksOf). Its own read, beside the board's and never inside it
 * (server/readers/calendar.ts calendarRuns says why). Part of the SurfaceData seam; the page reads it through
 * `useSurface("calendar_runs")`.
 *
 * Read only where it is drawn (`onDemand`): the Calendar, while Show includes campaigns or cold email. It follows the
 * board's span (surface.ts getCalendarSpan), and holds the spans it has read as the board holds its weeks (held views), so
 * a step back to a week paints its marks at once. What moves it: a run made, approved, sending or done, a campaign saved,
 * and a class's mode changed; heard on the Calendar alone, and once as it comes back on screen.
 */
import type { CalendarRunsDto } from "@chanlytics/contracts";
import { windowFor, zoneDayKey } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { heldViews } from "@/bridge/held-views";
import { readAged, type SurfaceOverride } from "@/bridge/surface-data";
import { declareReads } from "@/bridge/surface-registry";
import { afterBoot, routeOnScreen, warmsOnItsOwn } from "@/bridge/workspace";
import { knownZone } from "@/bridge/zone";
import { setSurfaceValue, surfaceValue } from "../surface-values";
import { getCalendarSpan } from "./surface";

/** What Show draws over the visits, which are always drawn: the open times, the campaigns, cold email, and posts. */
export interface CalendarShow {
  open: boolean;
  campaigns: boolean;
  cold: boolean;
  /** Campaigns › Content's posts at their times (the content redesign's stage 3). */
  posts: boolean;
}

/** Show as it opens for a member who never picked (D2): open times, campaigns and posts on, cold email off. */
const SHOW_DEFAULT: CalendarShow = { open: true, campaigns: true, cold: false, posts: true };

/**
 * Show as this tab last kept it (tab-memory.ts, its own place, never the view's), else the default: what the page opens
 * with (use-calendar.ts), and whether the campaigns are worth reading before it is opened (`readRunsSoon`).
 */
export function keptShow(): CalendarShow {
  const mem = typeof window === "undefined" ? undefined : window.__tabMemory;
  const was = mem?.place("calendar", "show");
  const on = (k: keyof CalendarShow) => (typeof was?.[k] === "boolean" ? was[k] : SHOW_DEFAULT[k]);
  return { open: on("open"), campaigns: on("campaigns"), cold: on("cold"), posts: on("posts") };
}

/**
 * The Calendar's campaigns read on any other page once that page has its own reads (afterBoot("page"); `read`: the runner's
 * read of this surface, FrameApp.tsx), where Show draws them and the tab holds none, so a move to the Calendar finds them
 * in hand with its weeks, which every boot reads (Today draws them). Read only as the Calendar came on screen, they arrived
 * about half a second after its meetings in 66 of 294 moves there (page_vitals, 14-21 Oct 2026), the campaign rows pushing
 * the meetings down as they came (Ruben, 21 Oct 2026). Read once the page was idle, they were still out a second or two
 * after Today had drawn, longest where the browser has no idle callback and waits 2 s (Safari), and a press to the Calendar
 * then drew the meetings and the campaigns 0.2 to 0.3 s after (the phone review of 15 Nov 2026); read once the whole boot
 * was in, about three seconds after a phone's page had drawn on production (the re-measure of 16 Nov 2026). One small read
 * beside the other pages' stands in nobody's way. Never where the page may not warm on its own (warmsOnItsOwn).
 */
export function readRunsSoon(read: () => void, at?: Window): void {
  const win = at ?? (typeof window === "undefined" ? null : window);
  if (!win || !warmsOnItsOwn()) return;
  const go = () => {
    const show = keptShow();
    if (!(show.campaigns || show.cold || show.posts) || surfaceValue("calendar_runs")) return;
    if (/^calendar(\/|$)/.test(routeOnScreen(win))) return;
    read();
  };
  const soon = () => void afterBoot("page").then(go);
  if (win.document.readyState === "complete") soon();
  else win.addEventListener("load", soon, { once: true });
}

/** How many reads of the campaigns are out now (`calendarRunsOverride.apply`). */
let runsOut = 0;

/**
 * Whether a read of the campaigns is out now: a board that comes on screen while one is waits for it (calendar-page.tsx),
 * as a press from Today finds it, its weeks in hand and its campaigns still being read.
 */
export function runsReading(): boolean {
  return runsOut > 0;
}

/**
 * Whether the board draws campaigns now (Show's Campaigns or Cold email): only then does a move of its span read them. The
 * page says so while it is drawn, and nothing reads them once it has gone.
 */
let wanted = false;

/** Say whether the board draws campaigns now (the page, from Show). */
export function wantRuns(on: boolean): void {
  wanted = on;
}

/** Whether a move of the board's span reads its campaigns too. */
export function runsWanted(): boolean {
  return wanted;
}

/** What the page reads: the span's runs and campaigns, and when they were read. */
export interface CalendarRunsSurface {
  dto: CalendarRunsDto;
  fetchedAt: number;
}

/** The spans this tab has read, by the span each covers: the same weeks reached by their date are one. */
const runsHeld = heldViews<CalendarRunsSurface>(6);
const spanKey = (w: { from: string; days: number }) => `${w.from}|${w.days}`;

/** The span the board asks for, by its first day: its own, or the weeks around the business's today once the zone is known. */
function spanAsked(): { from: string; days: number } | null {
  const { from, days } = getCalendarSpan();
  if (from) return { from, days };
  const zone = knownZone();
  return zone ? windowFor(zoneDayKey(Date.now(), zone)) : null;
}

/** Paint the marks this tab holds for the span the board asks for; whether it did. The read behind it is the caller's. */
export function paintHeldRuns(): boolean {
  const w = spanAsked();
  const have = w ? runsHeld.get(spanKey(w)) : undefined;
  if (!have) return false;
  setSurfaceValue("calendar_runs", have);
  window.dispatchEvent(new CustomEvent("surface:calendar_runs"));
  return true;
}

export const calendarRunsOverride: SurfaceOverride = {
  key: "calendar_runs",
  value: "calendar_runs",
  events: ["surface:calendar_runs"],
  // The runs (broadcasts) and the campaigns (playbooks) it draws, the classes' modes a forecast is said by (policies) and the
  // workspace's pause (tenants), which stops every forecast: heard while the Calendar is on screen, and once as it comes back.
  // A run's sent count (run_counts, over its messages and its recipients' rows) rides with the run's own row, heard as a send
  // (baselines/reads-not-heard.json says so). A post's line says its piece's name (files); its time and where it stands
  // (posts) move only at a press, which reads this again (refresh-map's post rows).
  ...declareReads("calendar_runs", { reads: ["send", "campaign", "rules", "workspace", "file"], fresh: "its-page" }),
  onDemand: true,
  isStale: () => readAged(surfaceValue("calendar_runs")?.fetchedAt),
  // A span's reads take their turn; a move to another span is read at once, as the board's are.
  view: () => {
    const { from, days } = getCalendarSpan();
    return `${from ?? "today"}|${days}`;
  },
  apply: async () => {
    const { from, days } = getCalendarSpan();
    // The board's own first read names no day (`around`), so the document's head can start this one beside it.
    runsOut += 1;
    const data = await read("GET calendar/runs", {
      query: from ? { from, days: String(days) } : { around: "today" as const },
    }).finally(() => (runsOut -= 1));
    // A read for a span the board has since left is dropped, never painted.
    const now = getCalendarSpan();
    if (now.from !== from || now.days !== days) return;
    const surface: CalendarRunsSurface = { dto: data.runs, fetchedAt: Date.now() };
    runsHeld.hold(spanKey({ from: data.runs.from, days: data.runs.days }), surface);
    setSurfaceValue("calendar_runs", surface);
  },
};

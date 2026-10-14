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
import { read } from "@/legacy-bridge/api";
import { heldViews } from "@/legacy-bridge/held-views";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { knownZone } from "@/legacy-bridge/zone";
import { setSurfaceValue, surfaceValue } from "../surface-values";
import { getCalendarSpan } from "./surface";

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
  // (baselines/reads-not-heard.json says so).
  ...declareReads("calendar_runs", { reads: ["send", "campaign", "rules", "workspace"], fresh: "its-page" }),
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
    const data = await read("GET calendar/runs", {
      query: from ? { from, days: String(days) } : { around: "today" as const },
    });
    // A read for a span the board has since left is dropped, never painted.
    const now = getCalendarSpan();
    if (now.from !== from || now.days !== days) return;
    const surface: CalendarRunsSurface = { dto: data.runs, fetchedAt: Date.now() };
    runsHeld.hold(spanKey({ from: data.runs.from, days: data.runs.days }), surface);
    setSurfaceValue("calendar_runs", surface);
  },
};

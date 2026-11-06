/**
 * Today's read: the day's read whole, in one request (GET today, Today in three zones, 2 Nov 2026; the reader is Ask's,
 * server/readers/today.ts, so the page and Ask cannot count the day two ways), made into the day (contracts toTodayVM).
 * The surface as the frame registers it (what it reads and hears) is override.ts, which fetches this module as the
 * surface is first read: imported whole, every page's first load carried the day's whole making (the loadability review,
 * 19 Oct 2026). Part of the SurfaceData seam (../surface-data.ts).
 */

import { read } from "@/bridge/api";
import { toTodayVM, type TodayReadDto } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/bridge/surface-data";
import { setSurfaceValue, shareUnchanged, surfaceValue } from "../surface-values";

/**
 * What Today's last read held, kept so the clock can make the day again from it with no read (`rederive`): a window that
 * drops under six hours, a message an hour unanswered, a search's wait and a hold's end are the clock's, and no notice comes
 * for them, least of all when nothing arrives, which is when they matter (the wiring's second audit, S2-2).
 */
let lastHeld: TodayReadDto | null = null;

/** The day from what was read, at `now`, published where anything moved; whether it did. */
function publishToday(h: TodayReadDto, now: Date): boolean {
  const was = surfaceValue("today");
  const vm = shareUnchanged(
    was,
    toTodayVM(h.metrics, h.conversations, h.escalations, h.calls, now, h.searches, {
      runs: h.runs,
      heldThreads: h.held_threads,
      previewsTried: h.previews_tried,
      doneToday: h.done_today,
      since: h.since,
      word: h.word ?? null,
    }),
  );
  if (vm === was) return false;
  setSurfaceValue("today", vm);
  return true;
}

/** The rows that come and go by the clock alone, made again from what the last read held (override.ts `rederive`). */
export function rederiveToday(now: Date): boolean {
  return lastHeld ? publishToday(lastHeld, now) : false;
}

/**
 * The read: the day whole, made into the day. Unlike every other surface, this one has NO seed to fall back to
 * (override.ts says why). Every part but the first three is additive: one the server could not read is null and the day
 * stands without it. Only the calls and the searches land the read "partial" (the status line says it is not refreshing,
 * and the runner asks again at two seconds and at ten: decision 0058, the wiring's second audit, S2-5, a read that lost
 * part of itself counted as landed and nothing asked again). A lost run read, held thread, tried lead, done-today count or
 * Since line leaves its row or its line out until the next read (a notice, the bell's close, the midnight read, the
 * fifteen-minute heal).
 */
export const applyToday: SurfaceOverride["apply"] = async () => {
  const { read: day } = await read("GET today");
  lastHeld = day;
  publishToday(day, new Date());
  // Today publishes no count for the badge, the tabs, the title or the phone: they read one selector over the day it
  // published (needs-you.ts needsYouNow), the rows Need you counts.
  return day.calls === null || day.searches === null ? "partial" : undefined;
};

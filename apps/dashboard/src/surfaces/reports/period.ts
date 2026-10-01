/**
 * The period Reports shows, changed (moved from legacy-bridge/inbox-verbs.ts, decision 0015): the choice is kept in
 * this browser, and the read goes through the runner, so the cache, the status and the pill agree with what is on screen.
 */
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { surfaceValue } from "../surface-values";
import { paintHeldReports, reportsOverride, setReportDays } from "./surface";

/** Whether the period was changed: `false` when its read failed, and the page still shows the one it had. */
export async function setReportRange(days: number): Promise<boolean> {
  const prev = surfaceValue("reports")?.days ?? days;
  setReportDays(days);
  // A period this tab has read paints at once; the read behind it keeps it current (the loading standard's held
  // views). Only a period never read waits for its read.
  if (paintHeldReports()) {
    void refreshSurfaces([reportsOverride]);
    return true;
  }
  await refreshSurfaces([reportsOverride]);
  // The override writes the period it fetched. Anything else means the fetch failed and the page is still showing the
  // old period, so the preferred period goes back too, or the next background refresh would load the new one silently.
  if (surfaceValue("reports")?.days !== days) {
    setReportDays(prev);
    return false;
  }
  return true;
}

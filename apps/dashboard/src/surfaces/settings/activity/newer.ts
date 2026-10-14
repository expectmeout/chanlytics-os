/**
 * Settings › Activity, kept current while it is open (the wiring's second audit, X2-3). The log is the events and the
 * decisions, which the live feed never tells (every write in the workspace makes one), so nothing else would tell the pane:
 * a teammate's change or a visit booked appeared only on a return to the tab or a new filter.
 *
 * Its first page is read again each minute while the tab is shown, and as the tab comes back. What is newer than the lines
 * on screen is offered above them, never moved in under the reader: a log is read from the top down, and lines that shift
 * while a person reads them lose their place.
 */
import { useEffect, useState } from "react";
import { MIN_MS, type ActivityPageDto } from "@chanlytics/contracts";
import { activity, type ActivityFilters } from "@/legacy-bridge/activity";

/** How often an open log reads its first page again: the age an owner reading a log looks for. */
const AGAIN_MS = MIN_MS;

/** The line at the top of the log on screen: its row's id and when it happened. None for a log that read nothing. */
export interface ActivityTop {
  id: string;
  at: string;
}

/**
 * The first page read again, when it begins above the line on screen: a row newer than it, or rows where the log read none.
 * Null otherwise, and while `top` is undefined (the log's own read is out, failed, or the reader may not read it), so a read
 * of the pane's own is never compared with one that has not landed. `readNow` says the filters as they stand, today's date
 * among them.
 */
export function useNewerActivity(
  readNow: () => ActivityFilters,
  top: ActivityTop | null | undefined,
): ActivityPageDto | null {
  const [newer, setNewer] = useState<ActivityPageDto | null>(null);
  const topId = top === undefined ? undefined : (top?.id ?? null);
  const topAt = top?.at ?? null;
  useEffect(() => {
    setNewer(null);
    if (topId === undefined) return undefined;
    let on = true;
    const look = async () => {
      if (document.visibilityState === "hidden") return;
      const r = await activity.list(readNow());
      if (!on || !r.ok) return;
      setNewer(beginsAbove(r.data, topId, topAt) ? r.data : null);
    };
    const timer = window.setInterval(() => void look(), AGAIN_MS);
    const back = () => {
      if (document.visibilityState === "visible") void look();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      on = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [readNow, topId, topAt]);
  return newer;
}

/**
 * Whether a page read now begins above the line on screen: its first row is not that line, and is not older than it (a row
 * taken away since, an erasure's, moves the top down and is nothing new). A log that read nothing is begun above by any row.
 */
function beginsAbove(page: ActivityPageDto, topId: string | null, topAt: string | null): boolean {
  const first = page.rows[0];
  if (!first) return false;
  if (topId === null) return true;
  if (first.id === topId) return false;
  const was = topAt ? Date.parse(topAt) : NaN;
  const now = Date.parse(first.at);
  return !(Number.isFinite(was) && Number.isFinite(now)) || now >= was;
}

/**
 * What AI sends next on its own (Working for you, W3): the runs set to go within a day, soonest first. Its own module, so
 * tonight's line (calm/evening.tsx) reads it without loading AI's sheet, which loads as it first opens.
 */
import { DAY_MS, type BroadcastVM } from "@chanlytics/contracts";

/** What goes out next: runs set to go on their own within a day. */
const NEXT_WITHIN_MS = DAY_MS;

/** The runs set to go on their own within a day, soonest first: the sheet's Next, and tonight's line (calm/evening.tsx). */
export function nextRuns(rows: readonly BroadcastVM[] | undefined, nowMs: number): BroadcastVM[] {
  return (rows ?? [])
    .filter((r) => {
      const at = r.scheduled_for ? Date.parse(r.scheduled_for) : Number.NaN;
      return r.state === "scheduled" && at >= nowMs && at - nowMs <= NEXT_WITHIN_MS;
    })
    .sort((a, b) => Date.parse(a.scheduled_for ?? "") - Date.parse(b.scheduled_for ?? ""));
}

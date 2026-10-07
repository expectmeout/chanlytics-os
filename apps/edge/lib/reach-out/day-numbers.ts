/**
 * The day's reach-out numbers at 6 PM (Reach out, Part 6: H12): at 18:00 in each business's own zone, a workspace whose
 * reach-outs wrote, heard back or hold an email for its owner that day gets one line in the bell, and nothing else: no
 * push and no email (a digest a day is what Settings promises not to send). The hourly playbooks sweep asks it after
 * its runs; the sweep is requested every hour whatever is due, so each workspace's 18:00 is met at its :05.
 *
 * Once a day: 00241's reach_out_day_due leaves out a workspace with a reach_out_day row about its local day already,
 * so a second sweep in the same hour writes nothing, and each page read here is the next workspaces not told yet. The
 * row is the bell's only (recordNotification), which never throws: one that could not be written waits for the next
 * day's 6 PM, since at the next sweep it is 7 PM there, and the line is a summary, never the only word of anything.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { reachOutDayWords } from "../packages/contracts.js";
import { reachOutDayDue, type Database } from "../packages/db.js";
import { recordNotification } from "../ops/notify.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** The workspaces one read answers, and the most reads one sweep makes: five hundred workspaces in one zone's 6 PM. */
const REACH_OUT_DAY_PAGE = 50;
const REACH_OUT_DAY_PAGES = 10;

/**
 * Writes the bell's line for each workspace whose 6 PM it is, a page at a time until none is left, `pages` are read or
 * `deadlineMs` passes; answers how many were told.
 */
export async function tellReachOutDays(db: Db, now: Date, log: Logger, deadlineMs: number): Promise<number> {
  let told = 0;
  for (let page = 0; page < REACH_OUT_DAY_PAGES && Date.now() < deadlineMs; page += 1) {
    let due;
    try {
      due = await reachOutDayDue(db, now, REACH_OUT_DAY_PAGE);
    } catch (e) {
      log.warn("reach_out_day_failed", { error: e instanceof Error ? e.message : String(e) });
      return told;
    }
    for (const d of due) {
      const words = reachOutDayWords(d.numbers);
      const row = await recordNotification(
        d.tenant_id,
        {
          kind: "reach_out_day",
          title: words.title,
          body: words.body,
          route: "outbound",
          about: { type: "reach_out_day", id: d.day },
        },
        db,
      );
      if (!row) continue;
      told += 1;
      log.info("reach_out_day_told", { tenant_id: d.tenant_id, day: d.day, ...d.numbers });
    }
    if (due.length < REACH_OUT_DAY_PAGE) break;
  }
  return told;
}

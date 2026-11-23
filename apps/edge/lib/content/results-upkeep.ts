/**
 * What keeps a post's results moving (00699; the content loop PRD's 9.1, Appendix A.9), each half hour from the health
 * sweep: a post_observe job for every read of a post's numbers that is due and not kept (an hour, a day, 3, 7 and 28
 * days after it went up), and touches past 180 days emptied to their counts. Nothing here reads a place: the jobs do.
 * A read due and missed is found again at the next pass, so a job lost between its fact and its write costs one pass.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { scrubOldTouches, listObservationsDue } from "@chanlytics/db/content";
import type { Database } from "@chanlytics/db/types";
import { scheduleJobOnce } from "@chanlytics/jobs";
import { errField, logger } from "../shared/log.js";

type Db = SupabaseClient<Database>;

/** The most reads one pass asks for: the rest are found at the next. */
const READS_PER_PASS = 200;

/** What one pass did: the reads asked for, the touches emptied, or a step that could not run (logged). */
interface ResultsUpkeep {
  post_reads_asked: number;
  touches_aged: number;
}

/** One pass: the reads that are due asked for, and old touches aged out. Never throws: a failed step is logged. */
export async function keepResultsMoving(db: Db): Promise<ResultsUpkeep> {
  const log = logger();
  let readsAsked = 0;
  try {
    for (const due of await listObservationsDue(db, READS_PER_PASS)) {
      await scheduleJobOnce(db, {
        tenantId: due.tenantId,
        kind: "post_observe",
        dueAt: new Date(),
        payload: { post_id: due.postId, step: due.step },
      });
      readsAsked += 1;
    }
  } catch (e) {
    log.error("post_reads_ask_failed", { error: errField(e) });
  }
  let aged = 0;
  try {
    aged = await scrubOldTouches(db);
  } catch (e) {
    log.error("touches_age_out_failed", { error: errField(e) });
  }
  return { post_reads_asked: readsAsked, touches_aged: aged };
}

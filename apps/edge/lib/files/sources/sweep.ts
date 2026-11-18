/**
 * The footage clock (the footage sources plan, D18; decision 0115): every five minutes it hands each watched folder
 * the work that has come due, and does none of it. A folder not read for its floor gets a read; one whose re-walk is
 * due gets its first step; a walk whose steps stopped is taken up again. The database decides what is due from what
 * each folder's row says (00641 sources_hand_out), and the kinds' own keys hold one a folder while one waits or runs,
 * so a clock that knocks twice costs nothing and a folder a signal already scheduled is not handed a second read.
 *
 * It reads no provider. A job that fails for good leaves its folder due, and the next turn hands it another: late, not
 * lost.
 *
 * The route is api/cron/sources.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and
 * checks the sweep key, then hands this its tick.
 */
import { SECOND_MS } from "@chanlytics/contracts";
import { handOutSources } from "@chanlytics/db/files";
import type { JobContext } from "@chanlytics/jobs";
import { json } from "../../shared/http.js";
import { errField } from "../../shared/log.js";
import { HAND_OUT_SPREAD_SECONDS } from "../../shared/sweep-rotation.js";
import type { SweepTick } from "../../ops/sweep-door.js";
import { driveClient } from "./config.js";
import { SOURCE_PACE } from "./pace.js";
import { runSourceRead } from "./read.js";
import { runSourceWalk } from "./walk.js";

/** One turn of the clock: what is due handed out, and how much said. */
export async function sweepSources({ db, L }: SweepTick): Promise<Response> {
  if (!driveClient()) return json(200, { ok: true, skipped: "no_oauth_client" });
  try {
    const handed = await handOutSources(db, {
      spreadSeconds: HAND_OUT_SPREAD_SECONDS,
      walkStaleSeconds: SOURCE_PACE.walkStaleMs / SECOND_MS,
    });
    L.info("sources_sweep", handed);
    return json(200, { ok: true, ...handed });
  } catch (error) {
    L.error("sources_sweep_failed", { error: errField(error) });
    return json(500, { ok: false });
  }
}

/** source_walk and source_read as the job runner takes them. */
export function sourcesReader(db: SweepTick["db"]): NonNullable<JobContext["sources"]> {
  return {
    walk: (job, deadline) => runSourceWalk(db, job, deadline),
    read: (job, deadline) => runSourceRead(db, job, deadline),
  };
}

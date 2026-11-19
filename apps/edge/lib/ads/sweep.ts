/**
 * The ads clock (decision 0049, step P1; the Ads plan's 6.6): every five minutes it hands each connected ad account
 * the read that has come due, and does none of it. The database decides what is due from what each account's row says
 * (00650 ads_hand_out): its next read's time, written by its last read, and the moment before which its platform is
 * not asked again. The kind's own key holds one an account while one waits or runs, so a clock that knocks twice costs
 * nothing.
 *
 * It reads no platform. A read that stops leaves its account due again at the slow pace: late, not lost.
 *
 * The route is api/cron/ads.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick.
 */
import { handOutAdReads } from "@chanlytics/db/ads";
import type { JobContext } from "@chanlytics/jobs";
import { json } from "../shared/http.js";
import { errField } from "../shared/log.js";
import { HAND_OUT_SPREAD_SECONDS } from "../shared/sweep-rotation.js";
import type { SweepTick } from "../ops/sweep-door.js";
import { metaAdsApp } from "./account-ops.js";
import { runAdRead } from "./read.js";

/** One turn of the clock: what is due handed out, and how much said. */
export async function sweepAds({ db, L }: SweepTick): Promise<Response> {
  if (!metaAdsApp()) return json(200, { ok: true, skipped: "no_app_credentials" });
  try {
    const handed = await handOutAdReads(db, HAND_OUT_SPREAD_SECONDS);
    L.info("ads_sweep", { ...handed });
    return json(200, { ok: true, ...handed });
  } catch (error) {
    L.error("ads_sweep_failed", { error: errField(error) });
    return json(500, { ok: false });
  }
}

/** ad_read as the job runner takes it. */
export function adsReader(db: SweepTick["db"]): NonNullable<JobContext["ads"]> {
  return { read: (job, deadline) => runAdRead(db, job, deadline) };
}

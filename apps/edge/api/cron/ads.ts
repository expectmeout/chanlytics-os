/**
 * The ads clock's door: pg_cron asks it every five minutes ('ads-sweep', 00650) while an ad account is connected, with
 * the sweep key, and it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepAds in
 * lib/ads/sweep.ts: each connected account whose read has come due is handed its job, and the clock itself reads
 * nothing.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepAds } from "../../lib/ads/sweep.js";

export const POST = sweepDoor({ sweep: "ads" }, sweepAds);

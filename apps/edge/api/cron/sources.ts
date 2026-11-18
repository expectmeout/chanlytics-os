/**
 * The footage clock's door: pg_cron asks it every five minutes ('sources-sweep', 00641) while a folder is watched,
 * with the sweep key, and it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepSources in lib/files/sources/sweep.ts: each watched folder whose read or re-walk has come due is handed its job,
 * and the clock itself reads nothing.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepSources } from "../../lib/files/sources/sweep.js";

export const POST = sweepDoor({ sweep: "sources" }, sweepSources);

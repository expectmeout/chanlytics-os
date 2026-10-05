/**
 * The reach out-check sweep's door: pg_cron asks it every minute (00197 trigger_reach_out_check_sweep) with the sweep
 * key, and it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepReachOutChecks in lib/reach-out/check-sweep.ts: the reach-out check's clock: a send waiting to be checked is
 * checked, apart from the clock that claims and sends.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepReachOutChecks } from "../../lib/reach-out/check-sweep.js";

export const POST = sweepDoor({ sweep: "reach_out_check", noDbEvent: "reach_out_check_no_db" }, sweepReachOutChecks);

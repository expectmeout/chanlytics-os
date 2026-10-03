/**
 * The reach out sweep's door: pg_cron asks it every minute (00186 trigger_reach_out_sweep) with the sweep key, and it
 * answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepReachOut in lib/reach-out/reach-out-sweep.ts: the reach-out clock: what became of the emails it wrote is read,
 * the runs are finished, and the sends that are due are claimed and written.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepReachOut } from "../../lib/reach-out/reach-out-sweep.js";

export const POST = sweepDoor({ sweep: "reach_out" }, sweepReachOut);

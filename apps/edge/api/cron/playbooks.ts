/**
 * The playbooks sweep's door: pg_cron asks it every hour at :05 ('playbooks-sweep', 00048) with the sweep key, and it
 * answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepPlaybooks in lib/reach-out/playbooks-sweep.ts: every running playbook whose hour it is runs once for the day,
 * and so does every reach-out step.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepPlaybooks } from "../../lib/reach-out/playbooks-sweep.js";
export { REACH_OUT_YIELD_AT_MS } from "../../lib/reach-out/playbooks-sweep.js";

export const POST = sweepDoor({ sweep: "playbooks" }, sweepPlaybooks);

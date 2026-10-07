/**
 * The partners sweep's door: pg_cron asks it once a day (00203 trigger_partners_sweep) with the sweep key, and it
 * answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepPartners in lib/partners/partners-sweep.ts: the partner clock: each qualifying workspace is judged once, what is
 * due is made payable, and each partner with news is written to.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepPartners } from "../../lib/partners/partners-sweep.js";

export const POST = sweepDoor({ sweep: "partners", noDbEvent: "partners_no_db" }, sweepPartners);

/**
 * The health sweep's door: pg_cron asks it at :13 and :43 with the sweep key, and it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepHealth
 * in lib/ops/health-sweep.ts: the watcher for the two watchdogs: what pg_cron and sweep_health() saw, and four
 * conditions no sweep row can show, reach a human.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepHealth } from "../../lib/ops/health-sweep.js";

export const POST = sweepDoor({ sweep: "health", noDbEvent: "sweep_health_no_db" }, sweepHealth);

/**
 * The ledger's heartbeat, edge half: pg_cron asks every ten seconds whether anything in the ledger is due and calls
 * this only when something is (trigger_jobs_tick, 00098).
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the sweep key; tickJobs in
 * lib/ops/jobs-tick.ts binds each job's own tenant credentials and runs the loop, which is packages/jobs/src/tick.ts,
 * tested by running it against fakes.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { tickJobs } from "../../lib/ops/jobs-tick.js";

export const POST = sweepDoor({ sweep: "jobs" }, tickJobs);

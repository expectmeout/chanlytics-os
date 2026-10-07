/**
 * The calls sweep's door: pg_cron asks it every five minutes ('call-reconcile', 00020, and since 00149 only when the
 * calls table owes something) with the sweep key, and it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepCalls
 * in lib/voice/calls-sweep.ts: calls the webhook never told us had ended are closed out and what a call leaves behind
 * is finished: recordings, their retention, the note in the thread.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepCalls } from "../../lib/voice/calls-sweep.js";

export const POST = sweepDoor({ sweep: "calls", noDbEvent: "calls_sweep_no_db" }, sweepCalls);

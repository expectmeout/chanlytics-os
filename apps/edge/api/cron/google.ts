/**
 * The google sweep's door: pg_cron asks it every hour (migration 00069) with the sweep key, and it answers what the
 * sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepGoogle
 * in lib/google/google-sweep.ts: every listing not read for twenty hours is read again and every connected profile not
 * synced for twenty hours is synced.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepGoogle } from "../../lib/google/google-sweep.js";

export const POST = sweepDoor({ sweep: "google" }, sweepGoogle);

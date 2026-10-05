/**
 * The deadman sweep's door: pg_cron asks it every 10 minutes ('deadman-sweep', 00018) with the sweep key, and it
 * answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepDeadman
 * in lib/receptionist/deadman-sweep.ts: an escalation nobody picked up, a message nobody answered and a reply nothing
 * was sending are raised to a person.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepDeadman } from "../../lib/receptionist/deadman-sweep.js";

export const POST = sweepDoor({ sweep: "deadman", noDbEvent: "deadman_no_db" }, sweepDeadman);

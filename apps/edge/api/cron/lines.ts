/**
 * The lines sweep's door: pg_cron asks it every quarter hour (migration 00097) with the sweep key, and it answers what
 * the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepLines
 * in lib/lines/lines-sweep.ts: a line that has been setting up longer than a line can legitimately take is resumed
 * where it stopped, and a number whose subscription ended is given back after its grace.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepLines } from "../../lib/lines/lines-sweep.js";

export const POST = sweepDoor({ sweep: "lines" }, sweepLines);

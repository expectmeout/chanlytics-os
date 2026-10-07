/**
 * The leads sweep's door: pg_cron asks it every five minutes (00140's clock `leads`) with the sweep key, and it answers
 * what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepLeads
 * in lib/leads/leads-sweep.ts: what the finder's runs and rounds need that no job is doing is read and applied, row by
 * row.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepLeads } from "../../lib/leads/leads-sweep.js";

export const POST = sweepDoor({ sweep: "leads" }, sweepLeads);

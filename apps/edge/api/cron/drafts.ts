/**
 * The drafts sweep's door: pg_cron asks it every 5 minutes while a hold is open ('drafts-sweep', 00538) with the sweep key,
 * and it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepDrafts in
 * lib/drafts/draft-sweep.ts: a draft a dropped event, a run that died or a change of the rules left behind is asked for.
 */
import { sweepDrafts } from "../../lib/drafts/draft-sweep.js";
import { sweepDoor } from "../../lib/ops/sweep-door.js";

export const POST = sweepDoor({ sweep: "drafts", noDbEvent: "drafts_sweep_no_db" }, sweepDrafts);

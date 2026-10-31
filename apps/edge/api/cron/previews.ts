/**
 * The previews sweep's door: pg_cron asks it every hour ('previews-sweep', 00497) with the sweep key, and it answers
 * what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepPreviews in lib/previews/sweep.ts: each lead's preview past its thirty days that nobody made theirs has its agent
 * deleted at the provider, then is ended, its workspace erased (decision 0079).
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepPreviews } from "../../lib/previews/sweep.js";

export const POST = sweepDoor({ sweep: "previews" }, (tick) => sweepPreviews(tick));

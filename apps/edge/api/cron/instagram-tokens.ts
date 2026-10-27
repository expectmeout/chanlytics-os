/**
 * The Instagram token sweep's door: pg_cron asks it once a day ('instagram-token-sweep', 00486) with the sweep key, and
 * it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepInstagramTokens in lib/instagram/token-sweep.ts: each connected account's token refreshed once it is a week old,
 * and an account whose token Instagram refused marked and told to its workspace.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepInstagramTokens } from "../../lib/instagram/token-sweep.js";

export const POST = sweepDoor({ sweep: "instagram_tokens" }, (tick) => sweepInstagramTokens(tick));

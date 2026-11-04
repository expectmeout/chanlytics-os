/**
 * The daily text canary's door: pg_cron asks it at 14:00 and 14:15 UTC ('text-canary', 00537) with the sweep key, and it
 * answers what the canary says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the canary is sweepCanary
 * in lib/sms/canary.ts: a text from the platform's own canary number to the platform's own line, and a quarter of an hour
 * later proof that it was taken in and answered, or a page.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepCanary } from "../../lib/sms/canary.js";

export const POST = sweepDoor({ sweep: "text_canary" }, sweepCanary);

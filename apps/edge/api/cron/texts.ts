/**
 * The texts sweep's door: pg_cron asks it every ten minutes ('texts-sweep', 00583) while a line that can text exists,
 * with the sweep key, and it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepUnheardTexts in lib/sms/texts-sweep.ts: each line's record of received texts is read from Twilio, and every text
 * the database never heard (the door was down when Twilio posted it, and Twilio retries nothing) knocks on the text door
 * again.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepUnheardTexts } from "../../lib/sms/texts-sweep.js";

export const POST = sweepDoor({ sweep: "texts" }, sweepUnheardTexts);

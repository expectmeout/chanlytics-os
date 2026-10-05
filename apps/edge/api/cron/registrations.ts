/**
 * The registrations sweep's door: pg_cron asks it every hour (migration 00077) with the sweep key, and it answers what
 * the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepRegistrations in lib/lines/registrations-sweep.ts: every line whose registration is still with the carriers is
 * asked where it stands, and a campaign that could not be filed while the brand was in progress is filed.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepRegistrations } from "../../lib/lines/registrations-sweep.js";

export const POST = sweepDoor({ sweep: "registrations" }, sweepRegistrations);

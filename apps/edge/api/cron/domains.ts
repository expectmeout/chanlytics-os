/**
 * The domains sweep's door: pg_cron asks it at minutes 2, 12, ... 52 ('domains-sweep', 00175) with the sweep key, and
 * it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is sweepDomains
 * in lib/email/domains-sweep.ts: every sending domain that is being checked or can send is read at the cold mail
 * account and in DNS, and judged.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepDomains } from "../../lib/email/domains-sweep.js";
export { YIELD_AT_MS } from "../../lib/email/domains-sweep.js";

export const POST = sweepDoor({ sweep: "domains", noDbEvent: "domains_no_db" }, sweepDomains);

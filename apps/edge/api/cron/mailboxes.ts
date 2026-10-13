/**
 * The mailboxes sweep's door: pg_cron asks it at minutes 2, 7, ... 57 ('mailboxes-sweep', 00423) with the sweep key,
 * and it answers what the sweep says.
 *
 * sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks the key; the sweep is
 * sweepMailboxes in lib/email/mailbox/mailbox-sweep.ts: every mailbox a business connected has its watch kept, its
 * inbox read back, and its health judged.
 */
import { sweepDoor } from "../../lib/ops/sweep-door.js";
import { sweepMailboxes } from "../../lib/email/mailbox/mailbox-sweep.js";
export { READS_UNTIL_MS } from "../../lib/email/mailbox/mailbox-sweep.js";

export const POST = sweepDoor({ sweep: "mailboxes", noDbEvent: "mailboxes_no_db" }, sweepMailboxes);

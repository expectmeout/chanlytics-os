/**
 * Gmail's push for a connected mailbox (decision 0056): a Pub/Sub push subscription on GMAIL_PUSH_TOPIC posts here when
 * a mailbox's inbox changes, with a Google-signed token for GMAIL_PUSH_AUDIENCE.
 *
 * The door names the request and calls receiveGmailPush in lib/email/mailbox/mailbox-push.ts: the token checked, the
 * mailbox that changed read back (mailbox-sync.ts). Answered 204.
 */
import { door } from "../../lib/log.js";
import { receiveGmailPush } from "../../lib/email/mailbox/mailbox-push.js";
export { PUSH_READS_UNTIL_MS } from "../../lib/email/mailbox/mailbox-push.js";

export const POST = door(receiveGmailPush);

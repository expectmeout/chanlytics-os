/**
 * Microsoft Graph's notifications for a connected mailbox (decision 0056): each subscription a connect made posts here
 * when its inbox receives a message, carrying the clientState it was made with (GRAPH_NOTIFY_SECRET); and once, when it
 * is made, a validation token to echo.
 *
 * The door names the request and calls receiveGraphPush in lib/email/mailbox/mailbox-push.ts: the token echoed, or each
 * notification's clientState checked and its mailbox read back (mailbox-sync.ts). Answered 202.
 */
import { door } from "../../lib/log.js";
import { receiveGraphPush } from "../../lib/email/mailbox/mailbox-push.js";

export const POST = door(receiveGraphPush);

/**
 * Google Drive's signal for a watched folder (the footage sources plan, D18): a push channel opened on an account's
 * changes posts here when something in that Drive changed, with the channel's id and the token it was opened with.
 *
 * The door names the request and calls receiveDriveSignal in lib/files/sources/push.ts: the channel and its token
 * checked against the folder's row, and one read of the folder put on the ledger. Answered 204 at once; it reads no
 * provider.
 */
import { door } from "../../lib/shared/log.js";
import { receiveDriveSignal } from "../../lib/files/sources/push.js";

export const POST = door(receiveDriveSignal);

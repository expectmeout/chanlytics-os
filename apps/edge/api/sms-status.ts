/**
 * POST /api/sms-status — the carrier's word on a text we sent.
 *
 * Every text the edge sends asks Twilio to post its fate here (the
 * StatusCallback on the send, lib/sms.ts). Until this door existed an SMS row
 * was "sent" the moment the provider accepted it and stayed so forever: a
 * text the carrier filtered (30007), or could not deliver, looked exactly
 * like one that arrived, and the Inbox had nothing to show for the failure
 * mode the A2P review is all about.
 *
 * The request is proven first, the way the inbound door proves its texts:
 * X-Twilio-Signature over the exact URL and every field, with the token of
 * the subaccount the line lives in, read from the vault. The line is the
 * From: the number the text left on. Then the row is found by its sid and
 * moved the way a WhatsApp receipt moves it (recordStatusByExternalId):
 * forward only, terminal states kept, an unknown sid logged and let go.
 *
 * Twilio retries a status callback it could not deliver, so a database that
 * is down is a 503 and the word comes again; anything it should not retry is
 * a 2xx with nothing in it.
 */
import { text } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { smsStatusFrom, smsStatusToRow, verifyTwilioSignature } from "../lib/packages/channels.js";
import { recordStatusByExternalId } from "../lib/packages/db.js";
import { lineByNumber, lineAccount } from "../lib/sms/sms.js";
import { logger } from "../lib/log.js";
import { phoneTail } from "../lib/packages/contracts.js";

export const config = { maxDuration: 30 };

const empty = (status: number) => text(status, "", { "content-type": "text/plain" });

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  const form: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) form[k] = v;
  const s = smsStatusFrom(form);
  if (!s) return empty(400);
  const L = logger({ sid: s.messageSid, status: s.status, to_tail: phoneTail(s.to), from_tail: phoneTail(s.from) });

  const db = pg();
  if (!db) return empty(503);

  let line, acct;
  try {
    line = await lineByNumber(db, s.from);
    acct = line ? await lineAccount(db, line) : null;
  } catch (e) {
    L.error("sms_status_line_unreadable", { error: e instanceof Error ? e.message : String(e) });
    return empty(503);
  }
  if (!line) {
    L.warn("sms_status_unknown_line");
    return empty(404);
  }
  if (!acct) {
    L.error("sms_status_line_without_account");
    return empty(503);
  }
  if (line.provider !== "dry") {
    const ok = await verifyTwilioSignature(acct.token, request.url, form, request.headers.get("x-twilio-signature"));
    if (!ok) {
      L.warn("sms_status_bad_signature");
      return empty(403);
    }
  }

  const rowStatus = smsStatusToRow(s.status);
  if (!rowStatus) {
    L.info("sms_status_interim");
    return empty(200);
  }
  try {
    await recordStatusByExternalId(
      db,
      line.tenant_id,
      s.messageSid,
      rowStatus,
      rowStatus === "failed" ? { carrier: s.status, ...(s.errorCode ? { code: s.errorCode } : {}) } : undefined,
    );
  } catch (e) {
    L.error("sms_status_record_failed", { error: e instanceof Error ? e.message : String(e) });
    return empty(503);
  }
  L.info("sms_status", { recorded: rowStatus, code: s.errorCode });
  return empty(200);
}

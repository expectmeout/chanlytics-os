/**
 * POST /api/sms-status — the carrier's word on a text we sent.
 *
 * The door is api/sms-status.ts: `door(receiveSmsStatus)`, which names the request the platform's way (log.ts).
 * Everything a delivery does is here, in the order the door had it: the line and its account are read, Twilio's
 * signature checked (a dry line has none) and the status recorded.
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
 * A text the carrier then refuses (undelivered, failed) is news to the owner, as a send that fails at the wire is (core
 * raiseLateFailure): the thread is flagged and the bell rings, once per message, BEFORE the row moves to failed, so a
 * flag the database would not take is a 503 with the row untouched and Twilio sends the callback again.
 *
 * One refusal is not a failure of ours: 21610, the person having replied STOP to the number (channels
 * SMS_OPTED_OUT_CODE). The send door records that as their STOP when the wire says it at once (core deliver.ts); told
 * late, it is the same STOP, recorded here the same way (db recordLateCarrierOptOut) and never raised as a hold, as the
 * send door raises none: the owner has nothing to fix, the thread shows the text as not delivered with why (contracts
 * sendFailureWords), and every later send to the person is refused before the carrier is asked. The log says what the
 * report came to (`carrier_stop`: recorded, already_stopped, newer_answer, no_person, not_our_text).
 *
 * Twilio does NOT send a status callback again for an answer it got: its own retry is for a connection that never
 * opened, never for a 5xx (inbound-text.ts says the same of a text). This said the opposite, so a database that would
 * not take the report answered 503 and waited for a word that never came: the row stayed `sent`, and a reply the
 * carrier refused was never flagged. The report is recovered here instead: the delivery is kept in the intake ledger
 * before the verdict, and when the record fails the platform is paged with the key that replays it once the database
 * is well (api/admin/intake/replay, which proves the signature again and knocks on this door). The 503 is what
 * happened; anything Twilio should not retry is a 2xx with nothing in it. A line or account that could not be read
 * is a 503 before anything is proven or kept, and is the log's alone.
 */
import { text } from "../shared/http.js";
import { pg } from "../shared/pg.js";
import { keepDelivery, signatureHeaders } from "../shared/keep-event.js";
import { SMS_OPTED_OUT_CODE, smsStatusFrom, smsStatusToRow, verifyTwilioSignature } from "@chanlytics/channels/lines";
import { recordLateCarrierOptOut, type LateCarrierStop } from "@chanlytics/db/campaigns";
import { recordStatusByExternalId } from "@chanlytics/db/channels";
import { flagLateFailure } from "../shared/late-failure.js";
import { findLineByNumber, findLineAccount } from "../lines/sms.js";
import { pageOperator, type PageOutcome } from "../shared/alerts/page-operator.js";
import { logger } from "../shared/log.js";
import { phoneTail } from "@chanlytics/contracts";
import type { TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";

const empty = (status: number) => text(status, "", { "content-type": "text/plain" });

/**
 * A carrier's report the database would not take, told to the platform (shared/alerts/page-operator.ts), under the workspace's
 * own key: `sms_status_unrecorded:<tenant_id>`, so a database that refuses every report pages a few times a day, not
 * once a text. Names the delivery's replay key and never a number or the words. Never throws: a page that could not
 * go is its outcome, said on the door's line.
 */
async function pageLostReport(
  db: NonNullable<ReturnType<typeof pg>>,
  tenantId: TenantId,
  fields: { replay: string; kept: boolean; status: string; error: string },
): Promise<PageOutcome> {
  return pageOperator(
    { db },
    `sms_status_unrecorded:${tenantId}`,
    `A text's delivery report could not be recorded in workspace ${tenantId.slice(0, 8)}`,
    [
      `Twilio reported "${fields.status}" for a text and the database would not take it: ${fields.error}`,
      "Twilio does not send a status callback again, so until it is replayed the text reads as sent, and a reply the carrier refused is not flagged for the owner.",
      "",
      `Workspace: ${tenantId}`,
      fields.kept
        ? `Replay it once the database is well: POST /api/admin/intake/replay {"provider":"twilio","provider_event_id":"${fields.replay}"}. Any others are on the log as sms_status_record_failed, each with its key.`
        : `It could not be kept in the intake ledger either (${fields.replay}): read the message's status in Twilio's console.`,
      "",
      "This page comes at most once in six hours for the workspace.",
    ].join("\n"),
  ).catch(logAndGoOn<PageOutcome>("pageOperator", "failed"));
}

export async function receiveSmsStatus(request: Request): Promise<Response> {
  const raw = await request.text();
  const form: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) form[k] = v;
  const smsStatus = smsStatusFrom(form);
  if (!smsStatus) return empty(400);
  const log = logger({
    sid: smsStatus.messageSid,
    status: smsStatus.status,
    to_tail: phoneTail(smsStatus.to),
    from_tail: phoneTail(smsStatus.from),
  });

  const db = pg();
  if (!db) return empty(503);

  let line, acct;
  try {
    line = await findLineByNumber(db, smsStatus.from);
    acct = line ? await findLineAccount(db, line) : null;
  } catch (e) {
    log.error("sms_status_line_unreadable", { error: e instanceof Error ? e.message : String(e) });
    return empty(503);
  }
  if (!line) {
    log.warn("sms_status_unknown_line");
    return empty(404);
  }
  if (!acct) {
    log.error("sms_status_line_without_account");
    return empty(503);
  }
  if (line.provider !== "dry") {
    const ok = await verifyTwilioSignature(acct.token, request.url, form, request.headers.get("x-twilio-signature"));
    if (!ok) {
      log.warn("sms_status_bad_signature");
      return empty(403);
    }
  }

  // Kept under Twilio's id and the status it carried, before the verdict (decision 0032, 00336): the key a report the
  // database would not take is replayed by.
  const replay = `${smsStatus.messageSid}:${smsStatus.status}`;
  const kept = await keepDelivery(db, {
    provider: "twilio",
    id: replay,
    door: "/api/sms-status",
    url: request.url,
    tenantId: line.tenant_id,
    headers: signatureHeaders(request, ["x-twilio-signature"]),
    body: raw,
  });
  const rowStatus = smsStatusToRow(smsStatus.status);
  if (!rowStatus) {
    log.info("sms_status_interim");
    return empty(200);
  }
  const failure =
    rowStatus === "failed"
      ? { carrier: smsStatus.status, ...(smsStatus.errorCode ? { code: smsStatus.errorCode } : {}) }
      : undefined;
  // The person replied STOP to the number: their answer, recorded below, never a failed send to raise.
  const stopped = !!failure && smsStatus.errorCode === String(SMS_OPTED_OUT_CODE);
  let flagged: string | null = null;
  let carrierStop: LateCarrierStop | null = null;
  try {
    if (failure && !stopped)
      flagged = await flagLateFailure(db, line.tenant_id, {
        externalId: smsStatus.messageSid,
        channel: "sms",
        error: failure,
      });
    await recordStatusByExternalId(db, line.tenant_id, smsStatus.messageSid, rowStatus, failure);
    if (stopped)
      carrierStop = await recordLateCarrierOptOut(db, { tenantId: line.tenant_id, externalId: smsStatus.messageSid });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // Twilio will not send it again, so a person replays it: the line names every one, the page the first.
    const paged = await pageLostReport(db, line.tenant_id, { replay, kept, status: smsStatus.status, error });
    log.error("sms_status_record_failed", { error, replay, kept, paged });
    return empty(503);
  }
  log.info("sms_status", {
    recorded: rowStatus,
    code: smsStatus.errorCode,
    ...(flagged ? { flagged } : {}),
    ...(carrierStop === null ? {} : { carrier_stop: carrierStop }),
  });
  return empty(200);
}

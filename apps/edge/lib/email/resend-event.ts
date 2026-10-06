/**
 * Chanlytics Messaging -- Resend's webhook: a received email, and what became
 * of the ones we sent.
 *
 * The door is api/resend-webhook.ts: `door(receiveResendEvent)`, which names the request the platform's way (log.ts).
 * Everything a delivery does is here, in the order the door had it: the event is verified and planned
 * (planResendEvent), a receipt applied and a received mail scheduled as an email_ingest job.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. What an event means is decided by
 * planResendEvent (lib/email-ingress.ts), which runs over a database in memory
 * in a test; what is left here is reading the raw body, the ledger insert, the
 * count of mail for nobody, and what Resend wants back.
 *
 * The received event is a pointer, so nothing is fetched or judged in this
 * request: each mailbox the delivery names gets one email_ingest job, once,
 * however often Resend redelivers (the ledger's unique index, 00127), and the
 * job does the rest under the ledger's lease and retries. A job that failed
 * all its tries no longer counts (00135), so replaying its webhook from Resend
 * once the cause is fixed takes the email in again. A receipt is applied
 * here, in the request (lib/email-receipts.ts says why that is safe). Resend is
 * answered 200 only once the work is written; a database that is down is a
 * 503, so the delivery comes back.
 *
 * Email is off on a deployment that names no EMAIL_DOMAIN: 404, the door does
 * not exist there.
 */
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { digestId, keepDelivery, signatureHeaders } from "../intake/keep.js";
import { logger, errField } from "../log.js";
import { coldReplyDomains, emailDomain } from "./email.js";
import { planResendEvent } from "./email-ingress.js";
import { applyEmailReceipt } from "./email-receipts.js";
import { emitEvent } from "../packages/db.js";
import { scheduleJobOnce } from "../packages/jobs.js";
import { env } from "../env.js";
import { MIN_MS } from "../packages/contracts.js";

/** The event is metadata: ids, addresses, a subject. Anything larger is not one. */
const MAX_BODY_BYTES = 256 * 1024;

/** Mail for nobody is counted at most this often per instance: spam to a made-up address must not become a row per message. */
const UNROUTABLE_ROW_MS = MIN_MS;

let lastUnroutableRow = 0;

export async function receiveResendEvent(request: Request): Promise<Response> {
  const domain = emailDomain();
  if (!domain) return refuse(404, "email_off");
  const L = logger({ door: "resend-webhook", svix_id: request.headers.get("svix-id") });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return refuse(413, "too_large");
  const db = pg();
  if (!db) return refuse(503, "no_database");

  let verdict;
  try {
    verdict = await planResendEvent({
      rawBody,
      headers: {
        id: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
      },
      secrets: [env.RESEND_WEBHOOK_SECRET, env.RESEND_COLD_WEBHOOK_SECRET].filter((s): s is string => !!s),
      domain,
      coldReplyDomains: coldReplyDomains(),
      db,
      nowMs: Date.now(),
    });
  } catch (e) {
    // A mailbox that could not be looked up is not "nobody's": the delivery comes back.
    L.error("resend_webhook_unreadable", { error: errField(e) });
    return refuse(503, "no_database");
  }

  if (verdict.kind === "refuse") {
    L.warn(verdict.log);
    return refuse(verdict.status, verdict.status === 401 ? "unauthorized" : "bad_request");
  }
  // Kept under svix's id, before the verdict is applied (decision 0030, 00334); its signature carries a timestamp, so a
  // replay proves it within the window only.
  await keepDelivery(db, {
    provider: "resend",
    id: request.headers.get("svix-id") ?? digestId(rawBody),
    door: "/api/resend-webhook",
    url: request.url,
    tenantId: verdict.kind === "receipt" ? verdict.receipt.tenantId : null,
    headers: signatureHeaders(request, ["svix-id", "svix-timestamp", "svix-signature"]),
    body: rawBody,
  });

  if (verdict.kind === "receipt") {
    const r = verdict.receipt;
    try {
      const outcome = await applyEmailReceipt(db, r, new Date().toISOString());
      L.info("email_receipt", { type: r.type, tenant_id: r.tenantId, message: r.messageId, outcome });
    } catch (e) {
      L.error("email_receipt_not_applied", {
        type: r.type,
        tenant_id: r.tenantId,
        message: r.messageId,
        error: errField(e),
      });
      return refuse(503, "no_database");
    }
    return json(200, { ok: true });
  }

  if (verdict.unroutable > 0 && Date.now() - lastUnroutableRow >= UNROUTABLE_ROW_MS) {
    lastUnroutableRow = Date.now();
    await emitEvent(db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", null, null, {
      channel: "email",
      addresses: verdict.unroutable,
    }).catch(() => {});
  }
  if (verdict.kind === "ignore") {
    L.info(verdict.log);
    return json(200, { ok: true });
  }

  try {
    const now = new Date();
    for (const job of verdict.jobs) {
      const outcome = await scheduleJobOnce(db, {
        tenantId: job.tenantId,
        kind: "email_ingest",
        dueAt: now,
        payload: { mailbox_id: job.mailboxId, received_id: verdict.receivedId },
      });
      L.info("email_received", { tenant_id: job.tenantId, mailbox: job.mailboxId, outcome });
    }
  } catch (e) {
    L.error("email_intake_not_scheduled", { error: errField(e) });
    return refuse(503, "no_database");
  }
  return json(200, { ok: true });
}

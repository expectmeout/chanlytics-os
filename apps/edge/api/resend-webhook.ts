/**
 * Chanlytics Messaging -- Resend's webhook: a received email, and what became
 * of the ones we sent.
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
import { json } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import { logger, errField } from "../lib/log.js";
import { emailDomain } from "../lib/email/email.js";
import { planResendEvent } from "../lib/email/email-ingress.js";
import { applyEmailReceipt } from "../lib/email/email-receipts.js";
import { emitEvent, type Json } from "../lib/packages/db.js";
import { scheduleJobOnce } from "../lib/packages/jobs.js";
import { env } from "../lib/env.js";

/** The event is metadata: ids, addresses, a subject. Anything larger is not one. */
const MAX_BODY_BYTES = 256 * 1024;
/** Mail for nobody is counted at most this often per instance: spam to a made-up address must not become a row per message. */
const UNROUTABLE_ROW_MS = 60_000;
let lastUnroutableRow = 0;

export async function POST(request: Request): Promise<Response> {
  const domain = emailDomain();
  if (!domain) return json(404, { ok: false, error: "email_off" });
  const L = logger({ door: "resend-webhook", svix_id: request.headers.get("svix-id") });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "too_large" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "database_unavailable" });

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
      db,
      nowMs: Date.now(),
    });
  } catch (e) {
    // A mailbox that could not be looked up is not "nobody's": the delivery comes back.
    L.error("resend_webhook_unreadable", { error: errField(e) });
    return json(503, { ok: false, error: "database_unavailable" });
  }

  if (verdict.kind === "refuse") {
    L.warn(verdict.log);
    return json(verdict.status, { ok: false, error: verdict.status === 401 ? "unauthorized" : "bad_request" });
  }

  if (verdict.kind === "receipt") {
    const r = verdict.receipt;
    try {
      const outcome = await applyEmailReceipt(db, r, new Date().toISOString());
      L.info("email_receipt", { type: r.type, tenant: r.tenantId, message: r.messageId, outcome });
    } catch (e) {
      L.error("email_receipt_not_applied", {
        type: r.type,
        tenant: r.tenantId,
        message: r.messageId,
        error: errField(e),
      });
      return json(503, { ok: false, error: "database_unavailable" });
    }
    return json(200, { ok: true });
  }

  if (verdict.unroutable > 0 && Date.now() - lastUnroutableRow >= UNROUTABLE_ROW_MS) {
    lastUnroutableRow = Date.now();
    await emitEvent(db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", "ingest", null, null, {
      channel: "email",
      addresses: verdict.unroutable,
    } as Json).catch(() => {});
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
      L.info("email_received", { tenant: job.tenantId, mailbox: job.mailboxId, outcome });
    }
  } catch (e) {
    L.error("email_intake_not_scheduled", { error: errField(e) });
    return json(503, { ok: false, error: "database_unavailable" });
  }
  return json(200, { ok: true });
}

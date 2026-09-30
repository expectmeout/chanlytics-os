/**
 * The watcher for the two watchdogs.
 *
 * pg_cron reports a sweep as succeeded the instant net.http_post queues the
 * request. So a rotated cron_sweep_key, a moved edge_base_url or a missing
 * RETELL_API_KEY stops the work and changes no visible signal. sweep_health()
 * (migration 00026) reads the request ids the triggers now record and joins
 * them to what pg_net actually got back; this route is the half that can reach
 * a human, for the same reason the deadman alert lives in the edge — notify()
 * owns who may be told what.
 *
 * It also pages the platform for four conditions no sweep row can show: due
 * jobs nobody is claiming, WhatsApp messages Meta accepted that have had no
 * receipt for six hours (lib/receipts-watch.ts), the mail domain no longer
 * being verified (lib/mail-domain.ts) -- the one that our own rows cannot show
 * at all -- and a workspace whose model calls or receptionist turns keep
 * failing (lib/ops/model-watch.ts, which also keeps the usage ledger).
 *
 * Called by pg_cron via pg_net at :13 and :43, same Vault secret as the two
 * sweeps it watches. The offset is deliberate: on the :00/:30 grid every tick
 * would land on a deadman tick and judge a request seconds old, which the
 * two-minute grace in sweep_health() exempts — a watchdog that can only ever
 * report healthy.
 */
import { json, refuse } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { notify } from "../../lib/ops/notify.js";
import { pageOperator } from "../../lib/ops/page-operator.js";
import { logger } from "../../lib/log.js";
import { chooseSweepAlerts, describeSweepTrouble, type SweepHealthRow } from "../../lib/ops/sweep-health.js";
import { whatsappWithoutReceipts, describeSilentReceipts } from "../../lib/whatsapp/receipts-watch.js";
import {
  checkMailDomain,
  describeColdReplyDomainTrouble,
  describeMailDomainTrouble,
} from "../../lib/email/mail-domain.js";
import { coldReplyDomains, emailDomain } from "../../lib/email/email.js";
import { watchModels } from "../../lib/ops/model-watch.js";
import { env } from "../../lib/env.js";

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "health" });
  const db = pg();
  if (!db) {
    L.error("sweep_health_no_db");
    return refuse(503, "no_database");
  }

  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  const { data, error } = await db.rpc("sweep_health");
  if (error) {
    L.error("sweep_health_query_failed", { error: error.message });
    return refuse(500, "query_failed");
  }
  const rows = (data ?? []) as unknown as SweepHealthRow[];
  const plan = chooseSweepAlerts(rows, Date.now());

  let delivered = false;
  if (plan.alert.length) {
    // A broken sweep is a PLATFORM fault: there is no tenant it belongs to and
    // no customer content in it, so this takes the same addressing
    // alertUnroutable() uses in apps/edge/api/whatsapp.ts.
    delivered = await notify(
      { tenantId: null, notifications: null, isEnvDefault: true },
      {
        subject: `A background sweep is not running: ${plan.alert.map((r) => r.sweep).join(", ")}`,
        body: describeSweepTrouble(plan.alert),
      },
    );
    if (!delivered) L.error("sweep_health_alert_undelivered", { broken: plan.broken.join(",") });
  }

  if (plan.recovered.length && !plan.broken.length) {
    await notify(
      { tenantId: null, notifications: null, isEnvDefault: true },
      {
        subject: "Background sweeps are answering again",
        body:
          `These were failing and are now answering normally:\n\n` +
          plan.recovered.map((s) => `  - ${s}`).join("\n") +
          `\n`,
      },
    );
  }

  // Only a DELIVERED alert earns the quiet — the alertUnroutable lesson. If
  // the mail failed, nothing is stamped and the next tick tries again.
  const { error: markErr } = await db.rpc("sweep_mark_alerted", {
    p_alerted: delivered ? plan.alert.map((r) => r.sweep) : [],
    p_healthy: plan.healthy,
  });
  if (markErr) L.error("sweep_health_mark_failed", { error: markErr.message });

  // Due work nobody is claiming is the platform's condition whatever the
  // sweep rows say: the heartbeat can be scheduled and answering and still
  // not draining. One page per window until it does.
  const { data: backlog, error: backlogErr } = await db.rpc("jobs_backlog");
  if (backlogErr) L.error("sweep_health_backlog_unreadable", { error: backlogErr.message });
  const due = typeof backlog === "number" ? backlog : 0;
  if (due > 0) {
    await pageOperator(
      { db },
      "jobs_backlog",
      `${due} due jobs have waited more than two minutes`,
      "The heartbeat is scheduled but not draining. Check sweep_health for 'jobs' and the tick's Vercel logs.",
    );
  }

  // WhatsApp messages that never heard back, in a workspace where nothing
  // else has been receipted since either: the webhook, not a phone. The page
  // names workspaces and times, never a customer, and comes once per window
  // while it lasts. A read that fails is logged.
  const receipts = await whatsappWithoutReceipts(db, Date.now());
  if (receipts.error) L.error("sweep_health_receipts_unreadable", { error: receipts.error });
  const unreceipted = receipts.silent.reduce((n, w) => n + w.count, 0);
  if (unreceipted > 0) {
    const page = describeSilentReceipts(receipts.silent, Date.now());
    await pageOperator({ db }, "whatsapp_no_receipt", page.subject, page.body);
  }

  // The mail domain every workspace's address is on, asked of the provider:
  // when it stops being verified, mail is dropped with no bounce and nothing
  // on our side changes, so there is no row to read and this is the only way
  // to find out. Email off on this deployment checks nothing.
  const mailDomain = emailDomain();
  const mail = await checkMailDomain({ domain: mailDomain, apiKey: env.RESEND_API_KEY });
  if (mail.error) L.error("mail_domain_unreadable", { domain: mailDomain, error: mail.error });
  if (mail.trouble && mailDomain) {
    const page = describeMailDomainTrouble(mail.trouble, mailDomain);
    await pageOperator({ db }, "mail_domain", page.subject, page.body);
  }
  // And each cold reply domain (D17), which must receive as the mail domain does: every cold email's Reply-To is on
  // one, and a reply dropped there is a "no thanks" nobody reads. Received on the platform's account, so asked with
  // its key; sending switched off there is no trouble.
  const coldTrouble: string[] = [];
  for (const cold of coldReplyDomains()) {
    const c = await checkMailDomain({ domain: cold, apiKey: env.RESEND_API_KEY, receiveOnly: true });
    if (c.error) L.error("cold_reply_domain_unreadable", { domain: cold, error: c.error });
    if (c.trouble) {
      coldTrouble.push(cold);
      const page = describeColdReplyDomainTrouble(c.trouble, cold);
      await pageOperator({ db }, `cold_reply_domain:${cold}`, page.subject, page.body);
    }
  }

  // A workspace whose model keeps failing, paged once per window; the usage ledger's old rows removed.
  const models = await watchModels(db);

  L.info("sweep_health_checked", {
    broken: plan.broken.length,
    alerted: delivered ? plan.alert.length : 0,
    recovered: plan.recovered.length,
    unreceipted,
    mail_domain: mail.trouble?.kind ?? mail.skipped ?? (mail.error ? "unreadable" : "ok"),
    cold_reply_trouble: coldTrouble,
    model_failures_paged: models.paged,
    ai_usage_purged: models.purged,
  });

  // ALWAYS 200, even when a sweep is broken. This route's own response is
  // recorded in net._http_response and read by /api/diag, so answering non-2xx
  // to report someone else's failure would make the health check report itself
  // as broken and never recover.
  return json(200, { ok: true, healthy: plan.broken.length === 0, broken: plan.broken });
}

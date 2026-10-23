/**
 * The watcher for the two watchdogs.
 *
 * The route is api/cron/health.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * pg_cron reports a sweep as succeeded the instant net.http_post queues the
 * request. So a rotated cron_sweep_key, a moved edge_base_url or a missing
 * RETELL_API_KEY stops the work and changes no visible signal. sweep_health()
 * (migration 00026) reads the request ids the triggers now record and joins
 * them to what pg_net actually got back; this sweep is the half that can reach
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
import { json, refuse } from "../http.js";
import { notify } from "./notify.js";
import { pageOperator } from "./page-operator.js";
import { chooseSweepAlerts, describeSweepTrouble, type SweepHealthRow } from "./sweep-health.js";
import { whatsappWithoutReceipts, describeSilentReceipts } from "../whatsapp/receipts-watch.js";
import { checkMailDomain, describeCampaignsDomainTrouble, describeMailDomainTrouble } from "../email/mail-domain.js";
import { campaignsDomain } from "../email/campaigns-domain.js";
import { emailDomain } from "../email/email.js";
import { watchAnswerSilence, watchTargets } from "./day-watch.js";
import { watchModels } from "./model-watch.js";
import { leadSourceClient, watchLeadPins } from "../leads/lead-sources.js";
import { env } from "../env.js";
import type { SweepTick } from "./sweep-door.js";

/**
 * The campaigns domain offers by email leave from (EMAIL_CAMPAIGNS_DOMAIN), when this deployment names one: it must stay
 * verified for SENDING, or every offer is refused until it is. Receiving there is nobody's business.
 */
async function watchCampaignsDomain({ db, L }: Pick<SweepTick, "db" | "L">): Promise<void> {
  const campaigns = campaignsDomain();
  if (!campaigns) return;
  const c = await checkMailDomain({ domain: campaigns, apiKey: env.RESEND_API_KEY, sendOnly: true });
  if (c.error) L.error("mail_domain_unreadable", { domain: campaigns, error: c.error });
  if (c.trouble) {
    const page = describeCampaignsDomainTrouble(c.trouble, campaigns);
    await pageOperator({ db }, `campaigns_domain:${campaigns}`, page.subject, page.body);
  }
}

export async function sweepHealth({ db, L }: SweepTick): Promise<Response> {
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
  await watchCampaignsDomain({ db, L });

  // Workspaces whose customers wrote all day and got no answer from anyone (00277), paged once per silent day.
  const answerSilent = await watchAnswerSilence(db, Date.now());
  // The day's numbers past the targets the platform answers for (decision 0031, invariant 12), paged once per day.
  const pastTargets = await watchTargets(db, Date.now());
  // A workspace whose model keeps failing, paged once per window; the usage ledger's old rows removed.
  const models = await watchModels(db);
  // Each lead source's pinned build held against the provider's latest, once a day: a pin behind it is paged before
  // the provider deletes it (23 Oct 2026: a deleted pin refused every Maps search at its start).
  const pinsBehind = await watchLeadPins(db, leadSourceClient(), Date.now());

  L.info("sweep_health_checked", {
    broken: plan.broken.length,
    alerted: delivered ? plan.alert.length : 0,
    recovered: plan.recovered.length,
    unreceipted,
    mail_domain: mail.trouble?.kind ?? mail.skipped ?? (mail.error ? "unreadable" : "ok"),
    answer_silent: answerSilent,
    past_targets: pastTargets,
    model_failures_paged: models.paged,
    ai_usage_purged: models.purged,
    lead_pins_behind: pinsBehind,
  });

  // ALWAYS 200, even when a sweep is broken. This route's own response is
  // recorded in net._http_response and read by /api/diag, so answering non-2xx
  // to report someone else's failure would make the health check report itself
  // as broken and never recover.
  return json(200, { ok: true, healthy: plan.broken.length === 0, broken: plan.broken });
}

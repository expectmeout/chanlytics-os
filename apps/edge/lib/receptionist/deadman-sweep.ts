/**
 * The deadman sweep: an escalation nobody picked up, a message nobody answered, a reply nothing was sending.
 *
 * The route is api/cron/deadman.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and checks
 * the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * An escalation opens, the owner gets one email, and if that email is missed the conversation sits open indefinitely
 * with nothing to raise its hand. A customer waiting on a human is the one failure this product cannot be relaxed
 * about, and `deadman` was a declared job kind, escalation reason and UI label from Slice 2 with no emitter until
 * this sweep (00018).
 *
 * One tick, in this order:
 *   1. sweepUnfinished (lib/receptionist/unfinished.ts), asked first and on its own, so a failure there
 *      (unfinished_sweep_failed) never costs the watchdog its tick. It finds a WhatsApp or SMS message the handler
 *      accepted and never finished with, and a queued reply no live outbound_send job is sending. The first is
 *      opened for a person (an escalation, reason brain_error), its owner told what the customer said, and the
 *      message stamped handled; nothing is answered on its own. The second is marked failed and its thread flagged
 *      (send_failed), except a campaign's email, which its run counts. Email is not swept here: its intake is a job
 *      with its own lease.
 *   2. sweepStrandedRuns (lib/ops/stranded-runs.ts), on its own too (stranded_run_sweep_failed) and inside a time
 *      budget: a run still scheduled ten minutes past its time with no broadcast_send job to start it is marked not
 *      sent (run_interrupted) and its owner told once, with the run's own link. A reach-out's run is not one.
 *   3. deadman_candidates(UNANSWERED_AFTER): the open escalations nobody has been warned about, oldest first. Each
 *      workspace's people are looked up once (loadTenantNotifications) and told through notify: a row on its bell of
 *      kind `deadman` and a mail carrying the customer to the workspace's OWN recipients. Only a delivered warning
 *      earns the once-guard, and it lives on the ROW (escalations.deadman_alerted_at, set by deadman_mark_alerted),
 *      so a failed send is tried again next tick and an escalation is flagged at most once however long it stays
 *      open. A workspace with nobody on file (reachesTenant) is not warned from here at all and its escalation is
 *      left unstamped, so it is raised the moment somebody is on file; the platform hears of it through pageOperator
 *      (deadman_unaddressable:<tenant>, one page per workspace per pager window), which is not one email per tick.
 *
 * The DETECTION is a SQL sweep, so it notices an abandoned conversation regardless of which code path abandoned it,
 * including paths written later. The ALERT is here, because addressing a tenant correctly is real logic -- one
 * business's customer must never be described in another business's inbox -- and a second copy of that rule in
 * plpgsql is exactly the duplication this codebase keeps paying for.
 *
 * Called by pg_cron via pg_net every 10 minutes ('deadman-sweep', 00018) through trigger_deadman_sweep, which records
 * the request in sweep_status (00026); sweep_health() judges the answer and expects one at least every 25 minutes
 * (00107). Auth is authorizeCron: the x-cron-key header against the sweep key held in Vault, so nothing is added to
 * the edge's environment. It answers 200 with the counts, and 500 when the candidates cannot be read
 * (deadman_query_failed), before any escalation is told. Its lines carry `sweep: "deadman"` and, for a workspace,
 * its `tenant_id`.
 */
import { json } from "../http.js";
import { notify, notifyOnce, reachesTenant } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import { errField } from "../log.js";
import { pageOperator } from "../ops/page-operator.js";
import { markProcessed } from "../packages/db.js";
import { upsertEscalation } from "../packages/jobs.js";
import { sweepUnfinished } from "./unfinished.js";
import { sweepStrandedRuns } from "../ops/stranded-runs.js";
import { MIN_MS } from "../packages/contracts.js";
import type { SweepTick } from "../ops/sweep-door.js";

/** How long a customer may wait on a human before this is a problem. */
const UNANSWERED_AFTER = "2 hours";

interface Candidate {
  escalation_id: string;
  tenant_id: string;
  conversation_id: string;
  reason: string;
  details: string | null;
  opened_at: string;
  phone_e164: string | null;
}
/** How long into the tick the stranded runs may keep telling: the two-hour watchdog after them needs the rest. */
const STRANDED_BUDGET_MS = 20_000;

export async function sweepDeadman({ db, L, started }: SweepTick): Promise<Response> {
  // A customer's message the handler never finished with, and a queued reply
  // nothing is sending: accepted means recoverable, and until now neither had
  // anything to raise its hand (lib/unfinished.ts). Asked first and on its
  // own, so a failure there never costs the two-hour watchdog its tick.
  let unfinished: Awaited<ReturnType<typeof sweepUnfinished>> = { unanswered: 0, orphaned: 0, told: 0 };
  try {
    unfinished = await sweepUnfinished({
      db,
      L,
      upsertEscalation,
      markProcessed,
      notify,
      loadTenantNotifications,
      reachesTenant,
    });
  } catch (e) {
    L.error("unfinished_sweep_failed", { error: errField(e) });
  }
  // A run still scheduled past its time with nothing on the ledger to send it (ops/stranded-runs.ts): asked on its own
  // too, so it never costs the watchdog its tick.
  let stranded = 0;
  try {
    ({ stranded } = await sweepStrandedRuns({
      db,
      L,
      notifyOnce,
      loadTenantNotifications,
      deadline: started + STRANDED_BUDGET_MS,
    }));
  } catch (e) {
    L.error("stranded_run_sweep_failed", { error: errField(e) });
  }
  const asked = { ...unfinished, stranded };

  const { data, error } = await db.rpc("deadman_candidates", { p_older_than: UNANSWERED_AFTER });
  if (error) {
    L.error("deadman_query_failed", { error: error.message });
    return json(500, { ok: false });
  }
  const candidates = (data ?? []) as unknown as Candidate[];
  if (candidates.length === 0) return json(200, { ok: true, flagged: 0, ...asked });

  // One addressing lookup per TENANT, not per escalation: a backlog is usually
  // one workspace having a bad morning.
  const addressing = new Map<string, Awaited<ReturnType<typeof loadTenantNotifications>>>();
  const alerted: string[] = [];
  /** Workspaces with an open escalation and nobody on file to tell about it. */
  const unaddressable = new Set<string>();

  for (const c of candidates) {
    try {
      if (!addressing.has(c.tenant_id)) {
        addressing.set(c.tenant_id, await loadTenantNotifications(db, c.tenant_id));
      }
      const waitedMin = Math.round((Date.now() - new Date(c.opened_at).getTime()) / MIN_MS);
      const waited = waitedMin >= 120 ? `${Math.round(waitedMin / 60)} hours` : `${waitedMin} minutes`;

      // A workspace with nobody to tell is not warned AT ALL from here, and
      // its escalation is left unstamped so it is raised the moment somebody
      // is on file.
      //
      // The obvious version of this — send the redacted platform note and
      // withhold the stamp — is a flood: this sweep runs every ten minutes and
      // the row keeps coming back, so one open escalation becomes a hundred
      // and forty-four platform emails and as many bell rows a day, on the
      // only alarm channel this system has. The platform still needs to know,
      // so it is told through the pager that remembers: one page per workspace
      // per six hours, durable across instances, stamped only when it sends.
      const target = { tenantId: c.tenant_id, ...addressing.get(c.tenant_id)! };
      if (!reachesTenant(target)) {
        unaddressable.add(c.tenant_id);
        L.warn("deadman_tenant_unaddressable", { tenant_id: c.tenant_id, escalation: c.escalation_id });
        continue;
      }

      const delivered = await notify(target, {
        kind: "deadman",
        route: "inbox",
        subject: `Still waiting: a customer has had no answer for ${waited}`,
        body:
          `A conversation was handed to a human ${waited} ago and is still open.\n\n` +
          `Customer: ${c.phone_e164 ?? "unknown"}\n` +
          `Flagged because: ${c.reason}\n` +
          `${c.details ? `Detail: ${c.details}\n` : ""}` +
          `\nOpen it in the Inbox to reply, or resolve it if it was handled elsewhere.`,
        redactedBody: `A customer in this workspace has waited ${waited} for a human reply.`,
        // The phone is told with the mail that goes: an undelivered warning is raised again next tick, and its push
        // with it would reach every phone of the workspace every ten minutes (decision 0040).
        push: "after_mail",
      });

      // Only a DELIVERED warning earns the once-guard, and only this
      // workspace's own people count as delivery — the unaddressable case
      // never reaches here. If the send failed, the next tick tries again
      // rather than marking the customer as handled.
      if (delivered) alerted.push(c.escalation_id);
      else L.warn("deadman_alert_undelivered", { tenant_id: c.tenant_id, escalation: c.escalation_id });
    } catch (e) {
      L.error("deadman_candidate_failed", { tenant_id: c.tenant_id, escalation: c.escalation_id, error: errField(e) });
    }
  }

  // One page per workspace per six hours, not one per escalation per tick.
  for (const tenantId of unaddressable) {
    await pageOperator(
      { db },
      `deadman_unaddressable:${tenantId}`,
      "A workspace has a customer waiting and nobody to tell",
      `A conversation in workspace ${tenantId} was handed to a human more than two hours ago and is still open, ` +
        `and the workspace has no notification recipients on file — so its owner cannot be told, here or anywhere.\n\n` +
        `Set them in Settings › Notifications for that workspace. The warning is raised as soon as somebody is on file; ` +
        `nothing about this customer has been marked as handled.`,
    ).catch(() => {});
  }

  if (alerted.length) {
    const { error: markErr } = await db.rpc("deadman_mark_alerted", { p_ids: alerted });
    if (markErr) {
      // The warnings went out; failing to stamp means they may repeat next
      // tick. Noisy beats silent, but it must be visible.
      L.error("deadman_mark_failed", { count: alerted.length, error: markErr.message });
    }
  }

  L.info("deadman_swept", { candidates: candidates.length, flagged: alerted.length, ...asked });
  return json(200, { ok: true, candidates: candidates.length, flagged: alerted.length, ...asked });
}

/**
 * The deadman sweep: an escalation nobody picked up.
 *
 * An escalation opens, the owner gets one email, and if that email is missed
 * the conversation sits open indefinitely with nothing to raise its hand. A
 * customer waiting on a human is the one failure this product cannot be
 * relaxed about, and `deadman` has been a declared job kind, escalation reason
 * and UI label since Slice 2 with no emitter anywhere.
 *
 * Called by pg_cron via pg_net every 10 minutes (migration 00018). The
 * DETECTION is a SQL sweep, so it notices an abandoned conversation regardless
 * of which code path abandoned it, including paths written later. The ALERT is
 * here, because addressing a tenant correctly is real logic — one business's
 * customer must never be described in another business's inbox — and a second
 * copy of that rule in plpgsql is exactly the duplication this codebase keeps
 * paying for.
 *
 * Auth: a shared secret both ends read from Vault. Nothing is added to the
 * edge's environment, and the value exists in exactly one place.
 *
 * Idempotence lives on the ROW (escalations.deadman_alerted_at), not on this
 * request: a lost or duplicated call finds the same candidates next tick, and
 * an escalation is flagged at most once however long it stays open.
 */
import crypto from "node:crypto";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { notify } from "../../lib/notify.js";
import { loadTenantNotifications } from "../../lib/tenant-runtime.js";
import { logger, errField } from "../../lib/log.js";

export const config = { maxDuration: 60 };

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

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "deadman" });
  const db = pg();
  if (!db) {
    L.error("deadman_no_db");
    return json(503, { ok: false, error: "no_database" });
  }

  const presented = request.headers.get("x-cron-key") || "";
  const { data: expected, error: keyErr } = await db.rpc("get_cron_sweep_key");
  if (keyErr || !expected) {
    L.error("deadman_key_unavailable", { error: keyErr?.message });
    return json(503, { ok: false, error: "key_unavailable" });
  }
  if (!presented || !secretsMatch(presented, expected as unknown as string)) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const { data, error } = await db.rpc("deadman_candidates", { p_older_than: UNANSWERED_AFTER });
  if (error) {
    L.error("deadman_query_failed", { error: error.message });
    return json(500, { ok: false });
  }
  const candidates = (data ?? []) as unknown as Candidate[];
  if (candidates.length === 0) return json(200, { ok: true, flagged: 0 });

  // One addressing lookup per TENANT, not per escalation: a backlog is usually
  // one workspace having a bad morning.
  const addressing = new Map<string, Awaited<ReturnType<typeof loadTenantNotifications>>>();
  const alerted: string[] = [];

  for (const c of candidates) {
    try {
      if (!addressing.has(c.tenant_id)) {
        addressing.set(c.tenant_id, await loadTenantNotifications(db, c.tenant_id));
      }
      const waitedMin = Math.round((Date.now() - new Date(c.opened_at).getTime()) / 60000);
      const waited = waitedMin >= 120 ? `${Math.round(waitedMin / 60)} hours` : `${waitedMin} minutes`;

      const delivered = await notify(
        { tenantId: c.tenant_id, ...addressing.get(c.tenant_id)! },
        {
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
        },
      );

      // Only a DELIVERED warning earns the once-guard. If the alert failed, the
      // next tick tries again rather than marking the customer as handled.
      if (delivered) alerted.push(c.escalation_id);
      else L.warn("deadman_alert_undelivered", { tenant_id: c.tenant_id, escalation: c.escalation_id });
    } catch (e) {
      L.error("deadman_candidate_failed", { tenant_id: c.tenant_id, escalation: c.escalation_id, error: errField(e) });
    }
  }

  if (alerted.length) {
    const { error: markErr } = await db.rpc("deadman_mark_alerted", { p_ids: alerted });
    if (markErr) {
      // The warnings went out; failing to stamp means they may repeat next
      // tick. Noisy beats silent, but it must be visible.
      L.error("deadman_mark_failed", { count: alerted.length, error: markErr.message });
    }
  }

  L.info("deadman_swept", { candidates: candidates.length, flagged: alerted.length });
  return json(200, { ok: true, candidates: candidates.length, flagged: alerted.length });
}

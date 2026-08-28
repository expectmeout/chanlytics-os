/**
 * QStash fire callback (Blueprint P4/§4) — written ONCE: verify signature over
 * the raw body against the CANONICAL url -> claim_job (exactly-once gate) ->
 * dispatch by kind. Later slices only register kinds; this file never changes.
 */
import { Receiver } from "@upstash/qstash";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";
import { dispatchJob, FIRE_URL, type ClaimedJob } from "../../lib/workspace/jobs.js";
import { notify } from "../../lib/notify.js";
import { loadTenantNotifications } from "../../lib/tenant-runtime.js";

export const config = { maxDuration: 60 };

/**
 * A job failing concerns the tenant whose job it is, so the alert is addressed
 * from that tenant's runtime rather than from a hardcoded personal mailbox —
 * this file used to fall back to a literal name and address, which with a
 * second tenant would deliver one business's delivery failure, naming its
 * customer's number, to a different business's owner.
 */
function alertFor(db: ReturnType<typeof pg>, job: ClaimedJob) {
  return async (subject: string, body: string): Promise<void> => {
    const addressing = db
      ? await loadTenantNotifications(db, job.tenant_id)
      : { notifications: null, isEnvDefault: false };
    await notify(
      { tenantId: job.tenant_id, ...addressing },
      { subject, body, redactedBody: `A background job failed for a workspace (kind: ${job.kind}).` },
    );
  };
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!current || !next) {
    console.error("jobs_fire_missing_signing_keys");
    return json(401, { ok: false });
  }
  const receiver = new Receiver({ currentSigningKey: current, nextSigningKey: next });
  const signature = request.headers.get("upstash-signature") || "";
  const valid = await receiver
    .verify({ signature, body: raw, url: FIRE_URL })
    .catch(() => false);
  if (!valid) {
    console.error("jobs_fire_bad_signature");
    return json(401, { ok: false });
  }

  let jobId: string | null = null;
  try { jobId = (JSON.parse(raw) as { job_id?: string }).job_id ?? null; } catch { /* below */ }
  if (!jobId) return json(200, { ok: true, skipped: "no_job_id" });

  const db = pg();
  if (!db) return json(200, { ok: true, skipped: "pg_off" });

  const { data: claim, error } = await db.rpc("claim_job", { p_job_id: jobId } as never);
  if (error) {
    console.error("claim_job_failed", error.message);
    return json(500, { ok: false }); // QStash retries; claim is idempotent
  }
  const c = claim as unknown as { claimed: boolean; reason?: string } & ClaimedJob;
  if (!c.claimed) {
    console.log("job_skip", jobId, c.reason);
    return json(200, { ok: true, skipped: c.reason });
  }

  try {
    const job: ClaimedJob = {
      id: c.id,
      tenant_id: c.tenant_id,
      kind: c.kind,
      payload: (c.payload ?? {}) as Record<string, unknown>,
    };
    const outcome = await dispatchJob(
      {
        db,
        waCfg: { phoneId: process.env.WHATSAPP_PHONE_ID || "", accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "" },
        alert: alertFor(db, job),
      },
      job,
    );
    console.log("job_fired", JSON.stringify({ id: c.id, kind: c.kind, outcome }));
    if (outcome === "unknown_kind") {
      await db.rpc("fail_job", { p_job_id: jobId, p_error: "unknown_kind" } as never);
    }
    return json(200, { ok: true, outcome });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("job_handler_failed", c.kind, msg);
    await db.rpc("fail_job", { p_job_id: jobId, p_error: msg } as never);
    return json(200, { ok: true, outcome: "failed" }); // claimed: our ledger owns retry policy
  }
}

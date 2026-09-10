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
 * Called by pg_cron via pg_net at :13 and :43, same Vault secret as the two
 * sweeps it watches. The offset is deliberate: on the :00/:30 grid every tick
 * would land on a deadman tick and judge a request seconds old, which the
 * two-minute grace in sweep_health() exempts — a watchdog that can only ever
 * report healthy.
 */
import { json } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { notify } from "../../lib/notify.js";
import { logger } from "../../lib/log.js";
import { chooseSweepAlerts, describeSweepTrouble, type SweepHealthRow } from "../../lib/sweep-health.js";

export const config = { maxDuration: 60 };

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "health" });
  const db = pg();
  if (!db) {
    L.error("sweep_health_no_db");
    return json(503, { ok: false, error: "no_database" });
  }

  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;

  const { data, error } = await db.rpc("sweep_health");
  if (error) {
    L.error("sweep_health_query_failed", { error: error.message });
    return json(500, { ok: false, error: "query_failed" });
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
        body: `These were failing and are now answering normally:\n\n` +
              plan.recovered.map((s) => `  - ${s}`).join("\n") + `\n`,
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

  L.info("sweep_health_checked", {
    broken: plan.broken.length,
    alerted: delivered ? plan.alert.length : 0,
    recovered: plan.recovered.length,
  });

  // ALWAYS 200, even when a sweep is broken. This route's own response is
  // recorded in net._http_response and read by /api/diag, so answering non-2xx
  // to report someone else's failure would make the health check report itself
  // as broken and never recover.
  return json(200, { ok: true, healthy: plan.broken.length === 0, broken: plan.broken });
}
/**
 * The reach-out clock (Reach out, Part 3): every minute pg_cron asks it (00186 trigger_reach_out_sweep), and only when
 * there is work. It reads what became of the emails it wrote, frees a send a writer left mid-way, skips a closed
 * run's sends, plans again the ones left stale, and finishes the runs with nothing left open. It claims nothing yet:
 * the sender is PR 6's.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 */
import { json } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { reachOutClock } from "../../lib/reach-out/clock.js";

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const L = logger({ sweep: "reach_out" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  try {
    const out = await reachOutClock(db, new Date(), L);
    L.info("reach_out_swept", { ...out, took_ms: Date.now() - started });
    return json(200, { ok: true, ...out });
  } catch (e) {
    // A read or a write that failed: the tick's answer says so, and sweep_health reads it as the clock's.
    L.error("reach_out_sweep_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
}

/**
 * The partner clock (decision 0011, P3): once a day pg_cron asks it (00191 trigger_partners_sweep), and only when a
 * workspace a partner brought has paid and awaits its standing, or an earning's thirty days are up. The work is one
 * door, partner_earnings_sweep: it judges each such workspace once (the card of a workspace the partner owns, or a
 * Google listing an older workspace already has, is held for a person; anything else qualifies), makes what is due
 * payable on a qualified workspace for an active partner, and voids what a disqualified one still held.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 */
import { json } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";

interface Swept {
  judged: number;
  review: number;
  payable: number;
  void: number;
}

export async function POST(request: Request): Promise<Response> {
  const L = logger({ sweep: "partners" });
  const db = pg();
  if (!db) {
    L.error("partners_no_db");
    return json(503, { ok: false, error: "no_database" });
  }
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  const { data, error } = await db.rpc("partner_earnings_sweep", { p_now: new Date().toISOString() });
  if (error) {
    // The tick's answer says so, and sweep_health reads it as the clock's.
    L.error("partners_sweep_failed", { error: error.message });
    return json(500, { ok: false });
  }
  const out = (data ?? { judged: 0, review: 0, payable: 0, void: 0 }) as unknown as Swept;
  // A workspace held for review is a person's to look at: said at warn, so it is seen without a query.
  if (out.review > 0) L.warn("partners_review_waiting", { review: out.review });
  L.info("partners_swept", { ...out });
  return json(200, { ok: true, ...out });
}

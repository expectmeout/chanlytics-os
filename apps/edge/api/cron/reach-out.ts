/**
 * The reach-out clock (Reach out, Part 3): every minute pg_cron asks it (00186 trigger_reach_out_sweep), and only when
 * there is work. It reads what became of the emails it wrote, frees a send a writer left mid-way, skips a closed
 * run's sends, plans again the ones left stale, and finishes the runs with nothing left open (lib/reach-out/clock.ts).
 * Then it claims the sends that are due and writes their emails (lib/reach-out/sender.ts): each leaves through the
 * jobs tick and the one send door.
 *
 * The cold lane is complete only with its secrets (C13, sender.ts coldLane). Without one, nothing is claimed, and while
 * a send is due the clock answers 503 naming what is missing.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 */
import { json } from "../../lib/http.js";
import { authorizeCron } from "../../lib/cron-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { dueDomains } from "../../lib/packages/db.js";
import { reachOutClock } from "../../lib/reach-out/clock.js";
import { claimAndWrite, coldLane } from "../../lib/reach-out/sender.js";

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const L = logger({ sweep: "reach_out" });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const denied = await authorizeCron(request, db, L);
  if (denied) return denied;
  try {
    const now = new Date();
    const out = await reachOutClock(db, now, L, started);
    const cold = coldLane();
    if (!cold.ok) {
      // Nothing is claimed. A send due that cannot leave is said every tick, until the secrets are set.
      const due = (await dueDomains(db, now, 1)).length > 0;
      L.info("reach_out_swept", { ...out, lane_missing: cold.missing, due, took_ms: Date.now() - started });
      return due
        ? json(503, { ok: false, error: "cold_lane_unset", missing: cold.missing, ...out })
        : json(200, { ok: true, ...out, lane_missing: cold.missing });
    }
    // The claim's counts apart from the clock's: its skipped and the clock's are different sends. A clock that used
    // the tick's time leaves the claim to the next minute.
    const claim = out.yielded ? null : await claimAndWrite({ db, now, started, lane: cold.lane, log: L });
    L.info("reach_out_swept", { ...out, claim, took_ms: Date.now() - started });
    return json(200, { ok: true, ...out, claim });
  } catch (e) {
    // A read or a write that failed: the tick's answer says so, and sweep_health reads it as the clock's.
    L.error("reach_out_sweep_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
}

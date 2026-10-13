/**
 * The reach-out check's clock (Reach out, Part 4; R1): every minute pg_cron asks it (00197
 * trigger_reach_out_check_sweep), and only when a send waits to be checked or a check_unavailable hold is an hour old.
 * Its own clock, apart from the reach-out clock that claims and sends (api/cron/reach-out.ts), so a slow model never
 * takes the claim's minute: each call has its own deadline, and no call starts past the tick's budget. The work is
 * lib/reach-out/check.ts; the claim takes a send only once it is checked (00197).
 *
 * The route is api/cron/reach-out-check.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and
 * checks the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * It does nothing it could not finish, and says so:
 *   - no ANTHROPIC_API_KEY: nothing is touched; while a send waits to be checked it answers 503 `check_unset`, so the
 *     clock is red and pages (R4);
 *   - no lane (sender.ts mailboxLane): nothing checked could leave, so nothing is checked; while a send waits it
 *     answers 503 `lane_unset` naming what is missing, as the reach-out clock does (R2);
 *   - a tick in which every model call failed answers 503 `model_unavailable` (R4). sweep_health judges the status.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 */
import { json } from "../http.js";
import { env } from "../env.js";
import { uncheckedWaiting } from "../packages/db.js";
import { checkSends } from "./check.js";
import { mailboxLane } from "./sender.js";
import type { SweepTick } from "../ops/sweep-door.js";

export async function sweepReachOutChecks({ db, L, started }: SweepTick): Promise<Response> {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      const waiting = await uncheckedWaiting(db);
      L.warn("reach_out_check_unset", { waiting });
      return waiting ? json(503, { ok: false, error: "check_unset" }) : json(200, { ok: true, unset: true });
    }
    const lane = mailboxLane();
    if (!lane.ok) {
      const waiting = await uncheckedWaiting(db);
      L.info("reach_out_check_lane_unset", { lane_missing: lane.missing, waiting });
      return waiting
        ? json(503, { ok: false, error: "lane_unset", missing: lane.missing })
        : json(200, { ok: true, lane_missing: lane.missing });
    }
    const out = await checkSends({ db, now: new Date(), started, log: L });
    const took_ms = Date.now() - started;
    if (out.calls > 0 && out.calls_failed === out.calls) {
      L.error("reach_out_check_unanswered", { ...out, took_ms });
      return json(503, { ok: false, error: "model_unavailable", ...out });
    }
    if (out.read > 0 || out.released > 0) L.info("reach_out_checked", { ...out, took_ms });
    return json(200, { ok: true, ...out });
  } catch (e) {
    // A read or a write that failed: the tick's answer says so, and sweep_health reads it as the clock's.
    L.error("reach_out_check_sweep_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
}

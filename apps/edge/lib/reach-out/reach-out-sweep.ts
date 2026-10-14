/**
 * The reach-out clock (Reach out, Part 3): every minute pg_cron asks it (00186 trigger_reach_out_sweep), and only when
 * there is work. It reads what became of the emails it wrote, frees a send a writer left mid-way, skips a closed
 * run's sends, plans again the ones left stale, and finishes the runs with nothing left open (lib/reach-out/clock.ts).
 * Then it claims the sends that are due and writes their emails (lib/reach-out/sender.ts): each leaves through the
 * jobs tick and the one send door.
 *
 * The route is api/cron/reach-out.ts: sweepDoor (lib/ops/sweep-door.ts) names the request, finds the database and
 * checks the sweep key, then hands this its tick, so nothing below runs for a knock without the key.
 *
 * The lane is complete only with the unsubscribe's seal (C13, sender.ts mailboxLane): every email leaves from the
 * mailbox its business connected (decision 0056), and carries its one-click way out. Without it no mailbox's send is
 * claimed, and while one is due the clock answers 503 naming what is missing. A reach-out its owner sends needs no seal
 * (00428): its drafts are claimed and handed over either way.
 *
 * Auth: x-cron-key against the Vault-held sweep key, like the other sweeps.
 */
import { json } from "../http.js";
import { dueMailboxes } from "../packages/db.js";
import { reachOutClock } from "./clock.js";
import { claimAndWrite, mailboxLane } from "./sender.js";
import type { SweepTick } from "../ops/sweep-door.js";

export async function sweepReachOut({ db, L, started }: SweepTick): Promise<Response> {
  try {
    const now = new Date();
    const out = await reachOutClock(db, now, L, started);
    const lane = mailboxLane();
    if (!lane.ok) {
      // No mailbox's send is claimed; drafts are (their owner sends them). A mailbox's send due that cannot leave is
      // said every tick, until the secret is set.
      const claim = out.yielded ? null : await claimAndWrite({ db, now, started, lane: null, log: L });
      const due = (await dueMailboxes(db, now, 1)).length > 0;
      L.info("reach_out_swept", { ...out, claim, lane_missing: lane.missing, due, took_ms: Date.now() - started });
      return due
        ? json(503, { ok: false, error: "lane_unset", missing: lane.missing, ...out, claim })
        : json(200, { ok: true, ...out, claim, lane_missing: lane.missing });
    }
    // The claim's counts apart from the clock's: its skipped and the clock's are different sends. A clock that used
    // the tick's time leaves the claim to the next minute.
    const claim = out.yielded ? null : await claimAndWrite({ db, now, started, lane: lane.lane, log: L });
    L.info("reach_out_swept", { ...out, claim, took_ms: Date.now() - started });
    return json(200, { ok: true, ...out, claim });
  } catch (e) {
    // A read or a write that failed: the tick's answer says so, and sweep_health reads it as the clock's.
    L.error("reach_out_sweep_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(500, { ok: false });
  }
}

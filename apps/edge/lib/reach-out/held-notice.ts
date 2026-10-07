/**
 * The notice a hold sends (Reach out, Part 4 PR 7, R20): a live reach-out run -- one approved, or scheduled under veto
 * -- holding sends its owner was not told of is told once, through the notification door (ops/notify.ts notifyOnce),
 * with the run's own link, so the held email is never out of reach. A run waiting on its owner was announced when it
 * was planned (run-context.ts notifyWaiting), and its sheet lists the held already.
 *
 * Once, and durable, with no migration: the mark is the run's own (`audience.held_notice`, packages/db
 * heldNoticeDue / markHeldNotice). Each tick reads the runs due -- holds, and no mark or a claim gone stale -- so a
 * notice that failed is asked again, never forgotten with a tick's memory. A run is claimed onto the row as it was read
 * (its updated_at), so of two ticks that read it one tells and the other finds it moved. The mark says sent only once
 * the owner was told (the bell's row kept, and the mail gone where it can go); a notice that failed keeps its claim,
 * which goes stale in CLAIM_STALE_MS and is asked again then, and is the tick's error, never the check's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { heldNoticeWords, isReachOutHold, type ReachOutHold } from "../packages/contracts.js";
import { heldNoticeDue, markHeldNotice, type Database } from "../packages/db.js";
import { notifyOnce, type NotifyMessage } from "../ops/notify.js";
import { loadTenantNotifications } from "../tenant-runtime.js";
import type { LogEvent } from "../log.js";

type Db = SupabaseClient<Database>;

/** A claim that never went is asked again after this: a tick that stopped half way, or a mail that failed. */
const CLAIM_STALE_MS = 10 * 60_000;
/** Holds older than this are not news: a hold is given up past fourteen days (R10). */
const HELD_SINCE_MS = 14 * 86_400_000;
/** The held sends one tick reads to find its runs. */
const HELD_READ = 1000;

/** Tells a workspace's owner, once: true only when they were told. The tests give their own mail and database. */
export type HeldNoticeSend = (db: Db, tenantId: string, msg: NotifyMessage) => Promise<boolean>;

const sendHeldNotice: HeldNoticeSend = async (db, tenantId, msg) => {
  const target = await loadTenantNotifications(db, tenantId);
  return notifyOnce({ tenantId, notifications: target.notifications, isEnvDefault: target.isEnvDefault }, msg, { db });
};

/**
 * Each live reach-out run due a notice, told once. Returns how many were told; one that could not be is handed to
 * `error` as "reach_out_check_error" with the run, and asked again when its claim goes stale.
 */
export async function noticeHeldRuns(p: {
  db: Db;
  now: Date;
  error: (event: LogEvent, fields: Record<string, unknown>, e: unknown) => void;
  tenantId?: string;
  send?: HeldNoticeSend;
}): Promise<number> {
  const { db, now } = p;
  const send = p.send ?? sendHeldNotice;
  const at = now.toISOString();
  let due;
  try {
    due = await heldNoticeDue(db, {
      since: new Date(now.getTime() - HELD_SINCE_MS).toISOString(),
      staleBefore: new Date(now.getTime() - CLAIM_STALE_MS).toISOString(),
      tenantId: p.tenantId,
      limit: HELD_READ,
    });
  } catch (e) {
    p.error("reach_out_check_error", { stage: "held_notice" }, e);
    return 0;
  }
  let told = 0;
  for (const run of due) {
    const where = { tenantId: run.tenant_id, id: run.id, audience: run.audience };
    try {
      if (!(await markHeldNotice(db, { ...where, mark: { claimed_at: at }, ifUpdatedAt: run.updated_at }))) continue;
      const reasons = run.reasons.filter((r): r is ReachOutHold => isReachOutHold(r));
      const words = heldNoticeWords({ name: run.name, held: run.held, reasons });
      const msg: NotifyMessage = {
        kind: "playbook",
        route: `broadcasts/run:${run.id}`,
        about: { type: "broadcast", id: run.id },
        subject: words.subject,
        body: words.body,
      };
      if (!(await send(db, run.tenant_id, msg))) throw new Error("the notice did not reach its owner");
      await markHeldNotice(db, { ...where, mark: { claimed_at: at, sent_at: new Date().toISOString() } });
      told += 1;
    } catch (e) {
      p.error("reach_out_check_error", { broadcast_id: run.id, tenant_id: run.tenant_id, stage: "held_notice" }, e);
    }
  }
  return told;
}

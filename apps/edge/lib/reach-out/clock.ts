/**
 * The reach-out clock's steps (Reach out, Part 3), each over the database and each safe to run again: a move is made
 * only from the state a send was read in, so two ticks never move one send twice. Each step's work is chosen and
 * bounded in the database (00186), so no list of ids and no page cut short decides what is done.
 *
 *   reconcile   each queued send reads its email once (E3): an email that left is a sent send, and its lead is written
 *               to (nurture, contacted, emailed); one whose outcome is unknown waits for its receipt, a day at most,
 *               then fails `outcome_unknown` (no nudge follows an email that may never have arrived, and none goes
 *               twice); one that never left (the provider's limit, a job that died before it, no job at all) and one
 *               the door sent back with a wait (contracts OUTREACH_WAIT_REFUSALS) is planned again, never lost (C5);
 *               one the provider refused, or that may have left, fails; any other refusal is the door's word for why
 *               this lead is not written to, and skips it; a row gone (an erasure) skips it.
 *   unstick     a send claimed and never queued: its email written (adopted, queued) or never written (planned
 *               again), so a writer that died mid-send neither loses it nor spends its domain's day for good.
 *   close       a canceled or failed run's open sends are skipped, `run_canceled`; an email still queued is withdrawn
 *               first, so its job sends nothing.
 *   finish      a run that goes ahead with no send left open is sent, and says when it finished.
 *   restale     a planned send long past its time in a run that goes ahead (approved late, its chain resumed, its
 *               domain's day full or its domain removed) is planned again from now.
 *   give up     a send the check held (Part 4) that its owner never answered is skipped, kept_waiting, fourteen days
 *               from when it was planned: the one clock every send gives up by (replan.ts REPLAN_GIVE_UP_MS, R10).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  closedRunSends,
  finishableRuns,
  heldStale,
  leadWritten,
  moveSend,
  queuedOutcomes,
  staleSends,
  stuckClaims,
  withdrawEmail,
  writtenEmails,
  type Database,
  type ReachOutSendRow,
} from "../packages/db.js";
import { sendMessageId } from "../packages/core.js";
import { isWaitRefusal } from "../packages/contracts.js";
import { REPLAN_GIVE_UP_MS, replanSends, type Replan, type ReplanCounts } from "./replan.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** A planned send this late in a run that goes ahead was left, not merely due: it is planned again. */
export const STALE_AFTER_MS = 15 * 60_000;
/** A claim this old never became an email: its writer died mid-send. */
export const CLAIM_STUCK_AFTER_MS = 10 * 60_000;
/** How long an email of unknown outcome waits for its receipt before its send is failed. */
export const UNKNOWN_OUTCOME_MS = 24 * 3_600_000;
/** When the clock stops for the tick: its door has 60 s (vercel.json), and what is left is the next minute's. */
export const CLOCK_YIELD_AT_MS = 40_000;
const PAGE = 500;
const STUCK_PAGE = 100;

export interface ClockCounts extends ReplanCounts {
  reconciled: number;
  sent: number;
  failed: number;
  skipped: number;
  adopted: number;
  closed: number;
  withdrawn: number;
  finished: number;
  yielded: boolean;
}

/**
 * An email that never left, so another try costs its domain nothing and cannot send twice: the provider's limit (a
 * 429 is a refusal before the send), a job that died knowing it had not sent (settle's never_delivered), and a row
 * whose job was gone (the unfinished sweep's orphaned). A 5xx, a network error or a timeout may have left, and fails.
 */
function neverLeft(error: { reason?: string; http_status?: number } | null): boolean {
  if (!error) return false;
  return error.http_status === 429 || error.reason === "never_delivered" || error.reason === "orphaned";
}

const move = (db: Db, s: ReachOutSendRow, patch: Partial<ReachOutSendRow>): Promise<boolean> =>
  moveSend(db, { tenantId: s.tenant_id, id: s.id, from: s.state, patch });

export async function reachOutClock(
  db: Db,
  now: Date,
  log: Logger,
  started: number = Date.now(),
  /** One workspace to keep to; every workspace when absent, as the clock runs. A test proves it on its own. */
  tenantId?: string,
): Promise<ClockCounts> {
  const out: ClockCounts = {
    reconciled: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    adopted: 0,
    closed: 0,
    withdrawn: 0,
    finished: 0,
    replanned: 0,
    waiting: 0,
    gave_up: 0,
    yielded: false,
  };
  const late = () => {
    if (Date.now() - started < CLOCK_YIELD_AT_MS) return false;
    out.yielded = true;
    return true;
  };
  const again: Replan[] = [];

  /* reconcile */
  for (const q of await queuedOutcomes(db, PAGE, tenantId)) {
    const s = q.send;
    const error = (q.error ?? null) as {
      reason?: string;
      provider?: string;
      outcome?: string;
      http_status?: number;
    } | null;
    if (q.status === "sent" || q.status === "delivered" || q.status === "read") {
      const at = q.sent_at ?? q.written_at ?? now.toISOString();
      if (await move(db, s, { state: "sent", sent_at: at })) {
        out.sent += 1;
        // The send is sent whatever the lead's bookkeeping does: a lead that could not be written is said, not undone.
        await leadWritten(db, { tenantId: s.tenant_id, leadId: s.lead_id, at, sendId: s.id }).catch((e: unknown) =>
          log.error("reach_out_lead_unwritten", {
            send_id: s.id,
            lead_id: s.lead_id,
            error: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    } else if (q.status === "failed" && error?.outcome === "unknown") {
      // Its receipt settles it (00177's guard lets exactly this row move on). A day with none: it may have gone.
      if (!q.written_at || now.getTime() - Date.parse(q.written_at) < UNKNOWN_OUTCOME_MS) continue;
      if (await move(db, s, { state: "failed", reason: "outcome_unknown" })) out.failed += 1;
    } else if (q.status === "failed" && neverLeft(error)) {
      again.push({ send: s, wrote: true });
      continue; // counted where it is planned again
    } else if (q.status === "failed") {
      const reason = error?.provider === "bounced" ? "bounced" : "send_failed";
      if (await move(db, s, { state: "failed", reason })) out.failed += 1;
    } else if (q.status === "canceled") {
      const reason = String(error?.reason ?? "canceled").slice(0, 60);
      if (isWaitRefusal(reason)) {
        again.push({ send: s, wrote: true });
        continue;
      }
      if (await move(db, s, { state: "skipped", reason })) out.skipped += 1;
    } else if (q.status === null) {
      // Its email row is gone: an erasure deletes the person's messages (erase_contact), and the send never goes.
      if (await move(db, s, { state: "skipped", reason: "erased", message_id: null })) out.skipped += 1;
    } else continue; // still queued: its job has not run yet
    out.reconciled += 1;
  }

  /* unstick */
  if (!late()) {
    const stuck = await stuckClaims(db, new Date(now.getTime() - CLAIM_STUCK_AFTER_MS), STUCK_PAGE, tenantId);
    const expected = new Map<string, string>();
    for (const s of stuck) expected.set(s.id, await sendMessageId(s.id, s.attempts ?? 0));
    const written = await writtenEmails(db, [...expected.values()]);
    for (const s of stuck) {
      const id = expected.get(s.id)!;
      // Written and not queued: the writer died between its email and its move. The email is the send's; it goes on.
      if (written.has(id)) {
        if (await move(db, s, { state: "queued", message_id: id })) out.adopted += 1;
      } else again.push({ send: s, wrote: false });
    }
  }

  /* close */
  if (!late())
    for (const { send: s, email_status } of await closedRunSends(
      db,
      new Date(now.getTime() - CLAIM_STUCK_AFTER_MS),
      PAGE,
      tenantId,
    )) {
      if (s.state === "queued") {
        // Its email withdrawn while still queued; the next tick's reconcile reads it canceled, run_canceled, and skips
        // the send. One its job already took is its job's: reconcile reads what became of it.
        if (s.message_id && email_status === "queued") {
          if (await withdrawEmail(db, { tenantId: s.tenant_id, id: s.message_id, reason: "run_canceled" }))
            out.withdrawn += 1;
        }
        continue;
      }
      // A claim its writer is done with may have written its email: withdrawn too, then the send skipped.
      if (s.state === "claimed") {
        const id = await sendMessageId(s.id, s.attempts ?? 0);
        await withdrawEmail(db, { tenantId: s.tenant_id, id, reason: "run_canceled" });
      }
      if (await move(db, s, { state: "skipped", reason: "run_canceled" })) out.closed += 1;
    }

  /* finish */
  if (!late())
    for (const id of await finishableRuns(db, PAGE, tenantId)) {
      // Through the runs' own moves (broadcasts_guard): a scheduled run starts, then finishes.
      const { error: e1 } = await db
        .from("broadcasts")
        .update({ state: "sending" })
        .eq("id", id)
        .eq("state", "scheduled");
      if (e1) throw new Error(`cannot start the run ${id}: ${e1.message}`);
      const { data, error } = await db
        .from("broadcasts")
        .update({ state: "sent", finished_at: now.toISOString() })
        .eq("id", id)
        .eq("state", "sending")
        .select("id");
      if (error) throw new Error(`cannot finish the run ${id}: ${error.message}`);
      if ((data ?? []).length > 0) out.finished += 1;
    }

  /* restale */
  if (!late())
    for (const s of await staleSends(db, new Date(now.getTime() - STALE_AFTER_MS), PAGE, tenantId))
      again.push({ send: s, wrote: false });
  if (again.length > 0) {
    const replanned = await replanSends(db, again, now, log);
    out.replanned += replanned.replanned;
    out.waiting += replanned.waiting;
    out.gave_up += replanned.gave_up;
  }

  /* give up what waits unanswered: held, and its owner never answered in the fortnight a send has (F3, R10) */
  if (!late())
    for (const s of await heldStale(db, new Date(now.getTime() - REPLAN_GIVE_UP_MS), PAGE, tenantId))
      if (await move(db, s, { state: "skipped", reason: "kept_waiting" })) out.gave_up += 1;
  return out;
}

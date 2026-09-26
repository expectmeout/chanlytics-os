/**
 * The reach-out clock's steps (Reach out, Part 3), each over the database and each safe to run again: a move is made
 * only from the state a send was read in, so two ticks never move one send twice.
 *
 *   reconcile   each queued send reads its email row and moves once (E3): an email that left is a sent send, and its
 *               lead is written to (nurture, contacted, emailed); one of unknown outcome waits for its receipt; one
 *               that failed is failed; one the door sent back with a wait (the domain's day full, the domain not
 *               ready, or gone: contracts OUTREACH_WAIT_REFUSALS) is planned again, never lost (C5); any other refusal
 *               is the door's word for why this lead is not written to, and skips it; a row gone (an erasure) skips it.
 *   unstick     a send claimed and never queued: its email row written (adopted, queued) or never written (planned
 *               again), so a writer that died mid-send neither loses it nor spends its domain's day for good.
 *   close       the open sends of a run canceled or failed are skipped, `run_canceled`.
 *   restale     a planned send whose time passed long ago in a run that goes ahead (approved late, its chain resumed,
 *               its domain's day full or its domain removed) is planned again from now.
 *   finish      a run that goes ahead with no send left open is sent, and says when it finished.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  leadWritten,
  messagesById,
  moveSend,
  plannedDue,
  reachOutRunsIn,
  runsById,
  sendsIn,
  sendsOfRuns,
  type Database,
  type ReachOutSendRow,
} from "../packages/db.js";
import { sendMessageId } from "../packages/core.js";
import { isWaitRefusal } from "../packages/contracts.js";
import { replanSends, type Replan, type ReplanCounts } from "./replan.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** A planned send this late in a run that goes ahead was left, not merely due: it is planned again. */
export const STALE_AFTER_MS = 15 * 60_000;
/** A claim this old never became an email: its writer died mid-send. */
export const CLAIM_STUCK_AFTER_MS = 10 * 60_000;
/** A closed run's sends are skipped within minutes; a week back is every run that could still hold one. */
const CLOSED_SINCE_MS = 7 * 86_400_000;
const PAGE = 500;

export interface ClockCounts extends ReplanCounts {
  reconciled: number;
  sent: number;
  failed: number;
  skipped: number;
  adopted: number;
  closed: number;
  finished: number;
}

/** The door's refusals that are a wait: its domain's day or state, and a domain the workspace no longer owns. */
const isWait = (reason: string): boolean => isWaitRefusal(reason) || reason === "outreach_needs_own_domain";

const move = (db: Db, s: ReachOutSendRow, patch: Partial<ReachOutSendRow>): Promise<boolean> =>
  moveSend(db, { tenantId: s.tenant_id, id: s.id, from: s.state, patch });

export async function reachOutClock(db: Db, now: Date, log: Logger): Promise<ClockCounts> {
  const out: ClockCounts = {
    reconciled: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    adopted: 0,
    closed: 0,
    finished: 0,
    replanned: 0,
    waiting: 0,
    gave_up: 0,
  };
  const again: Replan[] = [];

  /* reconcile */
  const queued = await sendsIn(db, "queued", PAGE);
  const emails = await messagesById(
    db,
    queued.map((s) => s.message_id).filter((id): id is string => !!id),
  );
  for (const s of queued) {
    const m = s.message_id ? (emails.get(s.message_id) ?? null) : null;
    const error = (m?.error ?? null) as { reason?: string; provider?: string; outcome?: string } | null;
    if (m && (m.status === "sent" || m.status === "delivered" || m.status === "read")) {
      const stamped = (m.meta as { status_at?: { sent?: string } } | null)?.status_at?.sent;
      const at = stamped ?? m.created_at;
      if (await move(db, s, { state: "sent", sent_at: at })) {
        await leadWritten(db, { tenantId: s.tenant_id, leadId: s.lead_id, at, sendId: s.id });
        out.sent += 1;
      }
    } else if (m && m.status === "failed" && error?.outcome === "unknown") {
      continue; // its receipt settles it (00177's guard lets exactly this row move on); the next tick reads it
    } else if (m && m.status === "failed") {
      const reason = error?.provider === "bounced" ? "bounced" : "send_failed";
      if (await move(db, s, { state: "failed", reason })) out.failed += 1;
    } else if (m && m.status === "canceled") {
      const reason = String(error?.reason ?? "canceled").slice(0, 60);
      if (isWait(reason)) {
        again.push({ send: s, wrote: true });
        continue; // counted when it is planned again
      }
      if (await move(db, s, { state: "skipped", reason })) out.skipped += 1;
    } else if (!m) {
      // Its email row is gone: an erasure deletes the person's messages (erase_contact), and the send never goes.
      if (await move(db, s, { state: "skipped", reason: "erased", message_id: null })) out.skipped += 1;
    } else continue; // still queued: its job has not run yet
    out.reconciled += 1;
  }

  /* unstick */
  const stuck = (await sendsIn(db, "claimed", PAGE)).filter(
    (s) => !s.claimed_at || now.getTime() - Date.parse(s.claimed_at) > CLAIM_STUCK_AFTER_MS,
  );
  const expected = new Map<string, string>();
  for (const s of stuck) expected.set(s.id, await sendMessageId(s.id, s.attempts ?? 0));
  const written = await messagesById(db, [...expected.values()]);
  for (const s of stuck) {
    const id = expected.get(s.id)!;
    // Written and not queued: the writer died between its email and its move. The email is the send's; it goes on.
    if (written.has(id)) {
      if (await move(db, s, { state: "queued", message_id: id })) out.adopted += 1;
    } else again.push({ send: s, wrote: false });
  }

  /* close */
  const closedRuns = await reachOutRunsIn(db, ["canceled", "failed"], new Date(now.getTime() - CLOSED_SINCE_MS));
  for (const s of await sendsOfRuns(
    db,
    closedRuns.map((r) => r.id),
    ["planned", "claimed"],
  ))
    if (await move(db, s, { state: "skipped", reason: "run_canceled" })) out.closed += 1;

  /* restale */
  const stale = await plannedDue(db, new Date(now.getTime() - STALE_AFTER_MS), PAGE);
  const runs = await runsById(
    db,
    stale.map((s) => s.broadcast_id),
  );
  const chainIds = [...new Set(stale.flatMap((s) => [s.playbook_id, s.root_id]).filter((id): id is string => !!id))];
  const running = new Set<string>();
  if (chainIds.length > 0) {
    const { data, error } = await db.from("playbooks").select("id").in("id", chainIds).eq("state", "running");
    if (error) throw new Error(`cannot read the chains' states: ${error.message}`);
    for (const p of data ?? []) running.add(p.id);
  }
  for (const s of stale) {
    const run = runs.get(s.broadcast_id);
    // Only a run that goes ahead, on a running chain: one waiting for its owner, or paused, keeps its sends.
    if (!run || (run.state !== "scheduled" && run.state !== "sending")) continue;
    if (!s.playbook_id || !running.has(s.playbook_id) || !running.has(s.root_id)) continue;
    again.push({ send: s, wrote: false });
  }
  const replanned = await replanSends(db, again, now, log);
  out.replanned += replanned.replanned;
  out.waiting += replanned.waiting;
  out.gave_up += replanned.gave_up;

  /* finish */
  const open = await reachOutRunsIn(db, ["scheduled", "sending"]);
  const busy = new Set(
    (
      await sendsOfRuns(
        db,
        open.map((r) => r.id),
      )
    ).map((s) => s.broadcast_id),
  );
  for (const r of open) {
    if (busy.has(r.id)) continue;
    // Through the runs' own moves (broadcasts_guard): a scheduled run starts, then finishes.
    if (r.state === "scheduled") {
      const { error } = await db
        .from("broadcasts")
        .update({ state: "sending" })
        .eq("id", r.id)
        .eq("state", "scheduled");
      if (error) throw new Error(`cannot start the run ${r.id}: ${error.message}`);
    }
    const { data, error } = await db
      .from("broadcasts")
      .update({ state: "sent", finished_at: now.toISOString() })
      .eq("id", r.id)
      .eq("state", "sending")
      .select("id");
    if (error) throw new Error(`cannot finish the run ${r.id}: ${error.message}`);
    if ((data ?? []).length > 0) out.finished += 1;
  }
  return out;
}

/**
 * Runs nothing is sending: a broadcast still `scheduled` past its time, with no send job on the ledger to start it.
 *
 * A run and its job are written whole when a run is made (00282 assemble_broadcast). An approval writes them in two
 * steps: the row moves to `scheduled`, then its job is written, and when the job cannot be written the row is put back
 * to wait (core approveRun). When that put-back fails too, the row says "scheduled" for ever and nothing will send it:
 * the ledger settles a run whose JOB died (jobs settle.ts), and this run never had one. The edge's watchdog asks for
 * these (ops/stranded-runs.ts), marks each not sent and tells its owner.
 *
 * A reach-out's run is not one: approved, it is released with no broadcast job on purpose, and the reach-out clock claims
 * its planned sends (core approveReachOut).
 *
 * And runs nothing will ever send: a playbook's run still waiting for approval after the day it was made for, which the
 * approve verb refuses (contracts runApprovalRefusal) and only a skip can end. The edge's playbooks sweep reads them here
 * (waitingPlaybookRuns), ends each that is too late (cancelBroadcastFrom) and records the system's decision
 * (recordSystemDecision), so a missed day's run waits on nobody (the wiring's second audit, S7-3).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TIMEZONE, RUN_GOING_STATES, isReachOutRun } from "@chanlytics/contracts";
import type { Database, Json } from "../../database.types";
import { emitEvent } from "../../events";
import { runWaitingCounts } from "../reach-out-sheet";

type Db = SupabaseClient<Database>;

/** A run found with nothing to send it: whose it is, and what its owner is told about it. */
export interface StrandedRun {
  id: string;
  tenant_id: string;
  name: string;
  playbook_id: string | null;
  audience: unknown;
  scheduled_for: string;
}

/**
 * The runs still `scheduled` whose time fell between `since` and `before`, and that no broadcast_send job is scheduled
 * for or working on, oldest first, at most `limit`. Reads every workspace (the service role's client). A read that fails
 * THROWS: "could not look" is not "none".
 */
export async function strandedRuns(db: Db, p: { since: Date; before: Date; limit: number }): Promise<StrandedRun[]> {
  const { data, error } = await db
    .from("sequence_batches")
    .select("id, tenant_id, name, playbook_id:step_id, audience, scheduled_for")
    .eq("state", "scheduled")
    .gt("scheduled_for", p.since.toISOString())
    .lt("scheduled_for", p.before.toISOString())
    // A reach-out's run waits `scheduled` with no broadcast job until its clock writes its first email: left out here,
    // before the limit, or a page of them would hide every run this is for. NULL is not "not reach_out" to a `neq`.
    .or("audience->>kind.is.null,audience->>kind.neq.reach_out")
    .order("scheduled_for", { ascending: true })
    .limit(p.limit);
  if (error) throw new Error(`stranded runs: cannot read the scheduled runs: ${error.message}`);
  // The test in the query is the test here too (contracts isReachOutRun): a row the filter could not see is not let through.
  const runs = (data ?? []).filter((r) => !isReachOutRun(r.audience));
  if (!runs.length) return [];
  const jobs = await db
    .from("jobs")
    .select("payload")
    .eq("kind", "broadcast_send")
    .in("state", ["scheduled", "fired"])
    .in(
      "payload->>broadcast_id",
      runs.map((r) => r.id),
    );
  if (jobs.error) throw new Error(`stranded runs: cannot read their jobs: ${jobs.error.message}`);
  const live = new Set(
    (jobs.data ?? []).map((j) => {
      const id = (j.payload as { broadcast_id?: unknown } | null)?.broadcast_id;
      return typeof id === "string" ? id : "";
    }),
  );
  return runs.filter((r) => !live.has(r.id));
}

/**
 * A stranded run marked not sent: `failed` with `run_interrupted`, the failure a run gets when nothing will carry it on
 * (jobs settle.ts failBroadcast), so its page says so in those words. Only while it is still `scheduled`: a run that a
 * late job started, or its owner stopped, is left as it is. True iff this call moved it. Throws when it cannot be written.
 */
export async function failStrandedRun(db: Db, p: { tenantId: string; id: string }): Promise<boolean> {
  const { data, error } = await db
    .from("sequence_batches")
    .update({ state: "failed", failure: "run_interrupted", finished_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("tenant_id", p.tenantId)
    .eq("state", "scheduled")
    .select("id");
  if (error) throw new Error(`stranded runs: cannot mark run ${p.id} not sent: ${error.message}`);
  if (!(data ?? []).length) return false;
  // On the ledger as every stopped run is (broadcast.stopped), best effort. Nobody got it: it never left `scheduled`.
  await emitEvent(db, p.tenantId, "broadcast.stopped", "broadcast", p.id, { failure: "run_interrupted", sent: 0 });
  return true;
}

/** A playbook's run waiting for approval, with the zone its day is told in: what the sweep asks of its day. */
export interface WaitingPlaybookRun {
  id: string;
  tenant_id: string;
  name: string;
  state: string;
  playbook_id: string;
  run_for: string;
  audience: unknown;
  /** How many it was for: what the owner is told it did not reach, once the sweep skips it (decision 0064). */
  recipient_count: number;
  /** The workspace's zone, or the one the approve verb reads for a workspace with none (DEFAULT_TIMEZONE). */
  timezone: string;
}

/**
 * The playbooks' runs still waiting for approval, oldest day first, at most `limit`, across every workspace (the service
 * role's client), each with its workspace's zone. A reach-out's run is approved on any later day (decision D6), so it is
 * left out before the limit, as strandedRuns leaves it out. A read that fails THROWS: "could not look" is not "none".
 */
export async function waitingPlaybookRuns(db: Db, p: { limit: number }): Promise<WaitingPlaybookRun[]> {
  const { data, error } = await db
    .from("sequence_batches")
    .select("id, tenant_id, name, state, playbook_id:step_id, run_for, audience, recipient_count")
    .eq("state", "pending_approval")
    .not("step_id", "is", null)
    .not("run_for", "is", null)
    .or("audience->>kind.is.null,audience->>kind.neq.reach_out")
    .order("run_for", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(p.limit);
  if (error) throw new Error(`waiting runs: cannot read the runs waiting for approval: ${error.message}`);
  const runs = (data ?? []).filter((r) => !isReachOutRun(r.audience));
  if (!runs.length) return [];
  const zones = await db
    .from("tenants")
    .select("id, timezone")
    .in("id", [...new Set(runs.map((r) => r.tenant_id))]);
  if (zones.error) throw new Error(`waiting runs: cannot read their workspaces' zones: ${zones.error.message}`);
  const zoneOf = new Map((zones.data ?? []).map((t) => [t.id, t.timezone]));
  return runs.flatMap((r) =>
    r.playbook_id && r.run_for
      ? [
          {
            id: r.id,
            tenant_id: r.tenant_id,
            name: r.name,
            state: r.state,
            playbook_id: r.playbook_id,
            run_for: r.run_for,
            audience: r.audience,
            recipient_count: r.recipient_count ?? 0,
            timezone: zoneOf.get(r.tenant_id) || DEFAULT_TIMEZONE,
          },
        ]
      : [],
  );
}

/**
 * A run moved to `canceled`, only while it is still in `from`: true iff this call moved it (a run approved or skipped
 * since it was read is left as it is). The cancel verb's port for a run nobody's session asks for. Throws when it
 * cannot be written.
 */
export async function cancelBroadcastFrom(db: Db, p: { tenantId: string; id: string; from: string }): Promise<boolean> {
  const { data, error } = await db
    .from("sequence_batches")
    .update({ state: "canceled" })
    .eq("id", p.id)
    .eq("tenant_id", p.tenantId)
    .eq("state", p.from)
    .select("id");
  if (error) throw new Error(`waiting runs: cannot end run ${p.id}: ${error.message}`);
  return (data ?? []).length > 0;
}

/** A decision the system made, with nobody's hand on it (actor_type `system`): its id. Throws when it cannot be written. */
export async function recordSystemDecision(
  db: Db,
  p: { tenantId: string; subjectType: string; subjectId: string; verb: string; payload: Json },
): Promise<string> {
  const { data, error } = await db
    .from("decisions")
    .insert({
      tenant_id: p.tenantId,
      subject_type: p.subjectType,
      subject_id: p.subjectId,
      verb: p.verb,
      actor_type: "system",
      actor_user_id: null,
      payload: p.payload,
    })
    .select("id")
    .single();
  if (error) throw new Error(`cannot record the system's decision: ${error.message}`);
  return data.id;
}

/** A run waiting for a word as a workspace's own read takes it: what the count asks of it, and what names it. */
export interface WaitingRunRow {
  id: string;
  name: string;
  state: string;
  playbook_id: string | null;
  run_for: string | null;
  audience: unknown;
  recipient_count: number;
  created_at: string;
  /** A going reach-out run's emails the check holds for the owner's say (contracts runHeldEmails). */
  held?: number;
  /** And those handed to its owner to send from their inbox (contracts runDraftedEmails, 00429). */
  drafted?: number;
}

const WAITING_RUN_COLUMNS = "id, name, state, playbook_id:step_id, run_for, audience, recipient_count, created_at";

/**
 * One workspace's runs waiting for a word, newest first, on the session's client (RLS decides): those waiting for
 * approval (two hundred at most), and the going reach-out runs whose check holds emails for the owner's say, or whose
 * emails are handed to their owner to send (00429), with how many of each (runWaitingCounts). What the server's Today counts
 * as waiting on you (contracts runsThatWait, by the verb's own day rule, runHeldEmails and runDraftedEmails) and Ask's
 * today tool names. A read that fails throws.
 */
export async function waitingRunsOf(db: Db, tenantId: string): Promise<WaitingRunRow[]> {
  const [pending, going] = await Promise.all([
    db
      .from("sequence_batches")
      .select(WAITING_RUN_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("state", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("sequence_batches")
      .select(WAITING_RUN_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("state", [...RUN_GOING_STATES])
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (pending.error) throw new Error(`cannot read the runs waiting for approval: ${pending.error.message}`);
  if (going.error) throw new Error(`cannot read the going runs: ${going.error.message}`);
  const reaching = (going.data ?? []).filter((r) => isReachOutRun(r.audience));
  const runIds = reaching.map((r) => r.id);
  const waiting = reaching.length ? await runWaitingCounts(db, { tenantId, runIds }) : null;
  const holding = reaching.flatMap((r) => {
    const w = waiting?.get(r.id);
    return w ? [{ ...r, held: w.held, drafted: w.drafted }] : [];
  });
  return [...(pending.data ?? []), ...holding].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** A run set to go, as Going today reads it (decision 0064): when it goes, and what names it. */
export interface GoingRunRow {
  id: string;
  name: string;
  state: string;
  playbook_id: string | null;
  scheduled_for: string | null;
  recipient_count: number;
  audience: unknown;
}

/**
 * One workspace's runs set to start between two instants, soonest first (a hundred at most), on the session's client (RLS
 * decides): what goes on its own unless stopped (contracts goingTodayOf, which keeps those on the business's day). A read
 * that fails throws.
 */
export async function runsGoingBetween(db: Db, tenantId: string, from: Date, until: Date): Promise<GoingRunRow[]> {
  const { data, error } = await db
    .from("sequence_batches")
    .select("id, name, state, playbook_id:step_id, scheduled_for, recipient_count, audience")
    .eq("tenant_id", tenantId)
    .eq("state", "scheduled")
    .gt("scheduled_for", from.toISOString())
    .lte("scheduled_for", until.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(100);
  if (error) throw new Error(`cannot read the runs set to go: ${error.message}`);
  return data ?? [];
}

/**
 * The runs the bell's notices name, by id, in whatever state each is now, with how many emails a going reach-out run's check
 * holds or has handed to its owner (runWaitingCounts): what Ask's read of the notices judges each by (contracts noticeStillWaits), as the bell judges by the runs Sent
 * holds, so a run approved, sent or stopped is no longer listed as waiting (the wiring's second audit, R13 X5-1). On the
 * session's client (RLS decides). A read that fails throws.
 */
export async function runsNamed(db: Db, tenantId: string, ids: readonly string[]): Promise<WaitingRunRow[]> {
  if (!ids.length) return [];
  const { data, error } = await db
    .from("sequence_batches")
    .select(WAITING_RUN_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("id", [...ids]);
  if (error) throw new Error(`cannot read the runs the notices name: ${error.message}`);
  const rows = data ?? [];
  const reaching = rows.filter(
    (r) => isReachOutRun(r.audience) && (RUN_GOING_STATES as readonly string[]).includes(r.state),
  );
  const waiting = reaching.length ? await runWaitingCounts(db, { tenantId, runIds: reaching.map((r) => r.id) }) : null;
  return rows.map((r) => {
    const w = waiting?.get(r.id);
    return w ? { ...r, held: w.held, drafted: w.drafted } : r;
  });
}

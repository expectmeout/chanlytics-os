/**
 * A playbook's and a reach-out chain's runs as the edge's clocks start and record them (decision 0111): the step, the
 * run already made for a moment, a batch moved from scheduled to sending to sent, the chain waiting on an owner, the
 * leads' clocks a send is planned by, the run planned through its door (reach_out_plan_run) and recorded through its own
 * (playbook_run_record), with its stamp or its decision.
 * Each answer is the database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../types";
import { platformWide } from "../../../shared/tenant-db";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** One of the workspace's steps (a playbook, or a chain's step), whole, or none. */
export const findStepRow = async (db: Db, tenantId: TenantId, stepId: string) =>
  db.from("sequence_steps").select("*").eq("tenant_id", tenantId).eq("id", stepId).maybeSingle();

/** These steps of the workspace's, as a chain's sends are planned by: their gaps, mailboxes, order and who sends. */
export const listChainSteps = async (db: Db, tenantId: TenantId, stepIds: string[]) =>
  db
    .from("sequence_steps")
    .select("id, gap_minutes, mailbox_ids, after_step_id, owner_sends")
    .eq("tenant_id", tenantId)
    .in("id", stepIds);

/**
 * A step's run recorded (playbook_run_record, 00722): playbook.run with what it made or why nothing, and in the same
 * transaction the step stamped with the day it ran for (`stamp`: the day's run alone), or the system's decision for a
 * batch the sweep scheduled without its owner's yes (`decision`).
 */
export const recordStepRun = async (
  db: Db,
  tenantId: TenantId,
  stepId: string,
  data: Json,
  also: { stamp?: { run_for: string; at: string }; decision?: { broadcast_id: string; payload: Json } } = {},
) =>
  db.rpc("playbook_run_record", {
    p_tenant_id: tenantId,
    p_playbook_id: stepId,
    p_data: data,
    ...(also.stamp ? { p_stamp: also.stamp } : {}),
    ...(also.decision ? { p_decision: also.decision } : {}),
  });

/** The run a step already made for a moment, or none. */
export const findRunFor = async (db: Db, tenantId: TenantId, stepId: string, runFor: string) =>
  db
    .from("sequence_batches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("step_id", stepId)
    .eq("run_for", runFor)
    .maybeSingle();

/**
 * The runs of a reach-out chain still waiting on the owner's yes, each with its step: none where none waits. A chain has
 * a handful of steps and a step one waiting run at a time (core runReachOut), so the page is the chain's whole.
 */
export const findChainAwaitingApproval = async (db: Db, tenantId: TenantId, rootId: string) =>
  db
    .from("sequence_batches")
    .select("id, step_id")
    .eq("tenant_id", tenantId)
    .eq("audience->>kind", "reach_out")
    .eq("audience->>root_id", rootId)
    .eq("state", "pending_approval")
    .limit(50);

/** A scheduled batch, whichever workspace's, moved to sending: only from scheduled. */
export const startBatchSending = async (db: Db, batchId: string) =>
  platformWide(db).from("sequence_batches").update({ state: "sending" }).eq("id", batchId).eq("state", "scheduled");

/** A sending batch, whichever workspace's, moved to sent at `at`, its id back: none when it was not sending. */
export const finishBatchSending = async (db: Db, batchId: string, at: string) =>
  platformWide(db)
    .from("sequence_batches")
    .update({ state: "sent", finished_at: at })
    .eq("id", batchId)
    .eq("state", "sending")
    .select("id");

/** A scheduled run nobody could be told of, moved to waiting on its owner's yes, its id back: none when it was not scheduled. */
export const holdBatchForOk = async (db: Db, tenantId: TenantId, batchId: string) =>
  db
    .from("sequence_batches")
    .update({ state: "pending_approval" })
    .eq("tenant_id", tenantId)
    .eq("id", batchId)
    .eq("state", "scheduled")
    .select("id");

/** These leads' clocks, as a reach-out send is timed by: their region and hours. */
export const listLeadClocks = async (db: Db, tenantId: TenantId, leadIds: string[]) =>
  db.from("leads").select("id, region, hours").eq("tenant_id", tenantId).in("id", leadIds);

/** A reach-out run and its sends planned in one statement (reach_out_plan_run). */
export const planReachOutRun = async (db: Db, run: Json, sends: Json) =>
  db.rpc("reach_out_plan_run", { p_run: run, p_sends: sends });

/** A booking the workspace's calendar saw, counted to the reach-out that brought it (reach_out_booked). */
export const recordReachOutBooked = async (db: Db, args: Database["public"]["Functions"]["reach_out_booked"]["Args"]) =>
  db.rpc("reach_out_booked", args);

/** A step paused. */
export const pauseStepRow = async (db: Db, stepId: string) =>
  db.from("sequence_steps").update({ state: "paused" }).eq("id", stepId);

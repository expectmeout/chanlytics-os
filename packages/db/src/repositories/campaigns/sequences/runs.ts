/**
 * A playbook's and a reach-out chain's runs as the edge's clocks start and record them (decision 0111): the step, the
 * run already made for a moment, a batch moved from scheduled to sending to sent, the chain waiting on an owner, the
 * leads' clocks a send is planned by, the run planned through its door (reach_out_plan_run) and the decision kept.
 * Each answer is the database's as it came; the caller says a failure in its words.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../../../types";
import { platformWide } from "../../../shared/tenant-db";

type Db = SupabaseClient<Database>;

/** One of the workspace's steps (a playbook, or a chain's step), whole, or none. */
export const findStepRow = async (db: Db, tenantId: string, stepId: string) =>
  db.from("sequence_steps").select("*").eq("tenant_id", tenantId).eq("id", stepId).maybeSingle();

/** These steps of the workspace's, as a chain's sends are planned by: their gaps, mailboxes, order and who sends. */
export const listChainSteps = async (db: Db, tenantId: string, stepIds: string[]) =>
  db
    .from("sequence_steps")
    .select("id, gap_minutes, mailbox_ids, after_step_id, owner_sends")
    .eq("tenant_id", tenantId)
    .in("id", stepIds);

/** One of the workspace's steps stamped with the moment it last ran for, and when. */
export const stampStepRun = async (db: Db, tenantId: string, stepId: string, runFor: string, at: string) =>
  db
    .from("sequence_steps")
    .update({ last_run_for: runFor, last_run_at: at })
    .eq("id", stepId)
    .eq("tenant_id", tenantId);

/** The run a step already made for a moment, or none. */
export const findRunFor = async (db: Db, tenantId: string, stepId: string, runFor: string) =>
  db
    .from("sequence_batches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("step_id", stepId)
    .eq("run_for", runFor)
    .maybeSingle();

/** One run of a reach-out chain still waiting on the owner's yes, or none. */
export const findChainAwaitingApproval = async (db: Db, tenantId: string, rootId: string) =>
  db
    .from("sequence_batches")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("audience->>kind", "reach_out")
    .eq("audience->>root_id", rootId)
    .eq("state", "pending_approval")
    .limit(1);

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

/** These leads' clocks, as a reach-out send is timed by: their region and hours. */
export const listLeadClocks = async (db: Db, tenantId: string, leadIds: string[]) =>
  db.from("leads").select("id, region, hours").eq("tenant_id", tenantId).in("id", leadIds);

/** A reach-out run and its sends planned in one statement (reach_out_plan_run). */
export const planReachOutRun = async (db: Db, run: Json, sends: Json) =>
  db.rpc("reach_out_plan_run", { p_run: run, p_sends: sends });

/** A decision kept on the workspace's record. */
export const insertDecision = async (db: Db, row: Database["public"]["Tables"]["decisions"]["Insert"]) =>
  db.from("decisions").insert(row);

/** A booking the workspace's calendar saw, counted to the reach-out that brought it (reach_out_booked). */
export const recordReachOutBooked = async (db: Db, args: Database["public"]["Functions"]["reach_out_booked"]["Args"]) =>
  db.rpc("reach_out_booked", args);

/** A step paused. */
export const pauseStepRow = async (db: Db, stepId: string) =>
  db.from("sequence_steps").update({ state: "paused" }).eq("id", stepId);
